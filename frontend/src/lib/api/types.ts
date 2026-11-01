/**
 * API contract between this client and the FastAPI backend.
 *
 * Money fields are decimal STRINGS (e.g. "50000.00"). Never parse them to floats for
 * arithmetic: the server computes GST, TDS and totals; the UI only displays them.
 * Dates are ISO 8601 strings (YYYY-MM-DD).
 *
 * The backend is the single source of truth. All types here mirror the FastAPI Pydantic
 * models with their camelCase alias-generator applied.
 */

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

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

/**
 * Mirrors `InvoiceOut`. Returned by:
 *   - GET  /invoices            (inside InvoiceListResponse.items)
 *   - GET  /invoices/:id
 *   - POST /invoices
 *   - PATCH /invoices/:id
 *   - POST /invoices/:id/issue
 *   - POST /invoices/:id/cancel
 *
 * Payments are NOT embedded. Fetch separately:
 *   GET /invoices/:id/payments → Payment[]
 */
export interface Invoice {
  id: string
  /** Present only once the invoice is issued. */
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

/** Mirrors `InvoiceListOut`. Returned by GET /invoices. */
export interface InvoiceListResponse {
  items: Invoice[]
  /** Absent when there are no more pages. */
  nextCursor?: string
}

/** Mirrors `PaymentOut`. Returned by GET /invoices/:id/payments. */
export interface Payment {
  id: string
  invoiceId: string
  cashReceived: string
  tdsDeducted: string
  /** `paid_on` field serialised as `date` by the backend alias. */
  date: string
}

/** Mirrors `SummaryOut`. Returned by GET /reports/summary. */
export interface ReportSummary {
  revenueThisMonth: string
  overdueCount: number
  overdueTotal: string
}

// ---------------------------------------------------------------------------
// Report types (all mirrors of their Pydantic counterparts)
// ---------------------------------------------------------------------------

/** Mirrors `GstAmountsOut`. Used as a base for month/supply/totals rows. */
export interface GstAmounts {
  invoiceCount: number
  taxableValue: string
  cgst: string
  sgst: string
  igst: string
  totalTax: string
}

/** Mirrors `GstMonthOut`. */
export interface GstMonth extends GstAmounts {
  month: string
}

/** Mirrors `GstSupplyOut`. */
export interface GstSupply extends GstAmounts {
  supplyType: string
}

/** Mirrors `GstSummaryOut`. Returned by GET /reports/gst-summary. */
export interface GstSummary {
  fromDate: string
  toDate: string
  months: GstMonth[]
  bySupplyType: GstSupply[]
  totals: GstAmounts
}

/** Mirrors `HsnRowOut`. */
export interface HsnRow extends GstAmounts {
  hsnSac: string
}

/** Mirrors `HsnSummaryOut`. Returned by GET /reports/hsn-summary. */
export interface HsnSummary {
  fromDate: string
  toDate: string
  rows: HsnRow[]
}

/** Mirrors `TdsRowOut`. */
export interface TdsRow {
  customerId: string
  customerName: string
  paymentCount: number
  cashReceived: string
  tdsDeducted: string
}

/** Mirrors `TdsReportOut`. Returned by GET /reports/tds. */
export interface TdsReport {
  financialYear: string
  fromDate: string
  toDate: string
  rows: TdsRow[]
  totalCashReceived: string
  totalTdsDeducted: string
}

/** Mirrors `AgingBucketOut`. */
export interface AgingBucket {
  bucket: string
  invoiceCount: number
  amountDue: string
}

/** Mirrors `AgingOut`. Returned by GET /reports/receivables-aging. */
export interface ReceivablesAging {
  asOf: string
  buckets: AgingBucket[]
  totalDue: string
}

/** Mirrors `ShareLinkOut`. Returned by POST /invoices/:id/public-link. */
export interface ShareLink {
  token: string
  path: string
}

/** Mirrors `PublicInvoiceOut`. Returned by GET /public/invoices/:token (unauthenticated). */
export interface PublicInvoice {
  number?: string
  status: InvoiceStatus
  supplierName?: string
  customerName: string
  items: InvoiceItem[]
  tax: TaxBreakdown
  subtotal: string
  total: string
  amountDue: string
  issueDate?: string
  dueDate: string
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

/** Body for PUT /me/profile. */
export interface UpdateProfileRequest {
  stateCode: string
  businessName?: string | null
}

/** Body for POST /customers. */
export interface CreateCustomerRequest {
  name: string
  gstin?: string
  stateCode?: string
}

/**
 * Body for POST /invoices (creates a draft).
 * The server calculates GST, TDS and totals — never compute them on the client.
 */
export interface CreateInvoiceRequest {
  customerId: string
  dueDate: string
  items: InvoiceItem[]
  /** Letter of Undertaking reference, for zero-rated exports. */
  lutRef?: string
}

/**
 * Body for PATCH /invoices/:id.
 * All fields are optional; only changed fields need be sent.
 * When `items` is present it is a full replacement — partial item patching is not supported.
 */
export interface UpdateInvoiceRequest {
  customerId?: string
  dueDate?: string
  items?: InvoiceItem[]
  lutRef?: string | null
}

/** Body for POST /invoices/:id/payments. */
export interface RecordPaymentRequest {
  cashReceived: string
  /** Defaults to "0.00" if omitted. */
  tdsDeducted?: string
  /** ISO date string. Defaults to today on the server if omitted. Uses `date` alias. */
  date?: string
}

/** Response from POST /invoices/:id/payments. */
export interface RecordPaymentResponse {
  payment: Payment
  invoice: Invoice
}

// ---------------------------------------------------------------------------
// Chat / SSE types
// ---------------------------------------------------------------------------

export type ResumeDecision = 'approve' | 'reject' | 'edit'

export interface ChatRequest {
  threadId?: string
  message: string
}

/**
 * Body for POST /chat/resume. Mirrors `ResumeIn`.
 * `approvalId` is required — the backend validates it against the pending thread state.
 */
export interface ChatResumeRequest {
  threadId: string
  approvalId: string
  decision: ResumeDecision
  edits?: DraftEdits
}

/**
 * A record-payment approval: what will happen if the user confirms.
 * Mirrors the `payment` object built by the backend's `build_approval_payload`.
 */
export interface PaymentApproval {
  invoice: Invoice
  cashReceived: string
  tdsDeducted: string
  date: string
  amountDueAfter: string
  statusAfter: InvoiceStatus
}

interface ApprovalRequiredBase {
  type: 'approval_required'
  approvalId: string
  expiresAt: string
}

/**
 * The graph paused for a human decision. Exactly one of `draft` (issue an invoice) or
 * `payment` (record a payment) is present.
 */
export type ApprovalRequiredEvent =
  | (ApprovalRequiredBase & { draft: Invoice; payment?: undefined })
  | (ApprovalRequiredBase & { payment: PaymentApproval; draft?: undefined })

/** How a pending approval ended. Mirrors the backend `Outcome.kind`. */
export type ApprovalOutcome = 'approved' | 'rejected' | 'expired'

/**
 * Sent first on `POST /chat/resume` for an approve or reject decision, before any model text.
 * `invoice` is present when an invoice was issued or a payment recorded against it;
 * `payment` is present only for an approved record-payment decision.
 */
export interface ApprovalResolvedEvent {
  type: 'approval_resolved'
  approvalId: string
  outcome: ApprovalOutcome
  invoice?: Invoice
  payment?: Payment
}

/** Server-sent events on `POST /chat` and `POST /chat/resume`. Each is JSON in `data:`. */
export type ChatEvent =
  | { type: 'thread'; threadId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; tool: string }
  | { type: 'tool_end'; tool: string }
  | ApprovalRequiredEvent
  | ApprovalResolvedEvent
  | { type: 'error'; code: string; message: string }
  | { type: 'done' }

// ---------------------------------------------------------------------------
// Draft-edit contract (used by POST /chat/resume with decision: "edit")
// ---------------------------------------------------------------------------

/**
 * One line item in a draft-edit payload. Mirrors `ItemIn` (camelCase).
 * `taxableValue` and `gstRate` are decimal strings.
 */
export interface DraftEditItem {
  description: string
  hsnSac?: string
  taxableValue: string
  gstRate: string
}

/**
 * The `edits` payload for POST /chat/resume with `decision: "edit"`.
 * Mirrors `InvoiceUpdateIn` (camelCase). Only changed fields need be sent.
 *
 * IMPORTANT: `items`, when present, is a **complete replacement** list.
 * Send every item — including unchanged ones — not just the modified row.
 */
export interface DraftEdits {
  customerId?: string
  dueDate?: string
  items?: DraftEditItem[]
  /** Set to `null` to clear an existing LUT reference. */
  lutRef?: string | null
}

// ---------------------------------------------------------------------------
// Profile (GET /me)
// ---------------------------------------------------------------------------

/**
 * Mirrors the inline dict returned by GET /me.
 * `stateCode` and `businessName` can be null when the user has never saved their profile.
 */
export interface UserProfile {
  id: string
  stateCode: string | null
  businessName: string | null
}

// ---------------------------------------------------------------------------
// Thread view (GET /chat/threads/:threadId)
// ---------------------------------------------------------------------------

/**
 * The `pendingApproval` payload shape inside `GET /chat/threads/:id`.
 *
 * For an issue-invoice approval `draft` is present.
 * For a record-payment approval `payment` is present.
 * Both share `approvalId`, `kind`, and `expiresAt`.
 *
 * The `kind` field is an internal label emitted by the backend approval service.
 * We keep it as a string here rather than a union so a new approval kind never
 * breaks an older client — the chat reducer will simply ignore it gracefully.
 */
export interface PendingApprovalPayload {
  approvalId: string
  kind: string
  expiresAt: string
  /** Present for issue-invoice approvals. */
  draft?: Invoice
  /** Present for record-payment approvals. */
  payment?: PaymentApproval
}

/** Mirrors the response of GET /chat/threads/:threadId. */
export interface ThreadView {
  threadId: string
  pendingApproval: PendingApprovalPayload | null
}