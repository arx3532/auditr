import { z } from 'zod'

import type { ChatEvent } from '@/lib/api/types'

import { StreamProtocolError } from './errors'

// Money and rates are decimal strings. Rejecting anything else keeps a stray JSON number
// (and with it floating point) from ever reaching the UI.
const decimalString = z.string().regex(/^\d+(\.\d+)?$/)

const customerSchema = z.object({
  id: z.string(),
  name: z.string(),
  gstin: z.string().optional(),
  stateCode: z.string().optional(),
})

const itemSchema = z.object({
  description: z.string(),
  hsnSac: z.string().optional(),
  taxableValue: decimalString,
  gstRate: decimalString,
})

const taxSchema = z.object({
  cgst: decimalString.optional(),
  sgst: decimalString.optional(),
  igst: decimalString.optional(),
  zeroRated: z.boolean().optional(),
  lutRef: z.string().optional(),
})

const invoiceStatusSchema = z.enum(['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'])

const invoiceSchema = z.object({
  id: z.string(),
  number: z.string().optional(),
  customer: customerSchema,
  status: invoiceStatusSchema,
  items: z.array(itemSchema),
  tax: taxSchema,
  subtotal: decimalString,
  total: decimalString,
  amountDue: decimalString,
  issueDate: z.string().optional(),
  dueDate: z.string(),
  publicToken: z.string().optional(),
})

const paymentSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  cashReceived: decimalString,
  tdsDeducted: decimalString,
  date: z.string(),
})

const paymentApprovalSchema = z.object({
  invoice: invoiceSchema,
  cashReceived: decimalString,
  tdsDeducted: decimalString,
  date: z.string(),
  amountDueAfter: decimalString,
  statusAfter: invoiceStatusSchema,
})

// The backend sends `draft` for an issue-invoice approval and `payment` for a record-payment
// approval (plus an internal `kind` label we do not need). Exactly one of the two is present.
const approvalRequiredSchema = z.union([
  z.object({
    type: z.literal('approval_required'),
    approvalId: z.string(),
    expiresAt: z.string(),
    draft: invoiceSchema,
  }),
  z.object({
    type: z.literal('approval_required'),
    approvalId: z.string(),
    expiresAt: z.string(),
    payment: paymentApprovalSchema,
  }),
])

const approvalResolvedSchema = z.object({
  type: z.literal('approval_resolved'),
  approvalId: z.string(),
  outcome: z.enum(['approved', 'rejected', 'expired']),
  invoice: invoiceSchema.optional(),
  payment: paymentSchema.optional(),
})

export const chatEventSchema: z.ZodType<ChatEvent> = z.union([
  z.object({ type: z.literal('thread'), threadId: z.string() }),
  z.object({ type: z.literal('text_delta'), text: z.string() }),
  z.object({ type: z.literal('tool_start'), tool: z.string() }),
  z.object({ type: z.literal('tool_end'), tool: z.string() }),
  approvalRequiredSchema,
  approvalResolvedSchema,
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
  z.object({ type: z.literal('done') }),
])

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set<ChatEvent['type']>([
  'thread',
  'text_delta',
  'tool_start',
  'tool_end',
  'approval_required',
  'approval_resolved',
  'error',
  'done',
])

const INVALID_EVENT_MESSAGE = 'The server sent an event we could not understand.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates the JSON payload of one server-sent event.
 *
 * Returns null for empty payloads and for event types this client does not know, so a
 * newer server can add events without breaking an older client. Throws
 * `StreamProtocolError` for malformed JSON or a known event with the wrong shape. The
 * error message never echoes the payload, since it may contain personal data.
 */
export function decodeChatEvent(data: string): ChatEvent | null {
  if (data.trim() === '') return null

  let json: unknown
  try {
    json = JSON.parse(data)
  } catch {
    throw new StreamProtocolError('invalid_event', INVALID_EVENT_MESSAGE)
  }

  if (!isRecord(json) || typeof json.type !== 'string') {
    throw new StreamProtocolError('invalid_event', INVALID_EVENT_MESSAGE)
  }
  if (!KNOWN_EVENT_TYPES.has(json.type)) return null

  const result = chatEventSchema.safeParse(json)
  if (!result.success) throw new StreamProtocolError('invalid_event', INVALID_EVENT_MESSAGE)
  return result.data
}