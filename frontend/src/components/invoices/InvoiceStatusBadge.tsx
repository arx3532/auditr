import type { InvoiceStatus } from '@/lib/api/types'
import { cn } from '@/lib/utils'

import { INVOICE_STATUS_LABELS } from './status'

const STATUS_STYLES: Record<
  InvoiceStatus,
  {
    badgeClass: string
    dotClass: string
  }
> = {
  paid: {
    badgeClass: 'border-success/30 bg-success/15 text-success',
    dotClass: 'bg-success',
  },
  overdue: {
    badgeClass: 'border-destructive/30 bg-destructive/15 text-destructive',
    dotClass: 'bg-destructive animate-pulse',
  },
  issued: {
    badgeClass: 'border-primary/30 bg-primary/10 text-primary dark:text-emerald-400',
    dotClass: 'bg-primary dark:bg-emerald-400',
  },
  partially_paid: {
    badgeClass: 'border-secondary bg-secondary text-secondary-foreground',
    dotClass: 'bg-secondary-foreground',
  },
  draft: {
    badgeClass: 'border-warning/30 bg-warning/15 text-amber-700 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
  cancelled: {
    badgeClass: 'border-border bg-muted text-muted-foreground',
    dotClass: 'bg-muted-foreground',
  },
}

/** Always shows the status as text with accessible color dot indicator. */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const config = STATUS_STYLES[status] || STATUS_STYLES.draft

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-2xs',
        config.badgeClass,
      )}
    >
      <span className={cn('size-1.5 rounded-full', config.dotClass)} aria-hidden="true" />
      <span>{INVOICE_STATUS_LABELS[status]}</span>
    </span>
  )
}
