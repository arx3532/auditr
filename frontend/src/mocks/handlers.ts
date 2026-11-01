import { http, HttpResponse } from 'msw'

import type {
  ChatEvent,
  ChatRequest,
  ChatResumeRequest,
  CreateCustomerRequest,
  CreateInvoiceRequest,
  Customer,
  RecordPaymentRequest,
  ResumeDecision,
  UpdateInvoiceRequest,
  UpdateProfileRequest,
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
  return HttpResponse.json({ error: { code, message } }, { status })
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
      return HttpResponse.json(record.invoice)
    }),

    http.get(`${baseUrl}/invoices/:id/payments`, async ({ request, params }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const record = getMockState().records.find(({ invoice }) => invoice.id === params.id)
      if (!record) return errorResponse(404, 'invoice_not_found', 'That invoice does not exist.')
      return HttpResponse.json(record.payments)
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

    http.patch(`${baseUrl}/invoices/:id`, async ({ request, params }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const state = getMockState()
      const record = state.records.find(({ invoice }) => invoice.id === params.id)
      if (!record) return errorResponse(404, 'invoice_not_found', 'That invoice does not exist.')
      if (record.invoice.status !== 'draft') {
        return errorResponse(409, 'invalid_state', 'Only draft invoices can be edited.')
      }

      const body = await readJson<UpdateInvoiceRequest>(request)
      const customer = body?.customerId
        ? state.customers.find((c) => c.id === body.customerId) ?? record.invoice.customer
        : record.invoice.customer

      const updated = buildInvoice({
        id: record.invoice.id,
        customer,
        status: 'draft',
        items: body?.items ?? record.invoice.items,
        dueDate: body?.dueDate ?? record.invoice.dueDate,
      })
      if (body?.lutRef !== undefined) updated.tax.lutRef = body.lutRef ?? undefined
      record.invoice = updated
      return HttpResponse.json(record.invoice)
    }),

    http.post(`${baseUrl}/invoices/:id/cancel`, async ({ request, params }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const state = getMockState()
      const record = state.records.find(({ invoice }) => invoice.id === params.id)
      if (!record) return errorResponse(404, 'invoice_not_found', 'That invoice does not exist.')
      if (record.invoice.status !== 'draft') {
        return errorResponse(409, 'invalid_state', 'Only draft invoices can be cancelled.')
      }

      record.invoice.status = 'cancelled'
      return HttpResponse.json(record.invoice)
    }),

    http.post(`${baseUrl}/invoices/:id/payments`, async ({ request, params }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const key = request.headers.get('Idempotency-Key')
      if (!key) {
        return errorResponse(400, 'idempotency_key_required', 'An Idempotency-Key header is required.')
      }

      const state = getMockState()
      const record = state.records.find(({ invoice }) => invoice.id === params.id)
      if (!record) return errorResponse(404, 'invoice_not_found', 'That invoice does not exist.')

      const body = await readJson<RecordPaymentRequest>(request)
      const cashReceived = body?.cashReceived ?? '0.00'
      const tdsDeducted = body?.tdsDeducted ?? '0.00'
      const date = body?.date ?? new Date().toISOString().slice(0, 10)

      const currentDue = Number(record.invoice.amountDue)
      const totalPaid = Number(cashReceived) + Number(tdsDeducted)
      const newDueNum = Math.max(0, currentDue - totalPaid)
      const newDue = newDueNum.toFixed(2)

      record.invoice.amountDue = newDue
      record.invoice.status = newDueNum === 0 ? 'paid' : 'partially_paid'

      const payment = {
        id: `pay_${crypto.randomUUID().slice(0, 8)}`,
        invoiceId: record.invoice.id,
        cashReceived,
        tdsDeducted,
        date,
      }
      record.payments.push(payment)

      return HttpResponse.json({ payment, invoice: record.invoice }, { status: 201 })
    }),

    http.post(`${baseUrl}/invoices/:id/public-link`, async ({ request, params }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const state = getMockState()
      const record = state.records.find(({ invoice }) => invoice.id === params.id)
      if (!record) return errorResponse(404, 'invoice_not_found', 'That invoice does not exist.')
      if (record.invoice.status === 'draft' || record.invoice.status === 'cancelled') {
        return errorResponse(409, 'not_shareable', 'Only issued invoices can be shared.')
      }

      if (!record.invoice.publicToken) {
        record.invoice.publicToken = `token_${crypto.randomUUID().slice(0, 16)}`
      }
      return HttpResponse.json({
        token: record.invoice.publicToken,
        path: `/pay/${record.invoice.publicToken}`,
      })
    }),

    http.delete(`${baseUrl}/invoices/:id/public-link`, async ({ request, params }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const state = getMockState()
      const record = state.records.find(({ invoice }) => invoice.id === params.id)
      if (!record) return errorResponse(404, 'invoice_not_found', 'That invoice does not exist.')

      record.invoice.publicToken = undefined
      return new HttpResponse(null, { status: 204 })
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

    http.get(`${baseUrl}/reports/gst-summary`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      return HttpResponse.json({
        fromDate: '2026-04-01',
        toDate: '2027-03-31',
        months: [
          {
            month: '2026-10',
            invoiceCount: 4,
            taxableValue: '175000.00',
            cgst: '15750.00',
            sgst: '15750.00',
            igst: '0.00',
            totalTax: '31500.00',
          },
        ],
        bySupplyType: [
          {
            supplyType: 'intra_state',
            invoiceCount: 4,
            taxableValue: '175000.00',
            cgst: '15750.00',
            sgst: '15750.00',
            igst: '0.00',
            totalTax: '31500.00',
          },
        ],
        totals: {
          invoiceCount: 4,
          taxableValue: '175000.00',
          cgst: '15750.00',
          sgst: '15750.00',
          igst: '0.00',
          totalTax: '31500.00',
        },
      })
    }),

    http.get(`${baseUrl}/reports/hsn-summary`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      return HttpResponse.json({
        fromDate: '2026-04-01',
        toDate: '2027-03-31',
        rows: [
          {
            hsnSac: '998311',
            invoiceCount: 3,
            taxableValue: '125000.00',
            cgst: '11250.00',
            sgst: '11250.00',
            igst: '0.00',
            totalTax: '22500.00',
          },
        ],
      })
    }),

    http.get(`${baseUrl}/reports/tds`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      return HttpResponse.json({
        financialYear: '2026-27',
        fromDate: '2026-04-01',
        toDate: '2027-03-31',
        rows: [
          {
            customerId: 'cus_adtech',
            customerName: 'AdTech Solutions Pvt Ltd',
            paymentCount: 1,
            cashReceived: '60000.00',
            tdsDeducted: '12000.00',
          },
        ],
        totalCashReceived: '60000.00',
        totalTdsDeducted: '12000.00',
      })
    }),

    http.get(`${baseUrl}/reports/receivables-aging`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      return HttpResponse.json({
        asOf: '2026-11-01',
        buckets: [
          { bucket: '0_30', invoiceCount: 2, amountDue: '69600.00' },
          { bucket: '31_60', invoiceCount: 0, amountDue: '0.00' },
          { bucket: '61_90', invoiceCount: 0, amountDue: '0.00' },
          { bucket: '90_plus', invoiceCount: 1, amountDue: '35400.00' },
        ],
        totalDue: '105000.00',
      })
    }),

    http.get(`${baseUrl}/exports/invoices.csv`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const csv = 'invoice_number,customer,issue_date,due_date,total,amount_due\nINV-0005,AdTech,2026-10-01,2026-10-15,141600.00,69600.00'
      return new HttpResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="invoices_export.csv"',
        },
      })
    }),

    http.get(`${baseUrl}/exports/payments.csv`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const csv = 'payment_id,invoice_number,date,cash_received,tds_deducted\npay_01,INV-0005,2026-10-10,60000.00,12000.00'
      return new HttpResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="payments_export.csv"',
        },
      })
    }),

    http.put(`${baseUrl}/me/profile`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const body = await readJson<UpdateProfileRequest>(request)
      return HttpResponse.json({
        stateCode: body?.stateCode ?? '29',
        businessName: body?.businessName ?? null,
      })
    }),

    http.get(`${baseUrl}/me`, async ({ request }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      // Return a sensible mock profile. In a real test you'd read/write this from
      // getMockState() once the state store tracks profile data.
      return HttpResponse.json({
        id: 'user_mock_001',
        stateCode: '29',
        businessName: 'Acme Studio Technologies',
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
      if (
        typeof body?.threadId !== 'string' ||
        typeof body?.approvalId !== 'string' ||
        !body.decision ||
        !DECISIONS.includes(body.decision)
      ) {
        return errorResponse(422, 'invalid_request', 'A threadId, approvalId and a valid decision are required.')
      }
      const resume: ChatResumeRequest = {
        threadId: body.threadId,
        approvalId: body.approvalId,
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

    http.get(`${baseUrl}/chat/threads/:threadId`, async ({ request, params }) => {
      const blocked = guard(request)
      if (blocked) return blocked
      await mockSleep(REST_LATENCY_MS)

      const threadId = String(params.threadId)

      // Return any pending approval the mock chat flow registered for this thread.
      const pendingApproval = getMockState().pendingApprovals.get(threadId) ?? null

      return HttpResponse.json({ threadId, pendingApproval })
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