'use client'

import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { DetailSkeleton } from '@/components/common/Skeletons'
import { isApiError } from '@/lib/api/client'
import { usePublicInvoiceQuery } from '@/lib/api/usePublicInvoice'

import { PublicInvoice } from './PublicInvoice'

function UnavailableLink({ error }: { error: unknown }) {
  const revoked = isApiError(error) && error.kind === 'gone'

  return (
    <EmptyState
      title={revoked ? 'This invoice link was revoked' : 'This invoice link is not valid'}
      description={
        revoked
          ? 'The sender has turned this link off. Ask them for a new one.'
          : 'Check that you copied the whole link, or ask the sender to share it again.'
      }
    />
  )
}

export function PublicInvoiceView({ token }: { token: string }) {
  const { data, error, isPending, refetch } = usePublicInvoiceQuery(token)

  if (isPending) return <DetailSkeleton />

  if (error) {
    if (isApiError(error) && (error.kind === 'not_found' || error.kind === 'gone')) {
      return <UnavailableLink error={error} />
    }
    return <ErrorState error={error} onRetry={() => void refetch()} title="Could not load this invoice" />
  }

  return <PublicInvoice invoice={data} />
}
