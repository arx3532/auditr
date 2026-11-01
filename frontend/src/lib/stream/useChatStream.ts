'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'

import { isAbortError, isApiError } from '@/lib/api/client'
import type { ApiEndpoints } from '@/lib/api/endpoints'
import type { DraftEdits, ResumeDecision } from '@/lib/api/types'
import { createIdempotencyKey } from '@/lib/idempotency'

import { decodeChatEvent } from './chatEvent'
import {
  chatReducer,
  findPendingApproval,
  initialChatState,
  type ApprovalMessage,
  type ChatError,
  type ChatState,
} from './chatState'
import { StreamProtocolError } from './errors'
import { parseSse } from './parseSse'
import { sessionThreadStorage, type ThreadStorage } from './threadStorage'

type ChatApi = Pick<ApiEndpoints, 'startChat' | 'resumeChat' | 'getThread'>

export interface UseChatStreamOptions {
  /** Where the thread id is kept between page loads. Keep the reference stable. */
  storage?: ThreadStorage
}

export interface UseChatStream {
  state: ChatState
  /** The composer may be used: nothing is streaming and no draft is waiting for a decision. */
  canSend: boolean
  /** A draft is waiting and no request for it is in flight. */
  canDecide: boolean
  send: (text: string) => void
  decide: (decision: ResumeDecision, edits?: DraftEdits) => void
  /** Aborts the request in flight. Safe to call at any time. */
  stop: () => void
  /** Repeats the failed request. A decision is repeated with its original idempotency key. */
  retry: () => void
  newThread: () => void
}

/** After one of these the server is done talking until the user acts, so reading stops. */
const TERMINAL_EVENTS: ReadonlySet<string> = new Set(['done', 'error', 'approval_required'])

const DROPPED_ERROR: ChatError = {
  code: 'stream_dropped',
  message: 'The connection was interrupted before the reply finished. Please try again.',
  retryable: true,
}

function toChatError(error: unknown): ChatError {
  if (isApiError(error)) {
    return { code: error.code, message: error.message, retryable: error.retryable }
  }
  if (error instanceof StreamProtocolError) {
    return { code: error.code, message: error.message, retryable: true }
  }
  return DROPPED_ERROR
}

export function useChatStream(
  api: ChatApi,
  { storage = sessionThreadStorage }: UseChatStreamOptions = {},
): UseChatStream {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)

  // Callbacks read the latest state through a ref so their identity stays stable.
  const stateRef = useRef(state)
  const controllerRef = useRef<AbortController | null>(null)
  // Set synchronously, so a double click cannot start two requests before state updates.
  const busyRef = useRef(false)
  const decisionKeyRef = useRef<{ fingerprint: string; key: string } | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const saved = storage.load()
    if (saved) dispatch({ type: 'restore', threadId: saved })
  }, [storage])

  // After the thread id is restored from storage, query the server for any
  // pending approval that was in-flight before the page was refreshed.
  // We only run this once per mount (api reference is stable via useMemo).
  useEffect(() => {
    const threadId = storage.load()
    if (!threadId) return

    let cancelled = false
    void api.getThread(threadId).then((view) => {
      if (cancelled || !view.pendingApproval) return
      dispatch({ type: 'rehydrate', threadId: view.threadId, pendingApproval: view.pendingApproval })
    }).catch(() => {
      // Silently ignore — a 404 means the thread expired or belongs to a different user.
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs once on mount; api and storage references are stable

  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  const run = useCallback(
    async (open: (signal: AbortSignal) => Promise<Response>): Promise<void> => {
      const controller = new AbortController()
      controllerRef.current = controller
      busyRef.current = true
      let sawTerminal = false

      try {
        const response = await open(controller.signal)
        if (!response.body) {
          throw new StreamProtocolError('not_event_stream', 'The server did not return a streaming response.')
        }
        dispatch({ type: 'stream_opened' })

        for await (const data of parseSse(response.body, controller.signal)) {
          if (controller.signal.aborted) break
          const event = decodeChatEvent(data)
          if (!event) continue

          if (event.type === 'thread') storage.save(event.threadId)
          dispatch({ type: 'event', event })

          if (TERMINAL_EVENTS.has(event.type)) {
            sawTerminal = true
            break
          }
        }

        if (!sawTerminal) {
          dispatch(controller.signal.aborted ? { type: 'aborted' } : { type: 'failed', error: DROPPED_ERROR })
        }
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) dispatch({ type: 'aborted' })
        else dispatch({ type: 'failed', error: toChatError(error) })
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null
        busyRef.current = false
      }
    },
    [storage],
  )

  const beginSend = useCallback(
    (text: string, isRetry: boolean) => {
      const threadId = stateRef.current.threadId
      dispatch(isRetry ? { type: 'send_restarted' } : { type: 'send_started', text })
      void run((signal) => api.startChat(threadId ? { threadId, message: text } : { message: text }, signal))
    },
    [api, run],
  )

  const keyForDecision = useCallback(
    (approvalId: string, decision: ResumeDecision, edits: DraftEdits | undefined): string => {
      const fingerprint = JSON.stringify([approvalId, decision, edits ?? null])
      if (decisionKeyRef.current?.fingerprint !== fingerprint) {
        decisionKeyRef.current = { fingerprint, key: createIdempotencyKey() }
      }
      return decisionKeyRef.current.key
    },
    [],
  )

  const beginDecision = useCallback(
    (approval: ApprovalMessage, decision: ResumeDecision, edits: DraftEdits | undefined) => {
      const threadId = stateRef.current.threadId
      if (!threadId) return

      const payloadEdits = decision === 'edit' ? edits : undefined
      const key = keyForDecision(approval.approvalId, decision, payloadEdits)
      dispatch({ type: 'decision_started', decision, edits: payloadEdits })
      void run((signal) =>
        api.resumeChat(
          payloadEdits
            ? { threadId, approvalId: approval.approvalId, decision, edits: payloadEdits }
            : { threadId, approvalId: approval.approvalId, decision },
          key,
          signal,
        ),
      )
    },
    [api, keyForDecision, run],
  )

  const send = useCallback(
    (text: string) => {
      const message = text.trim()
      const { status, messages } = stateRef.current
      const composerOpen = status === 'idle' || (status === 'error' && !findPendingApproval(messages))
      if (message === '' || busyRef.current || !composerOpen) return
      beginSend(message, false)
    },
    [beginSend],
  )

  const decide = useCallback(
    (decision: ResumeDecision, edits?: DraftEdits) => {
      const approval = findPendingApproval(stateRef.current.messages)
      if (!approval || busyRef.current) return
      beginDecision(approval, decision, edits)
    },
    [beginDecision],
  )

  const retry = useCallback(() => {
    const { status, lastRequest, messages } = stateRef.current
    if (busyRef.current || status !== 'error' || !lastRequest) return

    if (lastRequest.kind === 'send') {
      beginSend(lastRequest.text, true)
      return
    }
    const approval = findPendingApproval(messages)
    if (approval) beginDecision(approval, lastRequest.decision, lastRequest.edits)
  }, [beginDecision, beginSend])

  const stop = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  const newThread = useCallback(() => {
    controllerRef.current?.abort()
    storage.clear()
    decisionKeyRef.current = null
    dispatch({ type: 'new_thread' })
  }, [storage])

  const hasPendingApproval = findPendingApproval(state.messages) !== undefined

  return {
    state,
    canSend: state.status === 'idle' || (state.status === 'error' && !hasPendingApproval),
    canDecide: hasPendingApproval && (state.status === 'awaiting_approval' || state.status === 'error'),
    send,
    decide,
    stop,
    retry,
    newThread,
  }
}
