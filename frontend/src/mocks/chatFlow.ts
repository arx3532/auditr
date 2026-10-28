import type { ChatEvent, ChatResumeRequest, DraftEdits, Invoice } from '@/lib/api/types'

import { CUSTOMERS, customerById, isoDate, serviceItem } from './fixtures'
import type { MockScenario } from './scenario'
import { eventSteps, type ScriptStep } from './scriptedStream'
import { buildInvoice } from './serverMath'
import { getMockState } from './state'

const APPROVAL_TTL_MS = 15 * 60_000
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type DecisionResult =
  { ok: true; events: ChatEvent[] } | { ok: false; status: number; code: string; message: string }

function shortId(): string {
  return crypto.randomUUID().slice(0, 8)
}

function text(value: string): ChatEvent {
  return { type: 'text_delta', text: value }
}

function nextFifteenth(now: Date): string {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const target = now.getUTCDate() < 15 ? Date.UTC(year, month, 15) : Date.UTC(year, month + 1, 15)
  return new Date(target).toISOString().slice(0, 10)
}

function approvalEvent(draft: Invoice, scenario: MockScenario): ChatEvent {
  const offset = scenario === 'expired' ? -60_000 : APPROVAL_TTL_MS
  return {
    type: 'approval_required',
    approvalId: `apr_${shortId()}`,
    expiresAt: new Date(Date.now() + offset).toISOString(),
    draft,
  }
}

function overdueSteps(threadId: string): ScriptStep[] {
  const overdue = getMockState()
    .records.map((record) => record.invoice)
    .filter((invoice) => invoice.status === 'overdue')

  const summary =
    overdue.length === 0
      ? 'You have no overdue invoices.'
      : `You have ${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}: ` +
        overdue
          .map(
            (invoice) =>
              `${invoice.number} (${invoice.customer.name}), ₹${invoice.amountDue} due ${invoice.dueDate}`,
          )
          .join('; ') +
        '.'

  return eventSteps([
    { type: 'thread', threadId },
    { type: 'tool_start', tool: 'list_overdue_invoices' },
    { type: 'tool_end', tool: 'list_overdue_invoices' },
    text(summary.slice(0, 40)),
    text(summary.slice(40)),
    { type: 'done' },
  ])
}

/** Scripted reply to `POST /chat`. Mentioning "overdue" skips the approval flow. */
export function startChat(message: string, threadId: string, scenario: MockScenario): ScriptStep[] {
  if (scenario === 'error') {
    return eventSteps([
      { type: 'thread', threadId },
      text('Let me look into that. '),
      {
        type: 'error',
        code: 'upstream_unavailable',
        message: 'The assistant is temporarily unavailable. Please try again.',
      },
    ])
  }

  if (scenario === 'drop') {
    return [
      ...eventSteps([
        { type: 'thread', threadId },
        text('Sure, I can draft that. '),
        text('Looking up the customer'),
        { type: 'tool_start', tool: 'lookup_customer' },
      ]),
      { drop: true, delayMs: 300 },
    ]
  }

  if (/overdue/i.test(message)) return overdueSteps(threadId)

  const draft = buildInvoice({
    id: `inv_draft_${shortId()}`,
    customer: customerById('cus_adtech'),
    status: 'draft',
    items: [serviceItem('Design services', '50000.00')],
    dueDate: nextFifteenth(new Date()),
  })
  getMockState().pending.set(threadId, draft)

  return eventSteps([
    { type: 'thread', threadId },
    text('Sure. '),
    text('Let me find AdTech Solutions in your customers. '),
    { type: 'tool_start', tool: 'lookup_customer' },
    { type: 'tool_end', tool: 'lookup_customer' },
    text('Found them. I have drafted the invoice below for your approval.'),
    approvalEvent(draft, scenario),
  ])
}

type Failure = Extract<DecisionResult, { ok: false }>

function failure(status: number, code: string, message: string): Failure {
  return { ok: false, status, code, message }
}

function applyEdits(draft: Invoice, edits: DraftEdits): Invoice | Failure {
  const customer = edits.customerId
    ? CUSTOMERS.find((candidate) => candidate.id === edits.customerId)
    : draft.customer
  if (!customer) return failure(422, 'unknown_customer', 'That customer does not exist.')

  if (edits.amount !== undefined && (!AMOUNT_PATTERN.test(edits.amount) || Number(edits.amount) <= 0)) {
    return failure(422, 'invalid_amount', 'Amount must be a positive decimal with up to two places.')
  }
  if (edits.dueDate !== undefined && !DATE_PATTERN.test(edits.dueDate)) {
    return failure(422, 'invalid_due_date', 'Due date must be an ISO date (YYYY-MM-DD).')
  }
  if (edits.description !== undefined && edits.description.trim() === '') {
    return failure(422, 'invalid_description', 'Description cannot be empty.')
  }

  const [current] = draft.items
  return buildInvoice({
    id: draft.id,
    customer,
    status: 'draft',
    items: [
      serviceItem(
        edits.description?.trim() ?? current.description,
        edits.amount ?? current.taxableValue,
        !customer.stateCode,
      ),
    ],
    dueDate: edits.dueDate ?? draft.dueDate,
  })
}

function isFailure(value: Invoice | Failure): value is Failure {
  return 'ok' in value
}

/** Applies an approve / reject / edit decision to the pending draft for a thread. */
export function resolveDecision(request: ChatResumeRequest, scenario: MockScenario): DecisionResult {
  const state = getMockState()
  const { threadId } = request
  const draft = state.pending.get(threadId)
  const thread: ChatEvent = { type: 'thread', threadId }

  if (!draft) {
    return failure(404, 'no_pending_approval', 'There is nothing waiting for approval on this thread.')
  }

  if (scenario === 'expired') {
    state.pending.delete(threadId)
    return {
      ok: true,
      events: [
        thread,
        {
          type: 'error',
          code: 'approval_expired',
          message: 'This approval has expired. Ask again to create a new draft.',
        },
      ],
    }
  }

  if (request.decision === 'reject') {
    state.pending.delete(threadId)
    return {
      ok: true,
      events: [thread, text('Okay, I discarded the draft. Nothing was issued.'), { type: 'done' }],
    }
  }

  if (request.decision === 'edit') {
    if (!request.edits) return failure(422, 'edits_required', 'Edits are required for an edit decision.')
    const updated = applyEdits(draft, request.edits)
    if (isFailure(updated)) return updated
    state.pending.set(threadId, updated)
    return {
      ok: true,
      events: [
        thread,
        text('I have updated the draft and recalculated the tax.'),
        approvalEvent(updated, scenario),
      ],
    }
  }

  const sequence = String(state.nextInvoiceNumber).padStart(4, '0')
  state.nextInvoiceNumber += 1
  const issued: Invoice = {
    ...draft,
    id: `inv_${sequence}`,
    number: `INV-${sequence}`,
    status: 'issued',
    issueDate: isoDate(new Date(), 0),
    publicToken: `pubtok-inv-${sequence}`,
    amountDue: draft.total,
  }
  state.records.unshift({ invoice: issued, payments: [] })
  state.pending.delete(threadId)

  return {
    ok: true,
    events: [
      thread,
      text(`Done. ${issued.number} has been issued.`),
      { type: 'invoice_issued', invoice: issued },
      { type: 'done' },
    ],
  }
}
