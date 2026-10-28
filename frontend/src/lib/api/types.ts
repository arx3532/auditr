/**
 * API contract between this client and the FastAPI backend.
 *
 * Money fields are decimal STRINGS (e.g. "50000.00"). Never parse them to floats for
 * arithmetic: the server computes GST, TDS and totals; the UI only displays them.
 * Dates are ISO 8601 strings.
 */

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'

export interface Customer {
  id: string
  name: string
  gstin?: string
  stateCode?: string
}

export interface InvoiceItem {
  description: string
  hsnSac?: string
  taxableValue: string
  gstRate: string
}

export interface TaxBreakdown {
  cgst?: string
  sgst?: string
  igst?: string
  zeroRated?: boolean
  lutRef?: string
}

export interface Invoice {
  id: string
  /** Exists only once the invoice is issued. */
  number?: string
  customer: Customer
  status: InvoiceStatus
  items: InvoiceItem[]
  tax: TaxBreakdown
  subtotal: string
  total: string
  amountDue: string
  issueDate?: string
  dueDate: string
  publicToken?: string
}

export interface Payment {
  id: string
  invoiceId: string
  cashReceived: string
  tdsDeducted: string
  date: string
}

export interface ReportSummary {
  revenueThisMonth: string
  overdueCount: number
  overdueTotal: string
}

export type ResumeDecision = 'approve' | 'reject' | 'edit'

export interface ChatRequest {
  threadId?: string
  message: string
}

export interface ChatResumeRequest {
  threadId: string
  decision: ResumeDecision
  edits?: DraftEdits
}

/** Server-sent events on `POST /chat` and `POST /chat/resume`. Each is JSON in `data:`. */
export type ChatEvent =
  | { type: 'thread'; threadId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; tool: string }
  | { type: 'tool_end'; tool: string }
  | { type: 'approval_required'; approvalId: string; expiresAt: string; draft: Invoice }
  | { type: 'error'; code: string; message: string }
  | { type: 'done' }
  | InvoiceIssuedEvent

/*
 * ---------------------------------------------------------------------------
 * PROPOSED CONTRACT ADDITIONS
 *
 * Everything below is NOT in the source contract. The contract leaves these
 * shapes undefined, but the UI cannot be built without them. They are isolated
 * here so they are easy to review and replace once the backend confirms them.
 * ---------------------------------------------------------------------------
 */

/**
 * Proposed: `GET /invoices` envelope. The contract names a `cursor` query param but
 * does not say how the next cursor is returned.
 */
export interface InvoiceListResponse {
  items: Invoice[]
  /** Absent when there are no more pages. */
  nextCursor?: string
}

/**
 * Proposed: `GET /invoices/:id` includes payments. The contract defines `Payment` but
 * no endpoint that returns it, and the detail screen must show cash received and TDS
 * deducted separately.
 */
export interface InvoiceDetail extends Invoice {
  payments: Payment[]
}

/**
 * Proposed: the `edits` payload for `POST /chat/resume` with `decision: "edit"`.
 * Limited to the editable fields named in the brief. `amount` is a decimal string.
 * The server recomputes tax and answers with a new `approval_required` event.
 */
export interface DraftEdits {
  customerId?: string
  description?: string
  amount?: string
  dueDate?: string
}

/**
 * Proposed: emitted on `POST /chat/resume` after an `approve` decision. The approval
 * card must show the issued number and link to the invoice, but no existing event
 * carries that information.
 */
export interface InvoiceIssuedEvent {
  type: 'invoice_issued'
  invoice: Invoice
}

/**
 * Proposed: body of `POST /customers`. Answers with the created `Customer`.
 */
export interface CreateCustomerRequest {
  name: string
  gstin?: string
  stateCode?: string
}

/**
 * Proposed: body of `POST /invoices`, which creates a DRAFT. Answers with the draft as an
 * `Invoice` whose tax, subtotal and total the server has already calculated. `taxableValue`
 * and `gstRate` are decimal strings exactly as typed; the UI never computes anything from them.
 */
export interface CreateInvoiceRequest {
  customerId: string
  dueDate: string
  items: InvoiceItem[]
  /** Letter of Undertaking reference, for zero-rated exports. */
  lutRef?: string
}
/**
 * Proposed: JSON error body for non-2xx responses, mirroring the SSE `error` event.
 * The client also tolerates FastAPI's default `{ "detail": "..." }` body.
 */
export interface ApiErrorBody {
  code: string
  message: string
}
