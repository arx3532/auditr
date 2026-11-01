import type {
  ApprovalResolvedEvent,
  ChatEvent,
  DraftEdits,
  Invoice,
  Payment,
  PaymentApproval,
  ResumeDecision,
} from '@/lib/api/types'

/**
 * idle -> streaming -> awaiting_approval -> resuming -> streaming -> idle, plus error.
 * `resuming` is the window after a decision is sent and before the server starts replying.
 */
export type ChatStatus = 'idle' | 'streaming' | 'awaiting_approval' | 'resuming' | 'error'

export type ApprovalDecisionState =
  | { kind: 'pending' }
  | { kind: 'submitting'; decision: ResumeDecision }
  /** `invoice` is the issued invoice, or the invoice a payment was recorded against. */
  | { kind: 'approved'; invoice?: Invoice; payment?: Payment }
  | { kind: 'rejected' }
  | { kind: 'expired' }

type SubmittingState = Extract<ApprovalDecisionState, { kind: 'submitting' }>

interface ApprovalMessageBase {
  id: string
  role: 'approval'
  approvalId: string
  expiresAt: string
  decision: ApprovalDecisionState
}

/** A draft invoice waiting to be issued. */
export interface InvoiceApprovalMessage extends ApprovalMessageBase {
  kind: 'invoice'
  draft: Invoice
}

/** A payment waiting to be recorded. */
export interface PaymentApprovalMessage extends ApprovalMessageBase {
  kind: 'payment'
  payment: PaymentApproval
}

export type ApprovalMessage = InvoiceApprovalMessage | PaymentApprovalMessage

export type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string }
  | ApprovalMessage

export interface ChatError {
  code: string
  message: string
  retryable: boolean
}

/** What to repeat when the user presses Retry. */
export type ChatRequestRecord =
  { kind: 'send'; text: string } | { kind: 'decide'; decision: ResumeDecision; edits?: DraftEdits }

export interface ChatState {
  status: ChatStatus
  threadId: string | undefined
  messages: ChatMessage[]
  /** Tool the assistant is running right now, for the status indicator. */
  activeTool: string | undefined
  error: ChatError | undefined
  lastRequest: ChatRequestRecord | undefined
  nextId: number
}

export type ChatAction =
  | { type: 'restore'; threadId: string }
  | { type: 'rehydrate'; threadId: string; pendingApproval: import('@/lib/api/types').PendingApprovalPayload }
  | { type: 'send_started'; text: string }
  | { type: 'send_restarted' }
  | { type: 'decision_started'; decision: ResumeDecision; edits?: DraftEdits }
  | { type: 'stream_opened' }
  | { type: 'event'; event: ChatEvent }
  | { type: 'failed'; error: ChatError }
  | { type: 'aborted' }
  | { type: 'new_thread' }

export const initialChatState: ChatState = {
  status: 'idle',
  threadId: undefined,
  messages: [],
  activeTool: undefined,
  error: undefined,
  lastRequest: undefined,
  nextId: 1,
}

export function findPendingApproval(messages: ChatMessage[]): ApprovalMessage | undefined {
  return messages.find(
    (message): message is ApprovalMessage =>
      message.role === 'approval' && message.decision.kind === 'pending',
  )
}

function settledStatus(messages: ChatMessage[]): ChatStatus {
  return findPendingApproval(messages) ? 'awaiting_approval' : 'idle'
}

function appendMessage(state: ChatState, build: (id: string) => ChatMessage): ChatState {
  return {
    ...state,
    messages: [...state.messages, build(`m${state.nextId}`)],
    nextId: state.nextId + 1,
  }
}

function mapSubmitting(
  messages: ChatMessage[],
  next: (current: SubmittingState) => ApprovalDecisionState,
): ChatMessage[] {
  return messages.map((message) =>
    message.role === 'approval' && message.decision.kind === 'submitting'
      ? { ...message, decision: next(message.decision) }
      : message,
  )
}

/** A fresh, undecided approval card for a draft invoice or a payment. */
function pendingCard(
  id: string,
  source: { approvalId: string; expiresAt: string } & (
    | { draft: Invoice; payment?: undefined }
    | { payment: PaymentApproval; draft?: undefined }
  ),
): ApprovalMessage {
  const base = {
    id,
    role: 'approval',
    approvalId: source.approvalId,
    expiresAt: source.expiresAt,
    decision: { kind: 'pending' },
  } as const
  return source.draft
    ? { ...base, kind: 'invoice', draft: source.draft }
    : { ...base, kind: 'payment', payment: source.payment }
}

/** The final card state for a decision the server has resolved. */
function resolvedDecision(event: ApprovalResolvedEvent): ApprovalDecisionState {
  switch (event.outcome) {
    case 'approved':
      return { kind: 'approved', invoice: event.invoice, payment: event.payment }
    case 'rejected':
      return { kind: 'rejected' }
    case 'expired':
      return { kind: 'expired' }
  }
}

function failWith(state: ChatState, error: ChatError): ChatState {
  const messages = mapSubmitting(state.messages, () => ({ kind: 'pending' }))

  // A decision whose card already reached a final state (for example the invoice was
  // issued before the connection dropped) has nothing left to retry.
  if (state.lastRequest?.kind === 'decide' && !findPendingApproval(messages)) {
    return {
      ...state,
      messages,
      status: 'idle',
      activeTool: undefined,
      error: undefined,
      lastRequest: undefined,
    }
  }
  return { ...state, messages, status: 'error', activeTool: undefined, error }
}

function expireApprovals(state: ChatState): ChatState {
  const messages = state.messages.map((message) =>
    message.role === 'approval' &&
    (message.decision.kind === 'pending' || message.decision.kind === 'submitting')
      ? { ...message, decision: { kind: 'expired' } as const }
      : message,
  )
  return {
    ...state,
    messages,
    status: 'idle',
    activeTool: undefined,
    error: undefined,
    lastRequest: undefined,
  }
}

function applyEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'thread':
      return { ...state, threadId: event.threadId }

    case 'text_delta': {
      if (event.text === '') return state
      const last = state.messages.at(-1)
      if (last?.role === 'assistant') {
        const grown: ChatMessage = { ...last, text: last.text + event.text }
        return { ...state, messages: [...state.messages.slice(0, -1), grown] }
      }
      return appendMessage(state, (id) => ({ id, role: 'assistant', text: event.text }))
    }

    case 'tool_start':
      return { ...state, activeTool: event.tool }

    case 'tool_end':
      return state.activeTool === event.tool ? { ...state, activeTool: undefined } : state

    case 'approval_required': {
      // An edit is answered with a new draft, which replaces the card being edited.
      const remaining = state.messages.filter(
        (message) =>
          !(
            message.role === 'approval' &&
            message.decision.kind === 'submitting' &&
            message.decision.decision === 'edit'
          ),
      )
      return appendMessage(
        {
          ...state,
          messages: remaining,
          status: 'awaiting_approval',
          activeTool: undefined,
          lastRequest: undefined,
        },
        (id) => pendingCard(id, event),
      )
    }

    case 'approval_resolved': {
      // Sent before the model's follow-up text. Settle the card it names, and only that card.
      const decision = resolvedDecision(event)
      const messages = state.messages.map((message) =>
        message.role === 'approval' &&
        message.approvalId === event.approvalId &&
        (message.decision.kind === 'submitting' || message.decision.kind === 'pending')
          ? { ...message, decision }
          : message,
      )
      return { ...state, messages }
    }

    case 'error':
      return event.code === 'approval_expired'
        ? expireApprovals(state)
        : failWith(state, { code: event.code, message: event.message, retryable: true })

    case 'done': {
      const messages = mapSubmitting(state.messages, (current): ApprovalDecisionState => {
        if (current.decision === 'reject') return { kind: 'rejected' }
        if (current.decision === 'approve') return { kind: 'approved' }
        return { kind: 'pending' }
      })
      return {
        ...state,
        messages,
        status: settledStatus(messages),
        activeTool: undefined,
        error: undefined,
        lastRequest: undefined,
      }
    }
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'restore':
      return state.threadId ? state : { ...state, threadId: action.threadId }

    case 'rehydrate': {
      // Only apply if we have no messages yet — SSE has not started since the restore.
      // If a draft is present, inject it as a pending approval card so the user can act.
      if (state.messages.length > 0) return state
      const { pendingApproval, threadId } = action
      const stateWithThread = state.threadId ? state : { ...state, threadId }
      // A draft and a payment are restored the same way: as a pending card the user can act on.
      const { approvalId, expiresAt, draft, payment } = pendingApproval
      const source = draft
        ? { approvalId, expiresAt, draft }
        : payment
          ? { approvalId, expiresAt, payment }
          : undefined
      if (!source) return stateWithThread
      return appendMessage(
        { ...stateWithThread, status: 'awaiting_approval' },
        (id) => pendingCard(id, source),
      )
    }

    case 'send_started':
      return appendMessage(
        {
          ...state,
          status: 'streaming',
          error: undefined,
          lastRequest: { kind: 'send', text: action.text },
        },
        (id) => ({ id, role: 'user', text: action.text }),
      )

    case 'send_restarted':
      return { ...state, status: 'streaming', error: undefined }

    case 'decision_started':
      return {
        ...state,
        status: 'resuming',
        error: undefined,
        lastRequest: { kind: 'decide', decision: action.decision, edits: action.edits },
        messages: state.messages.map((message) =>
          message.role === 'approval' && message.decision.kind === 'pending'
            ? { ...message, decision: { kind: 'submitting', decision: action.decision } }
            : message,
        ),
      }

    case 'stream_opened':
      return state.status === 'resuming' ? { ...state, status: 'streaming' } : state

    case 'event':
      return applyEvent(state, action.event)

    case 'failed':
      // Editing an expired approval is refused with HTTP 409 before any stream opens, so the
      // expiry arrives here as an error code rather than as an `approval_resolved` event.
      return action.error.code === 'approval_expired'
        ? expireApprovals(state)
        : failWith(state, action.error)

    case 'aborted': {
      const messages = mapSubmitting(state.messages, () => ({ kind: 'pending' }))
      return {
        ...state,
        messages,
        status: settledStatus(messages),
        activeTool: undefined,
        error: undefined,
        lastRequest: undefined,
      }
    }

    case 'new_thread':
      return initialChatState
  }
}