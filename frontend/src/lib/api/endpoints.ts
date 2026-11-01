import type { ApiClient } from './client'
import type {
  ChatRequest,
  ChatResumeRequest,
  CreateCustomerRequest,
  CreateInvoiceRequest,
  Customer,
  GstSummary,
  HsnSummary,
  Invoice,
  InvoiceListResponse,
  InvoiceStatus,
  Payment,
  PublicInvoice,
  ReceivablesAging,
  RecordPaymentRequest,
  RecordPaymentResponse,
  ReportSummary,
  ShareLink,
  TdsReport,
  ThreadView,
  UpdateInvoiceRequest,
  UpdateProfileRequest,
  UserProfile,
} from './types'

export interface ListInvoicesParams {
  status?: InvoiceStatus
  cursor?: string
  /** Number of invoices per page. Must be 1–100. Defaults to 20 on the server. */
  limit?: number
}

export interface DateRangeParams {
  from?: string
  to?: string
}

/** One typed function per endpoint. Streaming endpoints return the raw SSE response. */
export function createEndpoints(client: ApiClient) {
  return {
    // -----------------------------------------------------------------------
    // Invoices
    // -----------------------------------------------------------------------

    listInvoices: ({ status, cursor, limit }: ListInvoicesParams = {}, signal?: AbortSignal) =>
      client.request<InvoiceListResponse>('/invoices', {
        query: {
          status,
          cursor,
          limit: limit !== undefined ? String(limit) : undefined,
        },
        signal,
      }),

    getInvoice: (id: string, signal?: AbortSignal) =>
      client.request<Invoice>(`/invoices/${encodeURIComponent(id)}`, { signal }),

    createInvoice: (body: CreateInvoiceRequest, signal?: AbortSignal) =>
      client.request<Invoice>('/invoices', { method: 'POST', body, signal }),

    updateInvoice: (id: string, body: UpdateInvoiceRequest, signal?: AbortSignal) =>
      client.request<Invoice>(`/invoices/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body,
        signal,
      }),

    /** Issues a draft (assigns number, creates ledger entries). Safe to retry with the same key. */
    issueInvoice: (id: string, idempotencyKey: string, signal?: AbortSignal) =>
      client.request<Invoice>(`/invoices/${encodeURIComponent(id)}/issue`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        signal,
      }),

    cancelInvoice: (id: string, signal?: AbortSignal) =>
      client.request<Invoice>(`/invoices/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        signal,
      }),

    // -----------------------------------------------------------------------
    // Payments
    // -----------------------------------------------------------------------

    /**
     * Fetches the payment history for one invoice.
     * Maps to GET /invoices/:id/payments → Payment[].
     */
    listInvoicePayments: (invoiceId: string, signal?: AbortSignal) =>
      client.request<Payment[]>(`/invoices/${encodeURIComponent(invoiceId)}/payments`, { signal }),

    /**
     * Records a payment against an invoice.
     * Requires an Idempotency-Key header — callers must generate and persist it before
     * the first attempt, then reuse the same key on any retry.
     */
    recordPayment: (
      invoiceId: string,
      body: RecordPaymentRequest,
      idempotencyKey: string,
      signal?: AbortSignal,
    ) =>
      client.request<RecordPaymentResponse>(
        `/invoices/${encodeURIComponent(invoiceId)}/payments`,
        { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey }, signal },
      ),

    // -----------------------------------------------------------------------
    // Share links
    // -----------------------------------------------------------------------

    /** Creates (or returns the existing) public share link for an issued invoice. */
    createPublicLink: (invoiceId: string, signal?: AbortSignal) =>
      client.request<ShareLink>(`/invoices/${encodeURIComponent(invoiceId)}/public-link`, {
        method: 'POST',
        signal,
      }),

    /** Revokes the public share link for an invoice. Returns 204 No Content. */
    revokePublicLink: (invoiceId: string, signal?: AbortSignal) =>
      client.request<void>(`/invoices/${encodeURIComponent(invoiceId)}/public-link`, {
        method: 'DELETE',
        signal,
      }),

    // -----------------------------------------------------------------------
    // Customers
    // -----------------------------------------------------------------------

    listCustomers: (signal?: AbortSignal) => client.request<Customer[]>('/customers', { signal }),

    createCustomer: (body: CreateCustomerRequest, signal?: AbortSignal) =>
      client.request<Customer>('/customers', { method: 'POST', body, signal }),

    // -----------------------------------------------------------------------
    // Reports
    // -----------------------------------------------------------------------

    getSummary: (signal?: AbortSignal) =>
      client.request<ReportSummary>('/reports/summary', { signal }),

    /** GST summary broken down by month and supply type. Optional date range (YYYY-MM-DD). */
    getGstSummary: ({ from, to }: DateRangeParams = {}, signal?: AbortSignal) =>
      client.request<GstSummary>('/reports/gst-summary', { query: { from, to }, signal }),

    /** HSN/SAC summary. Optional date range (YYYY-MM-DD). */
    getHsnSummary: ({ from, to }: DateRangeParams = {}, signal?: AbortSignal) =>
      client.request<HsnSummary>('/reports/hsn-summary', { query: { from, to }, signal }),

    /**
     * TDS report for a financial year.
     * `fy` format: "2024-25". Defaults to the current financial year on the server.
     */
    getTdsReport: (fy?: string, signal?: AbortSignal) =>
      client.request<TdsReport>('/reports/tds', { query: { fy }, signal }),

    /** Receivables aging report bucketed by days overdue. */
    getReceivablesAging: (signal?: AbortSignal) =>
      client.request<ReceivablesAging>('/reports/receivables-aging', { signal }),

    // -----------------------------------------------------------------------
    // Exports  (CSV downloads — response is text/csv, not JSON)
    // -----------------------------------------------------------------------

    /**
     * Downloads invoices as a CSV file. Returns a Blob and optional filename from Content-Disposition.
     * Optional date range (YYYY-MM-DD).
     */
    exportInvoicesCsv: ({ from, to }: DateRangeParams = {}, signal?: AbortSignal) =>
      client.blob('/exports/invoices.csv', { query: { from, to }, signal }),

    /**
     * Downloads payments as a CSV file. Returns a Blob and optional filename from Content-Disposition.
     * Optional date range (YYYY-MM-DD).
     */
    exportPaymentsCsv: ({ from, to }: DateRangeParams = {}, signal?: AbortSignal) =>
      client.blob('/exports/payments.csv', { query: { from, to }, signal }),

    // -----------------------------------------------------------------------
    // Profile
    // -----------------------------------------------------------------------

    /** Fetches the current user's id, stateCode and businessName. */
    getMe: (signal?: AbortSignal) =>
      client.request<UserProfile>('/me', { signal }),

    /** Updates the current user's business name and state code. */
    updateProfile: (body: UpdateProfileRequest, signal?: AbortSignal) =>
      client.request<{ stateCode: string | null; businessName: string | null }>('/me/profile', {
        method: 'PUT',
        body,
        signal,
      }),

    // -----------------------------------------------------------------------
    // Chat (SSE)
    // -----------------------------------------------------------------------

    startChat: (body: ChatRequest, signal?: AbortSignal) =>
      client.stream('/chat', { method: 'POST', body, signal }),

    resumeChat: (body: ChatResumeRequest, idempotencyKey: string, signal?: AbortSignal) =>
      client.stream('/chat/resume', {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
        signal,
      }),

    getThread: (threadId: string, signal?: AbortSignal) =>
      client.request<ThreadView>(
        `/chat/threads/${encodeURIComponent(threadId)}`,
        { signal },
      ),

    // -----------------------------------------------------------------------
    // Public (unauthenticated)
    // -----------------------------------------------------------------------

    getPublicInvoice: (token: string, signal?: AbortSignal) =>
      client.request<PublicInvoice>(`/public/invoices/${encodeURIComponent(token)}`, {
        auth: false,
        signal,
      }),
  }
}

export type ApiEndpoints = ReturnType<typeof createEndpoints>
