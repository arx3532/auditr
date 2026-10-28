import type { InvoiceStatus } from '@/lib/api/types'

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

export const INVOICE_STATUSES = Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUSES as string[]).includes(value)
}
