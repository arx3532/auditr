import { BanIcon, CircleCheckIcon } from 'lucide-react'

import { DateText } from '@/components/common/DateText'
import { MoneyText } from '@/components/common/MoneyText'
import { DetailRow, TaxRows } from '@/components/invoices/InvoiceDetail'
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PublicInvoice as PublicInvoiceData } from '@/lib/api/types'
import { formatRate } from '@/lib/format/money'

function StatusNotice({ status }: { status: PublicInvoiceData['status'] }) {
  if (status === 'paid') {
    return (
      <Alert>
        <CircleCheckIcon />
        <AlertTitle>This invoice has been paid</AlertTitle>
        <AlertDescription>No further payment is needed. Thank you.</AlertDescription>
      </Alert>
    )
  }
  if (status === 'cancelled') {
    return (
      <Alert>
        <BanIcon />
        <AlertTitle>This invoice was cancelled</AlertTitle>
        <AlertDescription>Please do not pay it. Contact the sender if you have questions.</AlertDescription>
      </Alert>
    )
  }
  return null
}

/** Read-only, presentational. Every figure is shown exactly as the server returned it. */
export function PublicInvoice({ invoice }: { invoice: PublicInvoiceData }) {

  return (
    <article className="flex flex-col gap-6" aria-labelledby="public-invoice-heading">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 id="public-invoice-heading" className="text-2xl font-semibold tracking-tight">
            {invoice.number ? `Invoice ${invoice.number}` : 'Invoice'}
          </h1>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
        {invoice.supplierName ? (
          <p className="text-sm font-medium text-foreground">From {invoice.supplierName}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">Billed to {invoice.customerName}</p>
      </header>

      <StatusNotice status={invoice.status} />

      <Card>
        <CardHeader>
          <CardDescription>Amount due</CardDescription>
          <CardTitle className="text-3xl">
            <MoneyText value={invoice.amountDue} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2">
            <DetailRow label="Due date">
              <DateText value={invoice.dueDate} />
            </DetailRow>
            {invoice.issueDate ? (
              <DetailRow label="Issue date">
                <DateText value={invoice.issueDate} />
              </DetailRow>
            ) : null}
            <DetailRow label="Subtotal">
              <MoneyText value={invoice.subtotal} />
            </DetailRow>
            <DetailRow label="Total">
              <MoneyText value={invoice.total} className="font-medium" />
            </DetailRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption className="sr-only">Line items</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Taxable value</TableHead>
                <TableHead className="text-right">GST rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item, index) => (
                <TableRow key={`${item.description}-${index}`}>
                  <TableCell className="whitespace-normal">{item.description}</TableCell>
                  <TableCell className="text-right">
                    <MoneyText value={item.taxableValue} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatRate(item.gstRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax breakdown</CardTitle>
          <CardDescription>Calculated by the server.</CardDescription>
        </CardHeader>
        <CardContent>
          <TaxRows tax={invoice.tax} />
        </CardContent>
      </Card>
    </article>
  )
}
