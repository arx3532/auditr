import { http, HttpResponse } from 'msw'

import type {
  ChatEvent,
  ChatRequest,
  ChatResumeRequest,
  CreateCustomerRequest,
  CreateInvoiceRequest,
  Customer,
  ResumeDecision,
} from '@/lib/api/types'

import { resolveDecision, startChat } from './chatFlow'
import { REVOKED_PUBLIC_TOKEN, isoDate } from './fixtures'
import { getMockScenario, mockSleep } from './scenario'
import { eventSteps, scriptedStream, type ScriptStep } from './scriptedStream'
import { buildInvoice, fromMinor, sumMinor } from './serverMath'
import { getMockState } from './state'

const PAGE_SIZE = 5
const REST_LATENCY_MS = 250
const DECISIONS: readonly ResumeDecision[] = ['approve', 'reject', 'edit']
const DECIMAL = /^\d{1,12}(\.\d{1,2})?$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function errorResponse(status: number, code: string, message: string) {
  return HttpResponse.json({ code, message }, { status })
}

function sseResponse(steps: ScriptStep[]) {
  return new HttpResponse(scriptedStream(steps), {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}

async function readJson<T>(request: Request): Promise<Partial<T> | null> {
  try {
    const body: unknown = await request.json()
    return body && typeof body === 'object' ? (body as Partial<T>) : null
  } catch {
    return null
  }
}

/** Mirrors the real API's gate for authenticated routes, plus the failure scenarios. */
function guard(request: Request): Response | null {
  const scenario = getMockScenario()
  const hasBearer = request.headers.get('Authorization')?.startsWith('Bearer ')
  if (scenario === 'unauthorized' || !hasBearer) {
    return errorResponse(401, 'unauthorized', 'Your session has expired. Please sign in again.')
  }
  if (scenario === 'server_error') {
    return errorResponse(500, 'internal_error', 'The server ran into a problem. Please try again.')
  }
  return null
}

export function createHandlers(baseUrl: string) {
  return [
    http.get(`${baseUrl}/invoices`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const url = new URL(request.url)
      const status = url.searchParams.get('status')
      const cursor = url.searchParams.get('cursor')
      const offset = cursor === null ? 0 : Number(cursor)
      if (!Number.isInteger(offset) || offset < 0) {
        return errorResponse(400, 'invalid_cursor', 'The pagination cursor is not valid.')
      }

      const matching = getMockState()
        .records.map((record) => record.invoice)
        .filter((invoice) => !status || invoice.status === status)
      const nextOffset = offset + PAGE_SIZE

      return HttpResponse.json({
        items: matching.slice(offset, nextOffset),
        nextCursor: nextOffset < matching.length ? String(nextOffset) : undefined,
      })
    }),

    http.get(`${baseUrl}/invoices/:id`, async ({ request, params }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const record = getMockState().records.find(({ invoice }) => invoice.id === params.id)
      if (!record) return errorResponse(404, 'invoice_not_found', 'That invoice does not exist.')
      return HttpResponse.json({ ...record.invoice, payments: record.payments })
    }),

    http.get(`${baseUrl}/customers`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)
      return HttpResponse.json(getMockState().customers)
    }),

    http.post(`${baseUrl}/customers`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const body = await readJson<CreateCustomerRequest>(request)
      if (typeof body?.name !== 'string' || body.name.trim() === '') {
        return errorResponse(422, 'name_required', 'A customer name is required.')
      }
      const customer: Customer = {
        id: `cus_${crypto.randomUUID().slice(0, 8)}`,
        name: body.name.trim(),
        ...(body.gstin ? { gstin: body.gstin } : {}),
        ...(body.stateCode ? { stateCode: body.stateCode } : {}),
      }
      getMockState().customers.push(customer)
      return HttpResponse.json(customer, { status: 201 })
    }),

    http.post(`${baseUrl}/invoices`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const body = await readJson<CreateInvoiceRequest>(request)
      const state = getMockState()
      const customer = state.customers.find(({ id }) => id === body?.customerId)
      if (!customer) return errorResponse(422, 'customer_not_found', 'Choose an existing customer.')
      if (typeof body?.dueDate !== 'string' || !ISO_DATE.test(body.dueDate)) {
        return errorResponse(422, 'due_date_required', 'A valid due date is required.')
      }
      const items = body.items
      if (!Array.isArray(items) || items.length === 0) {
        return errorResponse(422, 'items_required', 'Add at least one line item.')
      }
      for (const item of items) {
        if (typeof item?.description !== 'string' || item.description.trim() === '') {
          return errorResponse(422, 'description_required', 'Every line item needs a description.')
        }
        if (!DECIMAL.test(String(item.taxableValue)) || !DECIMAL.test(String(item.gstRate))) {
          return errorResponse(422, 'invalid_amount', 'Amounts and rates must be decimal numbers.')
        }
      }

      const draft = buildInvoice({
        id: `inv_draft_${crypto.randomUUID().slice(0, 8)}`,
        customer,
        status: 'draft',
        items,
        dueDate: body.dueDate,
      })
      if (draft.tax.zeroRated && body.lutRef) draft.tax.lutRef = body.lutRef
      state.records.unshift({ invoice: draft, payments: [] })
      return HttpResponse.json(draft, { status: 201 })
    }),

    http.post(`${baseUrl}/invoices/:id/issue`, async ({ request, params }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const key = request.headers.get('Idempotency-Key')
      if (!key)
        return errorResponse(400, 'idempotency_key_required', 'An Idempotency-Key header is required.')

      const state = getMockState()
      const record = state.records.find(({ invoice }) => invoice.id === params.id)
      if (!record) return errorResponse(404, 'invoice_not_found', 'That invoice does not exist.')

      const previous = state.issueKeys.get(key)
      if (previous !== undefined) {
        if (previous !== record.invoice.id) {
          return errorResponse(
            422,
            'idempotency_key_reuse',
            'That Idempotency-Key was used for a different request.',
          )
        }
        return HttpResponse.json(record.invoice)
      }
      if (record.invoice.status !== 'draft') {
        return errorResponse(409, 'invoice_not_draft', 'Only a draft can be issued.')
      }

      const sequence = String(state.nextInvoiceNumber).padStart(4, '0')
      state.nextInvoiceNumber += 1
      record.invoice = {
        ...record.invoice,
        number: `INV-${sequence}`,
        status: 'issued',
        issueDate: isoDate(new Date(), 0),
        publicToken: `pubtok-inv-${sequence}`,
        amountDue: record.invoice.total,
      }
      state.issueKeys.set(key, record.invoice.id)
      return HttpResponse.json(record.invoice)
    }),

    http.get(`${baseUrl}/reports/summary`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const month = new Date().toISOString().slice(0, 7)
      const invoices = getMockState().records.map((record) => record.invoice)
      const revenue = invoices
        .filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled')
        .filter((invoice) => invoice.issueDate?.startsWith(month))
        .map((invoice) => invoice.total)
      const overdue = invoices.filter((invoice) => invoice.status === 'overdue')

      return HttpResponse.json({
        revenueThisMonth: fromMinor(sumMinor(revenue)),
        overdueCount: overdue.length,
        overdueTotal: fromMinor(sumMinor(overdue.map((invoice) => invoice.amountDue))),
      })
    }),

    http.post(`${baseUrl}/chat`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked

      const body = await readJson<ChatRequest>(request)
      if (typeof body?.message !== 'string' || body.message.trim() === '') {
        return errorResponse(422, 'message_required', 'A message is required.')
      }

      const threadId = body.threadId ?? `thr_${crypto.randomUUID().slice(0, 8)}`
      return sseResponse(startChat(body.message, threadId, getMockScenario()))
    }),

    http.post(`${baseUrl}/chat/resume`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked

      const key = request.headers.get('Idempotency-Key')
      if (!key)
        return errorResponse(400, 'idempotency_key_required', 'An Idempotency-Key header is required.')

      const body = await readJson<ChatResumeRequest>(request)
      if (typeof body?.threadId !== 'string' || !body.decision || !DECISIONS.includes(body.decision)) {
        return errorResponse(422, 'invalid_request', 'A threadId and a valid decision are required.')
      }
      const resume: ChatResumeRequest = {
        threadId: body.threadId,
        decision: body.decision,
        edits: body.edits,
      }

      const { replays } = getMockState()
      const fingerprint = JSON.stringify(resume)
      const replay = replays.get(key)
      if (replay) {
        if (replay.fingerprint !== fingerprint) {
          return errorResponse(
            422,
            'idempotency_key_reuse',
            'That Idempotency-Key was used for a different request.',
          )
        }
        return sseResponse(eventSteps(replay.events))
      }

      const result = resolveDecision(resume, getMockScenario())
      if (!result.ok) return errorResponse(result.status, result.code, result.message)

      const events: ChatEvent[] = result.events
      replays.set(key, { fingerprint, events })
      return sseResponse(eventSteps(events))
    }),

    http.get(`${baseUrl}/public/invoices/:token`, async ({ params }) => {
      await mockSleep(REST_LATENCY_MS)

      const token = String(params.token)
      if (token === REVOKED_PUBLIC_TOKEN) {
        return errorResponse(410, 'token_revoked', 'This invoice link has been revoked.')
      }
      const record = getMockState().records.find(({ invoice }) => invoice.publicToken === token)
      if (!record) return errorResponse(404, 'invoice_not_found', 'This invoice link is not valid.')
      return HttpResponse.json(record.invoice)
    }),
  ]
}
