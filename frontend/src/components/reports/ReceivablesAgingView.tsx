'use client'

import { ClockIcon } from 'lucide-react'

import { DateText } from '@/components/common/DateText'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { MoneyText } from '@/components/common/MoneyText'
import { TableSkeleton } from '@/components/common/Skeletons'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useReceivablesAgingQuery } from '@/lib/api/queries'
import { cn } from '@/lib/utils'

function bucketTitle(bucket: string): string {
  switch (bucket) {
    case 'current':
    case '0_30':
      return '0 - 30 Days'
    case '31_60':
      return '31 - 60 Days'
    case '61_90':
      return '61 - 90 Days'
    case '90_plus':
    case 'over_90':
      return '90+ Days (Critical)'
    default:
      return bucket.replace(/_/g, ' ')
  }
}

function bucketBadgeStyle(bucket: string): string {
  if (bucket.includes('90') || bucket.includes('over')) return 'border-destructive/40 bg-destructive/10 text-destructive'
  if (bucket.includes('61')) return 'border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning'
  if (bucket.includes('31')) return 'border-highlight/40 bg-highlight/15 text-highlight-foreground'
  return 'border-success/30 bg-success/10 text-success'
}

export function ReceivablesAgingView() {
  const query = useReceivablesAgingQuery()

  return (
    <div className="flex flex-col gap-6">
      {query.isPending ? (
        <TableSkeleton rows={4} />
      ) : query.isError ? (
        <ErrorState
          title="Could not load aging report"
          error={query.error}
          onRetry={() => void query.refetch()}
          noDataFallback
        />
      ) : !query.data || query.data.buckets.length === 0 ? (
        <EmptyState
          title="No outstanding receivables"
          description="All issued invoices have been settled in full."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Header Metric Card */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardDescription className="text-xs font-semibold uppercase">Total Outstanding Receivables</CardDescription>
                <CardTitle className="text-3xl font-extrabold tracking-tight">
                  <MoneyText value={query.data.totalDue} />
                </CardTitle>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-right">
                <ClockIcon className="size-4" />
                <span>As of <DateText value={query.data.asOf} /></span>
              </div>
            </CardHeader>
          </Card>

          {/* Aging Buckets Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {query.data.buckets.map((b) => {
              const totalDueNum = Number(query.data?.totalDue || 0)
              const bucketDueNum = Number(b.amountDue)
              const percent = totalDueNum > 0 ? Math.min(100, Math.round((bucketDueNum / totalDueNum) * 100)) : 0

              return (
                <Card key={b.bucket} className="border-border bg-card flex flex-col justify-between">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', bucketBadgeStyle(b.bucket))}>
                        {bucketTitle(b.bucket)}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {b.invoiceCount} {b.invoiceCount === 1 ? 'invoice' : 'invoices'}
                      </span>
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight pt-3">
                      <MoneyText value={b.amountDue} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Share of debt</span>
                      <span className="font-semibold">{percent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          b.bucket.includes('90')
                            ? 'bg-destructive'
                            : b.bucket.includes('61')
                              ? 'bg-warning'
                              : 'bg-primary',
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}