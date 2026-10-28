'use client'

import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { TableSkeleton } from '@/components/common/Skeletons'
import { useCustomersQuery } from '@/lib/api/queries'

import { CustomerTable } from './CustomerTable'

export function CustomersView() {
  const query = useCustomersQuery()

  if (query.isPending) return <TableSkeleton />
  if (query.isError) {
    return (
      <ErrorState title="Could not load customers" error={query.error} onRetry={() => void query.refetch()} />
    )
  }
  if (query.data.length === 0) {
    return (
      <EmptyState
        title="No customers yet"
        description="Customers are added when you mention them while drafting an invoice in chat."
      />
    )
  }
  return <CustomerTable customers={query.data} />
}
