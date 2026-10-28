const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Formats an ISO 8601 date in the user's locale. Date-only values ("2026-11-15") are read as
 * local calendar dates so they never shift a day across time zones. Unparseable input is
 * returned untouched.
 */
export function formatDate(iso: string, locale?: string): string {
  const dateOnly = DATE_ONLY.exec(iso)
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso)

  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}
