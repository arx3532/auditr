const DECIMAL_STRING = /^(-?)(\d+)(?:\.(\d+))?$/

const groupIndian = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/**
 * Display-only formatting of a server-provided decimal string, e.g. "125000.5" -> "₹1,25,000.50".
 *
 * Nothing is parsed to a float: the integer part is grouped as a BigInt and the fraction is
 * carried over as text, so no rounding or arithmetic ever happens in the browser. Anything that
 * is not a plain decimal string is returned untouched rather than guessed at.
 */
export function formatMoney(value: string): string {
  const match = DECIMAL_STRING.exec(value.trim())
  if (!match) return value

  const [, sign, integer, fraction = ''] = match
  return `${sign}₹${groupIndian.format(BigInt(integer))}.${fraction.padEnd(2, '0')}`
}

/** Display-only: server rates arrive as strings such as "18". */
export function formatRate(rate: string): string {
  return `${rate}%`
}

/**
 * Adds two server-provided decimal strings without floating-point error.
 * Both values are normalised to whole cents (2 decimal places) as BigInts,
 * summed, then converted back to a "NNNN.NN" string for display.
 *
 * Only supports non-negative values with at most 2 decimal places — exactly
 * the format that the FastAPI backend emits for all monetary fields.
 */
export function addDecimalStrings(a: string, b: string): string {
  function toCents(s: string): bigint {
    const m = DECIMAL_STRING.exec(s.trim())
    if (!m) return 0n
    const [, , integer, fraction = ''] = m
    return BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
  }
  const total = toCents(a) + toCents(b)
  const intPart = total / 100n
  const fracPart = total % 100n
  return `${intPart}.${String(fracPart).padStart(2, '0')}`
}
