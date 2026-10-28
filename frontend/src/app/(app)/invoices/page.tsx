import { SquarePenIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader } from '@/components/common/PageHeader'
import { InvoicesView } from '@/components/invoices/InvoicesView'
import { isInvoiceStatus } from '@/components/invoices/status'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Invoices' }

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>
}) {
  const { status } = await searchParams
  const initialStatus = typeof status === 'string' && isInvoiceStatus(status) ? status : undefined

  return (
    <>
      <PageHeader title="Invoices" description="All invoices, filterable by status.">
        <Link href="/invoices/new" className={buttonVariants()}>
          <SquarePenIcon data-icon="inline-start" />
          New invoice
        </Link>
      </PageHeader>
      <InvoicesView initialStatus={initialStatus} />
    </>
  )
}