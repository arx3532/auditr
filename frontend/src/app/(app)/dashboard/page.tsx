import type { Metadata } from 'next'

import { PageHeader } from '@/components/common/PageHeader'
import { DashboardView } from '@/components/dashboard/DashboardView'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Revenue this month, overdue invoices and recent activity." />
      <DashboardView />
    </>
  )
}
