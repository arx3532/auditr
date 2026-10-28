/**
 * Seed data for a fictional freelance designer based in Karnataka (state code 29).
 * All names, GSTINs and references are obviously fake. No PAN, Aadhaar or bank data.
 */
import type { Customer, Invoice, InvoiceItem, InvoiceStatus, Payment } from '@/lib/api/types'

import { buildInvoice, sumMinor } from './serverMath'

export const CUSTOMERS: Customer[] = [
  { id: 'cus_adtech', name: 'AdTech Solutions Pvt Ltd', gstin: '29AAAAA0000A1Z5', stateCode: '29' },
  { id: 'cus_bluepeak', name: 'Bluepeak Studios LLP', gstin: '27BBBBB0000B1Z6', stateCode: '27' },
  { id: 'cus_chai', name: 'Chai & Co Cafes', stateCode: '29' },
  { id: 'cus_northwind', name: 'Northwind Labs Inc (US)' },
]

export const REVOKED_PUBLIC_TOKEN = 'revoked-demo-token'

export interface InvoiceRecord {
  invoice: Invoice
  payments: Payment[]
}

export function isoDate(now: Date, offsetDays: number): string {
  return new Date(now.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

export function customerById(id: string): Customer {
  const customer = CUSTOMERS.find((candidate) => candidate.id === id)
  if (!customer) throw new Error(`Unknown mock customer: ${id}`)
  return customer
}

export function serviceItem(description: string, taxableValue: string, zeroRated = false): InvoiceItem {
  return { description, hsnSac: '998391', taxableValue, gstRate: zeroRated ? '0' : '18' }
}

interface SeedPayment {
  cash: string
  tds: string
  dateOffset: number
}

interface SeedInput {
  n: string
  customerId: string
  status: InvoiceStatus
  description: string
  taxable: string
  issueOffset?: number
  dueOffset: number
  payments?: SeedPayment[]
}

function seed(now: Date, input: SeedInput): InvoiceRecord {
  const id = `inv_${input.n}`
  const customer = customerById(input.customerId)
  const numbered = input.status !== 'draft'
  const payments: Payment[] = (input.payments ?? []).map((payment, index) => ({
    id: `pay_${input.n}_${index + 1}`,
    invoiceId: id,
    cashReceived: payment.cash,
    tdsDeducted: payment.tds,
    date: isoDate(now, payment.dateOffset),
  }))
  const credited = sumMinor(payments.flatMap((payment) => [payment.cashReceived, payment.tdsDeducted]))

  const invoice = buildInvoice({
    id,
    number: numbered ? `INV-${input.n}` : undefined,
    customer,
    status: input.status,
    items: [serviceItem(input.description, input.taxable, !customer.stateCode)],
    issueDate: input.issueOffset === undefined ? undefined : isoDate(now, input.issueOffset),
    dueDate: isoDate(now, input.dueOffset),
    publicToken: numbered ? `pubtok-inv-${input.n}` : undefined,
    creditedMinor: credited,
  })

  return { invoice, payments }
}

/** Newest first. Dates are relative to `now`, so the overdue invoice stays overdue. */
export function createInitialRecords(now: Date = new Date()): InvoiceRecord[] {
  return [
    seed(now, {
      n: '0010',
      customerId: 'cus_bluepeak',
      status: 'draft',
      description: 'Brand identity refresh',
      taxable: '30000.00',
      dueOffset: 30,
    }),
    seed(now, {
      n: '0009',
      customerId: 'cus_adtech',
      status: 'issued',
      description: 'Campaign landing page design',
      taxable: '80000.00',
      issueOffset: -2,
      dueOffset: 28,
    }),
    seed(now, {
      n: '0008',
      customerId: 'cus_northwind',
      status: 'issued',
      description: 'Product UI design sprint',
      taxable: '100000.00',
      issueOffset: -5,
      dueOffset: 25,
    }),
    seed(now, {
      n: '0007',
      customerId: 'cus_bluepeak',
      status: 'issued',
      description: 'Website redesign, phase 2',
      taxable: '200000.00',
      issueOffset: -10,
      dueOffset: 20,
    }),
    seed(now, {
      n: '0006',
      customerId: 'cus_chai',
      status: 'cancelled',
      description: 'Menu card illustration',
      taxable: '25000.00',
      issueOffset: -25,
      dueOffset: -5,
    }),
    seed(now, {
      n: '0005',
      customerId: 'cus_adtech',
      status: 'partially_paid',
      description: 'Design system and component library',
      taxable: '120000.00',
      issueOffset: -35,
      dueOffset: 5,
      payments: [{ cash: '60000.00', tds: '12000.00', dateOffset: -8 }],
    }),
    seed(now, {
      n: '0004',
      customerId: 'cus_chai',
      status: 'overdue',
      description: 'Cafe logo and signage',
      taxable: '30000.00',
      issueOffset: -40,
      dueOffset: -10,
    }),
    seed(now, {
      n: '0003',
      customerId: 'cus_northwind',
      status: 'paid',
      description: 'Mobile app design, milestone 1',
      taxable: '150000.00',
      issueOffset: -50,
      dueOffset: -20,
      payments: [{ cash: '150000.00', tds: '0.00', dateOffset: -30 }],
    }),
    seed(now, {
      n: '0002',
      customerId: 'cus_adtech',
      status: 'paid',
      description: 'Social media creative pack',
      taxable: '25000.00',
      issueOffset: -60,
      dueOffset: -30,
      payments: [{ cash: '27000.00', tds: '2500.00', dateOffset: -35 }],
    }),
    seed(now, {
      n: '0001',
      customerId: 'cus_bluepeak',
      status: 'paid',
      description: 'Pitch deck design',
      taxable: '75000.00',
      issueOffset: -75,
      dueOffset: -45,
      payments: [{ cash: '81000.00', tds: '7500.00', dateOffset: -50 }],
    }),
  ]
}
