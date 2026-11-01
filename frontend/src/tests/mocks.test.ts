import { describe, expect, it } from 'vitest'

import { createApiClient, isApiError } from '@/lib/api/client'
import { createEndpoints } from '@/lib/api/endpoints'
import type { ChatEvent, InvoiceStatus } from '@/lib/api/types'
import { createInitialRecords } from '@/mocks/fixtures'
import { setMockScenario } from '@/mocks/scenario'
import { fromMinor, sumMinor, toMinor } from '@/mocks/serverMath'

const api = createEndpoints(
  createApiClient({ baseUrl: 'http://api.test', getToken: async () => 'test-token' }),
)

function parseEvents(raw: string): ChatEvent[] {
  const blocks = raw.split('\n\n')
  const complete = raw.endsWith('\n\n') ? blocks : blocks.slice(0, -1)
  return complete
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.slice('data: '.length)) as ChatEvent)
}

async function readEvents(response: Response): Promise<ChatEvent[]> {
  return parseEvents(await response.text())
}

async function startDraft(): Promise<{ threadId: string; approvalId: string }> {
  const events = await readEvents(await api.startChat({ message: 'Invoice AdTech ₹50,000, due the 15th' }))
  const thread = events.find((event) => event.type === 'thread')
  const approval = events.find((event) => event.type === 'approval_required')
  if (thread?.type !== 'thread' || approval?.type !== 'approval_required') {
    throw new Error('No thread or approval event')
  }
  return { threadId: thread.threadId, approvalId: approval.approvalId }
}

describe('fixtures', () => {
  const records = createInitialRecords()

  it('covers every invoice status with about ten invoices', () => {
    const statuses = new Set<InvoiceStatus>(records.map(({ invoice }) => invoice.status))
    expect(records).toHaveLength(10)
    expect([...statuses].sort()).toEqual(
      ['cancelled', 'draft', 'issued', 'overdue', 'paid', 'partially_paid'].sort(),
    )
  })

  it('has four customers', () => {
    const customers = new Set(records.map(({ invoice }) => invoice.customer.id))
    expect(customers.size).toBe(4)
  })

  it('keeps totals and amounts due internally consistent', () => {
    for (const { invoice, payments } of records) {
      const tax = sumMinor([invoice.tax.cgst ?? '0', invoice.tax.sgst ?? '0', invoice.tax.igst ?? '0'])
      expect(fromMinor(toMinor(invoice.subtotal) + tax)).toBe(invoice.total)

      const credited = sumMinor(payments.flatMap((p) => [p.cashReceived, p.tdsDeducted]))
      const expectedDue = invoice.status === 'cancelled' ? 0n : toMinor(invoice.total) - credited
      expect(invoice.amountDue).toBe(fromMinor(expectedDue))
    }
  })

  it('has a partially paid invoice with TDS and exactly one overdue invoice', () => {
    const partial = records.find(({ invoice }) => invoice.status === 'partially_paid')
    expect(partial?.payments[0]).toMatchObject({ cashReceived: '60000.00', tdsDeducted: '12000.00' })
    expect(records.filter(({ invoice }) => invoice.status === 'overdue')).toHaveLength(1)
  })

  it('only gives issued-onwards invoices a number and public token', () => {
    for (const { invoice } of records) {
      expect(Boolean(invoice.number)).toBe(invoice.status !== 'draft')
      expect(Boolean(invoice.publicToken)).toBe(invoice.status !== 'draft')
    }
  })
})

describe('REST handlers', () => {
  it('paginates invoices with a cursor', async () => {
    const first = await api.listInvoices()
    expect(first.items).toHaveLength(5)
    expect(first.nextCursor).toBe('5')

    const second = await api.listInvoices({ cursor: first.nextCursor })
    expect(second.items).toHaveLength(5)
    expect(second.nextCursor).toBeUndefined()
    expect(new Set([...first.items, ...second.items].map((invoice) => invoice.id)).size).toBe(10)
  })

  it('filters invoices by status', async () => {
    const { items } = await api.listInvoices({ status: 'overdue' })
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('overdue')
  })

  it('returns payments with cash and TDS on invoice detail', async () => {
    const { items } = await api.listInvoices({ status: 'partially_paid' })
    const detail = await api.getInvoice(items[0].id)
    expect(detail.amountDue).toBe('69600.00')
    const payments = await api.listInvoicePayments(items[0].id)
    expect(payments).toEqual([
      expect.objectContaining({ cashReceived: '60000.00', tdsDeducted: '12000.00' }),
    ])
  })

  it('answers 404 for an unknown invoice', async () => {
    await expect(api.getInvoice('inv_missing')).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('summarises overdue invoices from the data', async () => {
    const summary = await api.getSummary()
    expect(summary.overdueCount).toBe(1)
    expect(summary.overdueTotal).toBe('35400.00')
  })

  it('lists customers', async () => {
    expect(await api.listCustomers()).toHaveLength(4)
  })

  it('serves public invoices by token and distinguishes revoked from unknown', async () => {
    const { items } = await api.listInvoices({ status: 'issued' })
    const token = items[0].publicToken ?? ''
    expect((await api.getPublicInvoice(token)).number).toBe(items[0].number)
    await expect(api.getPublicInvoice('revoked-demo-token')).rejects.toMatchObject({ kind: 'gone' })
    await expect(api.getPublicInvoice('nope')).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('fails every authenticated route in the unauthorized and server_error scenarios', async () => {
    setMockScenario('unauthorized')
    await expect(api.listInvoices()).rejects.toMatchObject({ kind: 'unauthorized' })

    setMockScenario('server_error')
    await expect(api.getSummary()).rejects.toMatchObject({ kind: 'server', retryable: true })
  })
})

describe('chat stream', () => {
  it('replays thread, text, tool, then approval_required with a server-computed draft', async () => {
    const response = await api.startChat({ message: 'Invoice AdTech ₹50,000, due the 15th' })
    const raw = await response.text()
    const events = parseEvents(raw)

    expect(raw.startsWith(': keepalive')).toBe(true)
    expect(events.map((event) => event.type)).toEqual([
      'thread',
      'text_delta',
      'text_delta',
      'tool_start',
      'tool_end',
      'text_delta',
      'approval_required',
    ])
    const approval = events.at(-1)
    if (approval?.type !== 'approval_required') throw new Error('Expected approval_required')
    expect(approval.draft).toMatchObject({
      status: 'draft',
      subtotal: '50000.00',
      total: '59000.00',
      tax: { cgst: '4500.00', sgst: '4500.00' },
    })
    expect(new Date(approval.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('answers overdue questions without asking for approval', async () => {
    const events = await readEvents(await api.startChat({ message: 'What is overdue?' }))
    expect(events.map((event) => event.type)).toContain('tool_start')
    expect(events.at(-1)).toEqual({ type: 'done' })
    expect(events.some((event) => event.type === 'approval_required')).toBe(false)
  })

  it('drops the stream midway in the drop scenario', async () => {
    setMockScenario('drop')
    const response = await api.startChat({ message: 'Invoice AdTech' })
    // Depending on the runtime a stream error either rejects the read or truncates the body;
    // in both cases the client never receives a terminal event or a complete final frame.
    const raw = await response.text().catch(() => null)
    if (raw !== null) {
      expect(raw.endsWith('\n\n')).toBe(false)
      expect(parseEvents(raw).some((event) => event.type === 'done')).toBe(false)
    }
  })

  it('emits an error event in the error scenario', async () => {
    setMockScenario('error')
    const events = await readEvents(await api.startChat({ message: 'Invoice AdTech' }))
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'upstream_unavailable' })
  })

  it('marks the approval as already expired in the expired scenario', async () => {
    setMockScenario('expired')
    const events = await readEvents(await api.startChat({ message: 'Invoice AdTech' }))
    const approval = events.at(-1)
    if (approval?.type !== 'approval_required') throw new Error('Expected approval_required')
    expect(new Date(approval.expiresAt).getTime()).toBeLessThan(Date.now())

    const threadId = events.find((event) => event.type === 'thread')
    if (threadId?.type !== 'thread') throw new Error('No thread')
    const resumed = await readEvents(
      await api.resumeChat(
        { threadId: threadId.threadId, approvalId: approval.approvalId, decision: 'approve' },
        'key-expired',
      ),
    )
    expect(resumed.at(-1)).toMatchObject({ type: 'error', code: 'approval_expired' })
  })
})

describe('chat resume', () => {
  it('issues the invoice on approve and lists it afterwards', async () => {
    const { threadId, approvalId } = await startDraft()
    const events = await readEvents(
      await api.resumeChat({ threadId, approvalId, decision: 'approve' }, 'key-approve'),
    )

    const issued = events.find((event) => event.type === 'invoice_issued')
    if (issued?.type !== 'invoice_issued') throw new Error('Expected invoice_issued')
    expect(issued.invoice).toMatchObject({ number: 'INV-0011', status: 'issued', amountDue: '59000.00' })
    expect(events.at(-1)).toEqual({ type: 'done' })

    const { items } = await api.listInvoices()
    expect(items[0].number).toBe('INV-0011')
  })

  it('replays the same result for a retried Idempotency-Key instead of issuing twice', async () => {
    const { threadId, approvalId } = await startDraft()
    const body = { threadId, approvalId, decision: 'approve' as const }

    const first = await readEvents(await api.resumeChat(body, 'key-retry'))
    const second = await readEvents(await api.resumeChat(body, 'key-retry'))

    expect(second).toEqual(first)
    const issuedCount = (await api.listInvoices({ status: 'issued' })).items.filter(
      (invoice) => invoice.number === 'INV-0011',
    ).length
    expect(issuedCount).toBe(1)
    expect((await api.getSummary()).overdueCount).toBe(1)
  })

  it('rejects reusing an Idempotency-Key for a different decision', async () => {
    const { threadId, approvalId } = await startDraft()
    await readEvents(await api.resumeChat({ threadId, approvalId, decision: 'reject' }, 'key-reuse'))

    const error = await api
      .resumeChat({ threadId, approvalId, decision: 'approve' }, 'key-reuse')
      .catch((e: unknown) => e)

    expect(isApiError(error) && error.code).toBe('idempotency_key_reuse')
  })

  it('recomputes tax on the server for an edit and asks for approval again', async () => {
    const { threadId, approvalId } = await startDraft()
    const events = await readEvents(
      await api.resumeChat(
        {
          threadId,
          approvalId,
          decision: 'edit',
          edits: {
            customerId: 'cus_bluepeak',
            items: [{ description: 'Design services', taxableValue: '75000.00', gstRate: '18' }],
          },
        },
        'key-edit',
      ),
    )

    const approval = events.at(-1)
    if (approval?.type !== 'approval_required') throw new Error('Expected approval_required')
    expect(approval.draft).toMatchObject({
      subtotal: '75000.00',
      total: '88500.00',
      tax: { igst: '13500.00' },
      customer: { id: 'cus_bluepeak' },
    })
  })

  it('rejects invalid edits with a validation error', async () => {
    const { threadId, approvalId } = await startDraft()
    await expect(
      api.resumeChat(
        {
          threadId,
          approvalId,
          decision: 'edit',
          edits: {
            items: [{ description: 'Design', taxableValue: '-5', gstRate: '18' }],
          },
        },
        'key-bad-edit',
      ),
    ).rejects.toMatchObject({ kind: 'client', code: 'invalid_amount' })
  })

  it('discards the draft on reject without issuing anything', async () => {
    const { threadId, approvalId } = await startDraft()
    const events = await readEvents(
      await api.resumeChat({ threadId, approvalId, decision: 'reject' }, 'key-reject'),
    )
    expect(events.at(-1)).toEqual({ type: 'done' })
    expect((await api.listInvoices()).items.some((invoice) => invoice.number === 'INV-0011')).toBe(false)
  })

  it('answers 404 when nothing is pending for the thread', async () => {
    await expect(
      api.resumeChat({ threadId: 'thr_unknown', approvalId: 'apr_unknown', decision: 'approve' }, 'key-none'),
    ).rejects.toMatchObject({ kind: 'not_found', code: 'no_pending_approval' })
  })
})
