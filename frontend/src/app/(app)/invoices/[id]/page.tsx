import type { Metadata } from 'next'

import { InvoiceDetailView } from '@/components/invoices/InvoiceDetailView'

export const metadata: Metadata = { title: 'Invoice' }

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <InvoiceDetailView id={id} />
}
