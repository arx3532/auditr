import { z } from 'zod'

import type { CreateCustomerRequest, CreateInvoiceRequest, DraftEditItem, DraftEdits, Invoice } from './types'

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * Validates the shape of a decimal amount string.
 * The value stays a string end to end — the server computes all totals and tax.
 */
const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount such as 50000 or 50000.00')
  .refine((value) => /[1-9]/.test(value), 'Amount must be greater than zero')

/** GST slabs offered in forms. The server decides what each rate means for tax. */
export const GST_RATES = ['0', '5', '12', '18', '28'] as const

// ---------------------------------------------------------------------------
// Draft-edit form  (one item — only active when draft.items.length === 1)
// ---------------------------------------------------------------------------

/**
 * Zod schema for the draft-edit dialog.
 *
 * Each field maps 1-to-1 to `InvoiceUpdateIn` / `ItemIn` (backend camelCase fields).
 * On submit, `toDraftEdits` assembles the full `items` replacement array required by
 * the backend — partial item patching is not supported.
 */
export const draftEditFormSchema = z.object({
  customerId: z.string().min(1, 'Choose a customer'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date'),
  /** Single line-item description (mirrors ItemIn.description). */
  description: z.string().trim().min(1, 'Enter a description').max(500, 'Keep it under 500 characters'),
  /** HSN/SAC commodity code — optional, 4–8 digits (mirrors ItemIn.hsnSac). */
  hsnSac: z.string().trim().regex(/^(\d{4,8})?$/, 'HSN/SAC is 4 to 8 digits'),
  /** Taxable value before tax, decimal string (mirrors ItemIn.taxableValue). */
  taxableValue: amountSchema,
  /** GST rate, decimal string (mirrors ItemIn.gstRate). */
  gstRate: z.enum(GST_RATES),
})

export type DraftEditForm = z.infer<typeof draftEditFormSchema>

/** Returns true only when the draft has exactly one line item — the only case the dialog supports. */
export function isEditableDraft(draft: Invoice): boolean {
  return draft.items.length === 1
}

/** Populate the edit-dialog form from the first (and only) line item of a single-item draft. */
export function draftToFormValues(draft: Invoice): DraftEditForm {
  const [item] = draft.items
  return {
    customerId: draft.customer.id,
    dueDate: draft.dueDate.slice(0, 10),
    description: item?.description ?? '',
    hsnSac: item?.hsnSac ?? '',
    taxableValue: item?.taxableValue ?? '',
    gstRate: (GST_RATES.includes(item?.gstRate as (typeof GST_RATES)[number])
      ? item?.gstRate
      : '18') as (typeof GST_RATES)[number],
  }
}

/**
 * Converts form values into a `DraftEdits` payload for `POST /chat/resume`.
 *
 * Only fields the user changed are included. If any item field changed, `items` is sent
 * as a **complete replacement** array (all fields, including unchanged ones like `hsnSac`
 * and `gstRate`). The backend rejects incomplete `ItemIn` objects.
 */
export function toDraftEdits(initial: DraftEditForm, values: DraftEditForm): DraftEdits {
  const edits: DraftEdits = {}

  if (values.customerId !== initial.customerId) edits.customerId = values.customerId
  if (values.dueDate !== initial.dueDate) edits.dueDate = values.dueDate

  const itemChanged =
    values.description.trim() !== initial.description.trim() ||
    values.hsnSac.trim() !== initial.hsnSac.trim() ||
    values.taxableValue.trim() !== initial.taxableValue.trim() ||
    values.gstRate !== initial.gstRate

  if (itemChanged) {
    const item: DraftEditItem = {
      description: values.description.trim(),
      taxableValue: values.taxableValue.trim(),
      gstRate: values.gstRate,
    }
    const hsnSac = values.hsnSac.trim()
    if (hsnSac) item.hsnSac = hsnSac
    edits.items = [item]
  }

  return edits
}

// ---------------------------------------------------------------------------
// New-invoice form  (manual creation via /invoices/new)
// ---------------------------------------------------------------------------

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date')

const lineItemSchema = z.object({
  description: z.string().trim().min(1, 'Enter a description').max(200, 'Keep it under 200 characters'),
  hsnSac: z
    .string()
    .trim()
    .regex(/^(\d{4,8})?$/, 'HSN/SAC is 4 to 8 digits'),
  amount: amountSchema,
  gstRate: z.enum(GST_RATES),
})

/** The manual "New invoice" form. No totals are held here — the server calculates them. */
export const newInvoiceFormSchema = z.object({
  customerId: z.string().min(1, 'Choose a customer'),
  dueDate: dateSchema,
  lutRef: z.string().trim().max(60, 'Keep it under 60 characters'),
  items: z
    .array(lineItemSchema)
    .min(1, 'Add at least one line item')
    .max(20, 'An invoice can have up to 20 line items'),
})

export type NewInvoiceForm = z.infer<typeof newInvoiceFormSchema>
export type NewInvoiceLineItem = NewInvoiceForm['items'][number]

export function emptyLineItem(): NewInvoiceLineItem {
  return { description: '', hsnSac: '', amount: '', gstRate: '18' }
}

/** Optional fields are left out entirely when blank so the server never receives empty strings. */
export function toCreateInvoiceRequest(values: NewInvoiceForm): CreateInvoiceRequest {
  const request: CreateInvoiceRequest = {
    customerId: values.customerId,
    dueDate: values.dueDate,
    items: values.items.map((item) => {
      const hsnSac = item.hsnSac.trim()
      return {
        description: item.description.trim(),
        ...(hsnSac ? { hsnSac } : {}),
        taxableValue: item.amount.trim(),
        gstRate: item.gstRate,
      }
    }),
  }
  const lutRef = values.lutRef.trim()
  if (lutRef) request.lutRef = lutRef
  return request
}

// ---------------------------------------------------------------------------
// New-customer form
// ---------------------------------------------------------------------------

const GSTIN_PATTERN = /^(\d{2}[A-Za-z]{5}\d{4}[A-Za-z][A-Za-z\d]Z[A-Za-z\d])?$/

export const newCustomerFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter the customer name').max(120, 'Keep it under 120 characters'),
  gstin: z.string().trim().regex(GSTIN_PATTERN, 'A GSTIN has 15 characters, e.g. 29AAAAA0000A1Z5'),
  stateCode: z
    .string()
    .trim()
    .regex(/^(\d{2})?$/, 'Use the 2-digit state code, e.g. 29'),
})

export type NewCustomerForm = z.infer<typeof newCustomerFormSchema>

export function toCreateCustomerRequest(values: NewCustomerForm): CreateCustomerRequest {
  const gstin = values.gstin.trim().toUpperCase()
  const stateCode = values.stateCode.trim()
  return {
    name: values.name.trim(),
    ...(gstin ? { gstin } : {}),
    ...(stateCode ? { stateCode } : {}),
  }
}

// ---------------------------------------------------------------------------
// Record-payment form
// ---------------------------------------------------------------------------

export const recordPaymentFormSchema = z.object({
  cashReceived: amountSchema,
  tdsDeducted: z
    .string()
    .trim()
    .regex(/^(\d{1,12}(\.\d{1,2})?)?$/, 'Enter a valid amount such as 0 or 1500.00'),
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid payment date'),
})

export type RecordPaymentForm = z.infer<typeof recordPaymentFormSchema>

// ---------------------------------------------------------------------------
// Business profile form
// ---------------------------------------------------------------------------

export const profileFormSchema = z.object({
  businessName: z.string().trim().max(200, 'Keep it under 200 characters').optional(),
  stateCode: z.string().trim().length(2, 'Select a 2-digit state code'),
})

export type ProfileForm = z.infer<typeof profileFormSchema>
