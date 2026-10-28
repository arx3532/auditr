'use client'

import { useState } from 'react'

import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { TableSkeleton } from '@/components/common/Skeletons'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useInvoicesQuery } from '@/lib/api/queries'
import type { InvoiceStatus } from '@/lib/api/types'

import { InvoiceTable } from './InvoiceTable'
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS } from './status'

type StatusFilter = InvoiceStatus | 'all'

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  ...INVOICE_STATUSES.map((status) => ({ value: status, label: INVOICE_STATUS_LABELS[status] })),
]

interface InvoicesViewProps {
  initialStatus?: InvoiceStatus
}

export function InvoicesView({ initialStatus }: InvoicesViewProps) {
  const [filter, setFilter] = useState<StatusFilter>(initialStatus ?? 'all')
  const query = useInvoicesQuery(filter === 'all' ? undefined : filter)

  const invoices = query.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="invoice-status-filter" className="text-sm font-medium">
          Status
        </label>
        <Select items={FILTER_OPTIONS} value={filter} onValueChange={(next) => setFilter(next ?? 'all')}>
          <SelectTrigger id="invoice-status-filter" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError && !query.data ? (
        <ErrorState
          title="Could not load invoices"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : invoices.length === 0 ? (
        filter === 'all' ? (
          <EmptyState
            title="No invoices yet"
            description="Create one with New invoice, or ask the assistant in chat to draft it."
          />
        ) : (
          <EmptyState
            title="No matching invoices"
            description={`You have no ${INVOICE_STATUS_LABELS[filter].toLowerCase()} invoices.`}
          >
            <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
              Clear filter
            </Button>
          </EmptyState>
        )
      ) : (
        <>
          <InvoiceTable invoices={invoices} caption="Invoices" />
          {query.isFetchNextPageError ? (
            <ErrorState
              title="Could not load more invoices"
              error={query.error}
              onRetry={() => void query.fetchNextPage()}
            />
          ) : null}
          {query.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
