import { describe, expect, it } from 'vitest'

import type { ChatEvent } from '@/lib/api/types'
import {
  chatReducer,
  findPendingApproval,
  initialChatState,
  type ChatAction,
  type ChatState,
} from '@/lib/stream/chatState'
import { createInitialRecords } from '@/mocks/fixtures'

const draft = createInitialRecords()[0].invoice

function run(actions: ChatAction[], from: ChatState = initialChatState): ChatState {
  return actions.reduce(chatReducer, from)
}

function event(value: ChatEvent): ChatAction {
  return { type: 'event', event: value }
}

const approval = (approvalId: string): ChatEvent => ({
  type: 'approval_required',
  approvalId,
  expiresAt: '2030-01-01T00:00:00Z',
  draft,
})

const awaitingApproval = run([
  { type: 'send_started', text: 'Invoice AdTech' },
  event({ type: 'thread', threadId: 'thr_1' }),
  event(approval('apr_1')),
])

describe('chatReducer', () => {
  it('moves idle to streaming and records the user message', () => {
    const state = run([{ type: 'send_started', text: 'hello' }])
    expect(state.status).toBe('streaming')
    expect(state.messages).toEqual([{ id: 'm1', role: 'user', text: 'hello' }])
  })

  it('merges consecutive text deltas into one assistant message', () => {
    const state = run([
      { type: 'send_started', text: 'hi' },
      event({ type: 'text_delta', text: 'Hel' }),
      event({ type: 'text_delta', text: 'lo' }),
    ])
    expect(state.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(state.messages[1]).toMatchObject({ text: 'Hello' })
  })

  it('tracks the active tool between tool_start and tool_end', () => {
    const started = run([{ type: 'send_started', text: 'hi' }, event({ type: 'tool_start', tool: 'lookup' })])
    expect(started.activeTool).toBe('lookup')

    const finished = chatReducer(started, event({ type: 'tool_end', tool: 'lookup' }))
    expect(finished.activeTool).toBeUndefined()
  })

  it('returns to idle on done', () => {
    const state = run([
      { type: 'send_started', text: 'hi' },
      event({ type: 'text_delta', text: 'Hi' }),
      event({ type: 'done' }),
    ])
    expect(state.status).toBe('idle')
    expect(state.lastRequest).toBeUndefined()
  })

  it('shows an inline approval card and waits for a decision', () => {
    expect(awaitingApproval.status).toBe('awaiting_approval')
    expect(findPendingApproval(awaitingApproval.messages)).toMatchObject({
      approvalId: 'apr_1',
      draft,
      decision: { kind: 'pending' },
    })
  })

  it('stays awaiting approval when done follows the approval request', () => {
    const state = chatReducer(awaitingApproval, event({ type: 'done' }))
    expect(state.status).toBe('awaiting_approval')
  })

  it('walks resuming, streaming and approved when the invoice is issued', () => {
    const resuming = chatReducer(awaitingApproval, { type: 'decision_started', decision: 'approve' })
    expect(resuming.status).toBe('resuming')
    expect(findPendingApproval(resuming.messages)).toBeUndefined()

    const streaming = chatReducer(resuming, { type: 'stream_opened' })
    expect(streaming.status).toBe('streaming')

    const issued = run(
      [event({ type: 'invoice_issued', invoice: draft }), event({ type: 'done' })],
      streaming,
    )
    expect(issued.status).toBe('idle')
    expect(issued.messages.at(-1)).toMatchObject({ decision: { kind: 'approved', invoice: draft } })
  })

  it('marks the card rejected after a reject decision completes', () => {
    const state = run(
      [{ type: 'decision_started', decision: 'reject' }, { type: 'stream_opened' }, event({ type: 'done' })],
      awaitingApproval,
    )
    expect(state.status).toBe('idle')
    expect(state.messages.at(-1)).toMatchObject({ decision: { kind: 'rejected' } })
  })

  it('replaces the card being edited with the recalculated draft', () => {
    const state = run(
      [
        {
          type: 'decision_started',
          decision: 'edit',
          edits: { items: [{ description: 'Design', taxableValue: '60000.00', gstRate: '18' }] },
        },
        { type: 'stream_opened' },
        event({ type: 'text_delta', text: 'Updated.' }),
        event(approval('apr_2')),
      ],
      awaitingApproval,
    )

    const cards = state.messages.filter((m) => m.role === 'approval')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ approvalId: 'apr_2', decision: { kind: 'pending' } })
    expect(state.status).toBe('awaiting_approval')
  })

  it('expires the card and returns to idle on an approval_expired error', () => {
    const state = run(
      [
        { type: 'decision_started', decision: 'approve' },
        { type: 'stream_opened' },
        event({ type: 'error', code: 'approval_expired', message: 'Expired.' }),
      ],
      awaitingApproval,
    )
    expect(state.status).toBe('idle')
    expect(state.error).toBeUndefined()
    expect(state.messages.at(-1)).toMatchObject({ decision: { kind: 'expired' } })
  })

  it('enters the error state on an error event and remembers what to retry', () => {
    const state = run([
      { type: 'send_started', text: 'hi' },
      event({ type: 'error', code: 'upstream_unavailable', message: 'Down.' }),
    ])
    expect(state.status).toBe('error')
    expect(state.error).toEqual({ code: 'upstream_unavailable', message: 'Down.', retryable: true })
    expect(state.lastRequest).toEqual({ kind: 'send', text: 'hi' })
  })

  it('puts the card back to pending when a decision fails', () => {
    const state = run(
      [
        { type: 'decision_started', decision: 'approve' },
        { type: 'failed', error: { code: 'network_error', message: 'Offline.', retryable: true } },
      ],
      awaitingApproval,
    )
    expect(state.status).toBe('error')
    expect(findPendingApproval(state.messages)).toBeDefined()
    expect(state.lastRequest).toEqual({ kind: 'decide', decision: 'approve', edits: undefined })
  })

  it('does not report an error when the connection drops after the invoice was issued', () => {
    const state = run(
      [
        { type: 'decision_started', decision: 'approve' },
        { type: 'stream_opened' },
        event({ type: 'invoice_issued', invoice: draft }),
        { type: 'failed', error: { code: 'stream_dropped', message: 'Dropped.', retryable: true } },
      ],
      awaitingApproval,
    )
    expect(state.status).toBe('idle')
    expect(state.error).toBeUndefined()
    expect(state.messages.at(-1)).toMatchObject({ decision: { kind: 'approved' } })
  })

  it('goes idle on abort and clears the tool indicator', () => {
    const state = run([
      { type: 'send_started', text: 'hi' },
      event({ type: 'tool_start', tool: 'lookup' }),
      { type: 'aborted' },
    ])
    expect(state.status).toBe('idle')
    expect(state.activeTool).toBeUndefined()
  })

  it('returns to awaiting approval when a decision is aborted', () => {
    const state = run(
      [{ type: 'decision_started', decision: 'approve' }, { type: 'aborted' }],
      awaitingApproval,
    )
    expect(state.status).toBe('awaiting_approval')
    expect(findPendingApproval(state.messages)).toBeDefined()
  })

  it('restores a saved thread id without overriding an active one', () => {
    expect(chatReducer(initialChatState, { type: 'restore', threadId: 'thr_saved' }).threadId).toBe(
      'thr_saved',
    )
    expect(chatReducer(awaitingApproval, { type: 'restore', threadId: 'thr_saved' }).threadId).toBe('thr_1')
  })

  it('resets everything for a new thread', () => {
    expect(chatReducer(awaitingApproval, { type: 'new_thread' })).toEqual(initialChatState)
  })
})
