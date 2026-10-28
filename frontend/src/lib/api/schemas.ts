import { z } from 'zod'

import type { CreateCustomerRequest, CreateInvoiceRequest, DraftEdits, Invoice } from './types'
/**
 * Validates the shape of a typed amount only. The value stays a decimal string end to end;
 * it is never parsed to a number, and the server decides what the totals and tax become.
 */
const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount such as 50000 or 50000.00')
  .refine((value) => /[1-9]/.test(value), 'Amount must be greater than zero')

/** The fields the user may change on a draft. Mirrors `DraftEdits` in the contract. */
export const draftEditFormSchema = z.object({
  customerId: z.string().min(1, 'Choose a customer'),
  description: z.string().trim().min(1, 'Enter a description').max(200, 'Keep it under 200 characters'),
  amount: amountSchema,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date'),
})

export type DraftEditForm = z.infer<typeof draftEditFormSchema>

/**
 * Edits apply to a draft's first line item, so a draft with several items cannot be edited
 * here. That limit comes from `DraftEdits` having a single `description` and `amount`.
 */
export function isEditableDraft(draft: Invoice): boolean {
  return draft.items.length === 1
}

export function draftToFormValues(draft: Invoice): DraftEditForm {
  const [item] = draft.items
  return {
    customerId: draft.customer.id,
    description: item?.description ?? '',
    amount: item?.taxableValue ?? '',
    dueDate: draft.dueDate.slice(0, 10),
  }
}

/** Only the fields that changed are sent, so the server never receives values the user left alone. */
export function toDraftEdits(initial: DraftEditForm, values: DraftEditForm): DraftEdits {
  const edits: DraftEdits = {}
  if (values.customerId !== initial.customerId) edits.customerId = values.customerId
  if (values.description.trim() !== initial.description) edits.description = values.description.trim()
  if (values.amount.trim() !== initial.amount) edits.amount = values.amount.trim()
  if (values.dueDate !== initial.dueDate) edits.dueDate = values.dueDate
  return edits
}

/** GST slabs offered in the form. The server decides what a rate means for tax. */
export const GST_RATES = ['0', '5', '12', '18', '28'] as const

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

/** The manual "New invoice" form. Note it holds no totals: the server calculates them. */
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

/** Optional fields are left out entirely when blank, so the server never receives empty strings. */
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