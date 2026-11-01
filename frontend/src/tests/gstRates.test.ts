import { describe, expect, it } from 'vitest'

import {
  GST_RATES,
  draftEditFormSchema,
  draftToFormValues,
  newInvoiceFormSchema,
} from '@/lib/api/schemas'
import { createInitialRecords } from '@/mocks/fixtures'

// Mirrors `allowed_gst_rates` in backend/app/domain/data/tax_rules.json. The backend rejects
// every other rate, so the forms must not offer one.
const BACKEND_RATES = ['0', '5', '18', '40']

describe('GST rates', () => {
  it('offers exactly the rates the backend accepts', () => {
    expect([...GST_RATES]).toEqual(BACKEND_RATES)
  })

  it.each(['12', '28'])('does not accept the withdrawn %s%% rate in either form', (rate) => {
    const line = { description: 'Work', hsnSac: '', amount: '1000.00', gstRate: rate }
    const newInvoice = newInvoiceFormSchema.safeParse({
      customerId: 'cus_1',
      dueDate: '2030-01-01',
      lutRef: '',
      items: [line],
    })
    expect(newInvoice.success).toBe(false)

    const edit = draftEditFormSchema.safeParse({
      customerId: 'cus_1',
      dueDate: '2030-01-01',
      description: 'Work',
      hsnSac: '',
      taxableValue: '1000.00',
      gstRate: rate,
    })
    expect(edit.success).toBe(false)
  })

  it('accepts 40%', () => {
    const edit = draftEditFormSchema.safeParse({
      customerId: 'cus_1',
      dueDate: '2030-01-01',
      description: 'Work',
      hsnSac: '',
      taxableValue: '1000.00',
      gstRate: '40',
    })
    expect(edit.success).toBe(true)
  })

  it('falls back to 18 when a draft carries a rate the form no longer offers', () => {
    const draft = createInitialRecords()[0].invoice
    const odd = { ...draft, items: [{ ...draft.items[0], gstRate: '12' }] }
    expect(draftToFormValues(odd).gstRate).toBe('18')
  })
})