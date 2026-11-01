'use client'

import { ArrowLeftIcon } from 'lucide-react'
import Link from 'next/link'

import { ErrorState } from '@/components/common/ErrorState'
import { DetailSkeleton } from '@/components/common/Skeletons'
import { buttonVariants } from '@/components/ui/button'
import { isApiError } from '@/lib/api/client'
import { useInvoicePaymentsQuery, useInvoiceQuery } from '@/lib/api/queries'
import { cn } from '@/lib/utils'

import { DraftReviewBar } from './DraftReviewBar'
import { InvoiceDetail } from './InvoiceDetail'

export function InvoiceDetailView({ id }: { id: string }) {
  const invoiceQuery = useInvoiceQuery(id)
  const paymentsQuery = useInvoicePaymentsQuery(id)

  const notFound = isApiError(invoiceQuery.error) && invoiceQuery.error.kind === 'not_found'

  // Show skeleton while either core query is loading for the first time.
  const isPending = invoiceQuery.isPending || paymentsQuery.isPending

  return (
    <div className="flex flex-col gap-4">
      <Link href="/invoices" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}>
        <ArrowLeftIcon data-icon="inline-start" />
        All invoices
      </Link>

      {isPending ? (
        <DetailSkeleton />
      ) : invoiceQuery.isError ? (
        <ErrorState
          title={notFound ? 'Invoice not found' : 'Could not load this invoice'}
          error={invoiceQuery.error}
          onRetry={() => void invoiceQuery.refetch()}
        />
      ) : (
        <>
          {invoiceQuery.data.status === 'draft' ? (
            <DraftReviewBar invoiceId={invoiceQuery.data.id} />
          ) : null}
          <InvoiceDetail
            invoice={invoiceQuery.data}
            payments={paymentsQuery.data ?? []}
          />
        </>
      )}
    </div>
  )
}
