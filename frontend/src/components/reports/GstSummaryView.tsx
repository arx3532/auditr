'use client'

import { useState } from 'react'

import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { MoneyText } from '@/components/common/MoneyText'
import { TableSkeleton } from '@/components/common/Skeletons'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useGstSummaryQuery } from '@/lib/api/queries'
import { addDecimalStrings } from '@/lib/format/money'
import { cn } from '@/lib/utils'

function supplyLabel(type: string): string {
  if (type === 'intra_state') return 'Intra-State (CGST + SGST)'
  if (type === 'inter_state') return 'Inter-State (IGST)'
  if (type === 'zero_rated') return 'Zero-Rated / Export (LUT)'
  return type
}

function supplyBadgeStyle(type: string): string {
  if (type === 'intra_state') return 'bg-success/10 text-success border border-success/30'
  if (type === 'inter_state') return 'bg-accent/10 text-accent border border-accent/30'
  if (type === 'zero_rated') return 'bg-highlight/15 text-highlight-foreground border border-highlight/30'
  return 'bg-muted text-muted-foreground border border-border'
}

export function GstSummaryView() {
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  const query = useGstSummaryQuery({
    from: fromDate || undefined,
    to: toDate || undefined,
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Date Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="gst-from-date" className="text-xs font-semibold text-muted-foreground uppercase">
            From
          </label>
          <Input
            id="gst-from-date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-38 rounded-xl bg-card"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="gst-to-date" className="text-xs font-semibold text-muted-foreground uppercase">
            To
          </label>
          <Input
            id="gst-to-date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-38 rounded-xl bg-card"
          />
        </div>
        {(fromDate || toDate) && (
          <button
            type="button"
            onClick={() => {
              setFromDate('')
              setToDate('')
            }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Clear dates
          </button>
        )}
      </div>

      {query.isPending ? (
        <TableSkeleton rows={4} />
      ) : query.isError ? (
        <ErrorState
          title="Could not load GST summary"
          error={query.error}
          onRetry={() => void query.refetch()}
          noDataFallback
        />
      ) : !query.data || query.data.months.length === 0 ? (
        <EmptyState
          title="No GST activity found"
          description="There are no issued invoices within this date range."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Totals overview cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Taxable Value — warm amber highlight */}
            <Card className="border-l-4 border-l-highlight border-border bg-card">
              <CardHeader className="pb-2">
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-highlight/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-highlight-foreground">
                  Taxable
                </div>
                <CardDescription className="text-xs font-semibold uppercase">Total Taxable Value</CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight text-highlight-foreground">
                  <MoneyText value={query.data.totals.taxableValue} />
                </CardTitle>
              </CardHeader>
            </Card>

            {/* Total GST Output — primary orange */}
            <Card className="border-l-4 border-l-primary border-border bg-card">
              <CardHeader className="pb-2">
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  GST Output
                </div>
                <CardDescription className="text-xs font-semibold uppercase">Total GST Output</CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight text-primary">
                  <MoneyText value={query.data.totals.totalTax} />
                </CardTitle>
              </CardHeader>
            </Card>

            {/* CGST + SGST — success green */}
            <Card className="border-l-4 border-l-success border-border bg-card">
              <CardHeader className="pb-2">
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                  Intra-State
                </div>
                <CardDescription className="text-xs font-semibold uppercase">CGST + SGST</CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight text-success">
                  <MoneyText
                    value={addDecimalStrings(
                      query.data.totals.cgst,
                      query.data.totals.sgst,
                    )}
                  />
                </CardTitle>
              </CardHeader>
            </Card>

            {/* IGST — accent red */}
            <Card className="border-l-4 border-l-accent border-border bg-card">
              <CardHeader className="pb-2">
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                  Inter-State
                </div>
                <CardDescription className="text-xs font-semibold uppercase">IGST</CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight text-accent">
                  <MoneyText value={query.data.totals.igst} />
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Monthly Breakdown Table */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Monthly Breakdown</CardTitle>
              <CardDescription>
                Summary of taxable supplies and GST liabilities by billing month.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Taxable Value</TableHead>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                    <TableHead className="text-right">IGST</TableHead>
                    <TableHead className="text-right">Total Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.months.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-semibold">{m.month}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.invoiceCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <MoneyText value={m.taxableValue} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <MoneyText value={m.cgst} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <MoneyText value={m.sgst} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <MoneyText value={m.igst} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-primary">
                        <MoneyText value={m.totalTax} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Breakdown by Supply Type Table */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Supply Type Breakdown</CardTitle>
              <CardDescription>
                Comparison of Intra-State vs. Inter-State vs. Zero-Rated export supplies.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supply Type</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Taxable Value</TableHead>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                    <TableHead className="text-right">IGST</TableHead>
                    <TableHead className="text-right">Total Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.bySupplyType.map((s) => (
                    <TableRow key={s.supplyType}>
                      <TableCell>
                        <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', supplyBadgeStyle(s.supplyType))}>
                          {supplyLabel(s.supplyType)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.invoiceCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <MoneyText value={s.taxableValue} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        <MoneyText value={s.cgst} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        <MoneyText value={s.sgst} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-accent">
                        <MoneyText value={s.igst} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-primary">
                        <MoneyText value={s.totalTax} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

