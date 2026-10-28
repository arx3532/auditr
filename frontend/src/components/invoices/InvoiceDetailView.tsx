'use client'

import { ArrowLeftIcon } from 'lucide-react'
import Link from 'next/link'

import { ErrorState } from '@/components/common/ErrorState'
import { DetailSkeleton } from '@/components/common/Skeletons'
import { buttonVariants } from '@/components/ui/button'
import { isApiError } from '@/lib/api/client'
import { useInvoiceQuery } from '@/lib/api/queries'
import { cn } from '@/lib/utils'

import { DraftReviewBar } from './DraftReviewBar'
import { InvoiceDetail } from './InvoiceDetail'

export function InvoiceDetailView({ id }: { id: string }) {
  const query = useInvoiceQuery(id)

  const notFound = isApiError(query.error) && query.error.kind === 'not_found'

  return (
    <div className="flex flex-col gap-4">
      <Link href="/invoices" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}>
        <ArrowLeftIcon data-icon="inline-start" />
        All invoices
      </Link>

      {query.isPending ? (
        <DetailSkeleton />
      ) : query.isError ? (
        <ErrorState
          title={notFound ? 'Invoice not found' : 'Could not load this invoice'}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {query.data.status === 'draft' ? <DraftReviewBar invoiceId={query.data.id} /> : null}
          <InvoiceDetail invoice={query.data} />
        </>
      )}
    </div>
  )
}