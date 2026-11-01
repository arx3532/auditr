'use client'

import { CreditCardIcon, PencilIcon } from 'lucide-react'
import { useState } from 'react'

import { DateText } from '@/components/common/DateText'
import { MoneyText } from '@/components/common/MoneyText'
import { Button } from '@/components/ui/button'
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
import type { Invoice, Payment, TaxBreakdown } from '@/lib/api/types'
import { formatRate } from '@/lib/format/money'

import { CopyLinkButton } from './CopyLinkButton'
import { EditInvoiceSheet } from './EditInvoiceSheet'
import { InvoiceStatusBadge } from './InvoiceStatusBadge'
import { RecordPaymentDialog } from './RecordPaymentDialog'

export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  )
}

export function TaxRows({ tax }: { tax: TaxBreakdown }) {
  const rows: { label: string; value: string }[] = []
  if (tax.cgst !== undefined) rows.push({ label: 'CGST', value: tax.cgst })
  if (tax.sgst !== undefined) rows.push({ label: 'SGST', value: tax.sgst })
  if (tax.igst !== undefined) rows.push({ label: 'IGST', value: tax.igst })

  if (!tax.zeroRated && rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No tax breakdown was provided.</p>
  }

  return (
    <dl className="flex flex-col gap-2">
      {tax.zeroRated ? <DetailRow label="Supply type">Zero-rated</DetailRow> : null}
      {tax.lutRef ? <DetailRow label="LUT reference">{tax.lutRef}</DetailRow> : null}
      {rows.map((row) => (
        <DetailRow key={row.label} label={row.label}>
          <MoneyText value={row.value} />
        </DetailRow>
      ))}
    </dl>
  )
}

interface InvoiceDetailProps {
  invoice: Invoice
  payments: Payment[]
  onEditDraft?: () => void
}

/** Presentational and interactive detail view with strict API integration. */
export function InvoiceDetail({ invoice, payments, onEditDraft }: InvoiceDetailProps) {
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)

  const canRecordPayment =
    ['issued', 'partially_paid', 'overdue'].includes(invoice.status) &&
    Number(invoice.amountDue) > 0

  const isShareable = invoice.status !== 'draft' && invoice.status !== 'cancelled'
  const isDraft = invoice.status === 'draft'

  function triggerEdit() {
    if (onEditDraft) onEditDraft()
    else setEditSheetOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {invoice.number ? `Invoice ${invoice.number}` : 'Draft invoice'}
            </h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {invoice.customer.name}
            {invoice.customer.gstin ? ` · GSTIN ${invoice.customer.gstin}` : ''}
          </p>
        </div>

        {/* Action toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? (
            <Button variant="outline" size="sm" onClick={triggerEdit} className="rounded-xl font-medium">
              <PencilIcon className="mr-1.5 size-4" />
              Edit draft
            </Button>
          ) : null}

          {canRecordPayment ? (
            <Button
              size="sm"
              onClick={() => setRecordPaymentOpen(true)}
              className="rounded-xl bg-primary font-semibold text-primary-foreground shadow-xs"
            >
              <CreditCardIcon className="mr-1.5 size-4" />
              Record payment
            </Button>
          ) : null}

          {isShareable ? (
            <CopyLinkButton invoiceId={invoice.id} token={invoice.publicToken} />
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2">
              {invoice.issueDate ? (
                <DetailRow label="Issue date">
                  <DateText value={invoice.issueDate} />
                </DetailRow>
              ) : null}
              <DetailRow label="Due date">
                <DateText value={invoice.dueDate} />
              </DetailRow>
              <DetailRow label="Subtotal">
                <MoneyText value={invoice.subtotal} />
              </DetailRow>
              <DetailRow label="Total">
                <MoneyText value={invoice.total} className="font-medium" />
              </DetailRow>
              <DetailRow label="Amount due">
                <MoneyText value={invoice.amountDue} className="font-semibold" />
              </DetailRow>
            </dl>
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
      </div>

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
                <TableHead>HSN/SAC</TableHead>
                <TableHead className="text-right">Taxable value</TableHead>
                <TableHead className="text-right">GST rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item, index) => (
                <TableRow key={`${item.description}-${index}`}>
                  <TableCell className="whitespace-normal">{item.description}</TableCell>
                  <TableCell>{item.hsnSac ?? '—'}</TableCell>
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Payments</CardTitle>
            <CardDescription>
              TDS is tax withheld by the customer. It is shown separately from the cash you received.
            </CardDescription>
          </div>
          {canRecordPayment ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecordPaymentOpen(true)}
              className="rounded-xl font-medium"
            >
              <CreditCardIcon className="mr-1.5 size-4" />
              Record payment
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableCaption className="sr-only">Payments</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Cash received</TableHead>
                  <TableHead className="text-right">TDS deducted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <DateText value={payment.date} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText value={payment.cashReceived} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText value={payment.tdsDeducted} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog for recording payment */}
      <RecordPaymentDialog
        open={recordPaymentOpen}
        onOpenChange={setRecordPaymentOpen}
        invoice={invoice}
      />

      {/* Sheet for manual editing of draft invoices */}
      <EditInvoiceSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        invoice={invoice}
      />
    </div>
  )
}
