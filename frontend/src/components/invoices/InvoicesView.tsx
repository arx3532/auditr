'use client'

import { DownloadIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { TableSkeleton } from '@/components/common/Skeletons'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { isApiError } from '@/lib/api/client'
import { downloadCsvBlob, useInvoicesQuery } from '@/lib/api/queries'
import { useApi } from '@/lib/api/useApi'
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
  const [exporting, setExporting] = useState(false)
  const api = useApi()
  const query = useInvoicesQuery(filter === 'all' ? undefined : filter)

  const invoices = query.data?.pages.flatMap((page) => page.items) ?? []

  async function handleExportCsv() {
    try {
      setExporting(true)
      const { blob, filename } = await api.exportInvoicesCsv()
      downloadCsvBlob(blob, filename ?? 'invoices.csv')
      toast.success('Invoices exported successfully')
    } catch (err) {
      toast.error(isApiError(err) ? err.message : 'Could not export invoices CSV.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={exporting}
          className="rounded-xl border-border font-medium"
        >
          {exporting ? <Spinner className="mr-1.5 size-4" /> : <DownloadIcon className="mr-1.5 size-4" />}
          Export CSV
        </Button>
      </div>

      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError && !query.data ? (
        <ErrorState
          title="Could not load invoices"
          error={query.error}
          onRetry={() => void query.refetch()}
          noDataFallback
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
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs dark:border-white/[0.15]">
            <InvoiceTable invoices={invoices} caption="Invoices" />
          </div>
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
