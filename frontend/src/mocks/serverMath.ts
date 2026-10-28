/**
 * Stand-in for the backend's money math. MOCKS ONLY: nothing under `src/mocks` may be
 * imported by app code, because the real UI never calculates tax or totals.
 *
 * All arithmetic uses BigInt minor units (paise), never floating point.
 */
import type { Customer, Invoice, InvoiceItem, InvoiceStatus, TaxBreakdown } from '@/lib/api/types'

export const SELLER_STATE_CODE = '29'
export const DEMO_LUT_REF = 'LUT-DEMO-2025-26'

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/

/** "50000.00" -> 5000000n. Also used for percentage rates ("18" -> 1800n hundredths). */
export function toMinor(value: string): bigint {
  const match = DECIMAL_PATTERN.exec(value)
  if (!match) throw new Error(`Invalid decimal string: ${value}`)
  const [, whole, fraction = ''] = match
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

/** 5000000n -> "50000.00". */
export function fromMinor(minor: bigint): string {
  const whole = minor / 100n
  const fraction = (minor % 100n).toString().padStart(2, '0')
  return `${whole}.${fraction}`
}

export function sumMinor(values: string[]): bigint {
  return values.reduce((total, value) => total + toMinor(value), 0n)
}

export type TaxMode = 'intra' | 'inter' | 'zero'

/** Customers without a state code are treated as overseas (zero-rated export under LUT). */
export function taxModeFor(customer: Customer): TaxMode {
  if (!customer.stateCode) return 'zero'
  return customer.stateCode === SELLER_STATE_CODE ? 'intra' : 'inter'
}

function fullTax(taxableMinor: bigint, rateHundredths: bigint): bigint {
  return (taxableMinor * rateHundredths + 5000n) / 10000n
}

function halfTax(taxableMinor: bigint, rateHundredths: bigint): bigint {
  return (taxableMinor * rateHundredths + 10000n) / 20000n
}

export function calculateTotals(items: InvoiceItem[], mode: TaxMode) {
  let subtotal = 0n
  let cgst = 0n
  let sgst = 0n
  let igst = 0n

  for (const item of items) {
    const taxable = toMinor(item.taxableValue)
    const rate = toMinor(item.gstRate)
    subtotal += taxable
    if (mode === 'intra') {
      cgst += halfTax(taxable, rate)
      sgst += halfTax(taxable, rate)
    } else if (mode === 'inter') {
      igst += fullTax(taxable, rate)
    }
  }

  const tax: TaxBreakdown =
    mode === 'intra'
      ? { cgst: fromMinor(cgst), sgst: fromMinor(sgst) }
      : mode === 'inter'
        ? { igst: fromMinor(igst) }
        : { zeroRated: true, lutRef: DEMO_LUT_REF }

  return { tax, subtotal: fromMinor(subtotal), total: fromMinor(subtotal + cgst + sgst + igst) }
}

export interface BuildInvoiceInput {
  id: string
  number?: string
  customer: Customer
  status: InvoiceStatus
  items: InvoiceItem[]
  issueDate?: string
  dueDate: string
  publicToken?: string
  /** Cash plus TDS already credited, in paise. */
  creditedMinor?: bigint
}

export function buildInvoice(input: BuildInvoiceInput): Invoice {
  const { creditedMinor = 0n, ...rest } = input
  const { tax, subtotal, total } = calculateTotals(rest.items, taxModeFor(rest.customer))
  const amountDue = rest.status === 'cancelled' ? 0n : toMinor(total) - creditedMinor

  return {
    ...rest,
    tax,
    subtotal,
    total,
    amountDue: fromMinor(amountDue),
  }
}
