import Link from 'next/link'

import { DateText } from '@/components/common/DateText'
import { MoneyText } from '@/components/common/MoneyText'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Invoice } from '@/lib/api/types'

import { InvoiceStatusBadge } from './InvoiceStatusBadge'

interface InvoiceTableProps {
  invoices: Invoice[]
  caption: string
}

export function InvoiceTable({ invoices, caption }: InvoiceTableProps) {
  return (
    <Table>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Due date</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Amount due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="font-medium">
              <Link
                href={`/invoices/${encodeURIComponent(invoice.id)}`}
                className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {invoice.number ?? 'Draft'}
                <span className="sr-only"> for {invoice.customer.name}</span>
              </Link>
            </TableCell>
            <TableCell>{invoice.customer.name}</TableCell>
            <TableCell>
              <InvoiceStatusBadge status={invoice.status} />
            </TableCell>
            <TableCell>
              <DateText value={invoice.dueDate} />
            </TableCell>
            <TableCell className="text-right">
              <MoneyText value={invoice.total} />
            </TableCell>
            <TableCell className="text-right">
              <MoneyText value={invoice.amountDue} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
