import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format/money'

interface MoneyTextProps {
  /** Decimal string exactly as returned by the server, e.g. "50000.00". */
  value: string
  className?: string
}

export function MoneyText({ value, className }: MoneyTextProps) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(value)}</span>
}
