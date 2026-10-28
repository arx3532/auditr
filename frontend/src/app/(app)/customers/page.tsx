import type { Metadata } from 'next'

import { CustomersView } from '@/components/customers/CustomersView'
import { PageHeader } from '@/components/common/PageHeader'

export const metadata: Metadata = { title: 'Customers' }

export default function CustomersPage() {
  return (
    <>
      <PageHeader title="Customers" description="People and companies you invoice." />
      <CustomersView />
    </>
  )
}
