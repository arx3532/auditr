import { formatDate } from '@/lib/format/date'

interface DateTextProps {
  /** ISO 8601 string exactly as returned by the server. */
  value: string
  className?: string
}

/** Locale-formatted date. Only render this from client components fed by client-fetched data. */
export function DateText({ value, className }: DateTextProps) {
  return (
    <time dateTime={value} title={value} className={className}>
      {formatDate(value)}
    </time>
  )
}
