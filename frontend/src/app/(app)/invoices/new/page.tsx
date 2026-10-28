import type { Metadata } from 'next'

import { PageHeader } from '@/components/common/PageHeader'
import { NewInvoiceForm } from '@/components/invoices/NewInvoiceForm'

export const metadata: Metadata = { title: 'New invoice' }

export default function NewInvoicePage() {
  return (
    <>
      <PageHeader
        title="New invoice"
        description="Fill in the details to create a draft. You review it before it is issued."
      />
      <div className="max-w-3xl">
        <NewInvoiceForm />
      </div>
    </>
  )
}