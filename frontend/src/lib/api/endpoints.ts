import type { ApiClient } from './client'
import type {
  ChatRequest,
  ChatResumeRequest,
  CreateCustomerRequest,
  CreateInvoiceRequest,
  Customer,
  Invoice,
  InvoiceDetail,
  InvoiceListResponse,
  InvoiceStatus,
  ReportSummary,
} from './types'

export interface ListInvoicesParams {
  status?: InvoiceStatus
  cursor?: string
}

/** One typed function per endpoint. Streaming endpoints return the raw SSE response. */
export function createEndpoints(client: ApiClient) {
  return {
    listInvoices: ({ status, cursor }: ListInvoicesParams = {}, signal?: AbortSignal) =>
      client.request<InvoiceListResponse>('/invoices', { query: { status, cursor }, signal }),

    getInvoice: (id: string, signal?: AbortSignal) =>
      client.request<InvoiceDetail>(`/invoices/${encodeURIComponent(id)}`, { signal }),

    listCustomers: (signal?: AbortSignal) => client.request<Customer[]>('/customers', { signal }),

    getSummary: (signal?: AbortSignal) => client.request<ReportSummary>('/reports/summary', { signal }),

    createCustomer: (body: CreateCustomerRequest, signal?: AbortSignal) =>
    client.request<Customer>('/customers', { method: 'POST', body, signal }),

    /** Creates a draft. The server calculates GST and totals. */
    createInvoice: (body: CreateInvoiceRequest, signal?: AbortSignal) =>
      client.request<Invoice>('/invoices', { method: 'POST', body, signal }),

    /** Issues a draft (number, ledger entries). Safe to retry with the same key. */
    issueInvoice: (id: string, idempotencyKey: string, signal?: AbortSignal) =>
      client.request<Invoice>(`/invoices/${encodeURIComponent(id)}/issue`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        signal,
      }),

    startChat: (body: ChatRequest, signal?: AbortSignal) =>
      client.stream('/chat', { method: 'POST', body, signal }),

    resumeChat: (body: ChatResumeRequest, idempotencyKey: string, signal?: AbortSignal) =>
      client.stream('/chat/resume', {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
        signal,
      }),

    getPublicInvoice: (token: string, signal?: AbortSignal) =>
      client.request<Invoice>(`/public/invoices/${encodeURIComponent(token)}`, {
        auth: false,
        signal,
      }),
  }
}

export type ApiEndpoints = ReturnType<typeof createEndpoints>
