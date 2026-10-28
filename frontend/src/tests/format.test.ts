import { describe, expect, it } from 'vitest'

import { formatDate } from '@/lib/format/date'
import { formatMoney, formatRate } from '@/lib/format/money'

describe('formatMoney', () => {
  it('groups digits the Indian way and keeps two decimals', () => {
    expect(formatMoney('50000.00')).toBe('₹50,000.00')
    expect(formatMoney('125000.5')).toBe('₹1,25,000.50')
    expect(formatMoney('12345678')).toBe('₹1,23,45,678.00')
  })

  it('does not round or alter long fractions', () => {
    expect(formatMoney('10.999')).toBe('₹10.999')
  })

  it('handles values beyond float precision without loss', () => {
    expect(formatMoney('9007199254740993.10')).toBe('₹9,00,71,99,25,47,40,993.10')
  })

  it('handles negatives and zero', () => {
    expect(formatMoney('-1500.00')).toBe('-₹1,500.00')
    expect(formatMoney('0')).toBe('₹0.00')
  })

  it('returns non-decimal input untouched', () => {
    expect(formatMoney('abc')).toBe('abc')
    expect(formatMoney('')).toBe('')
  })
})

describe('formatRate', () => {
  it('appends a percent sign to the server string', () => {
    expect(formatRate('18')).toBe('18%')
  })
})

describe('formatDate', () => {
  it('reads date-only values as local calendar dates', () => {
    expect(formatDate('2026-11-15', 'en-IN')).toBe('15 Nov 2026')
    expect(formatDate('2026-01-01', 'en-IN')).toBe('1 Jan 2026')
  })

  it('returns unparseable input untouched', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})
