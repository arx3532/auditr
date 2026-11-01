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
import { useHsnSummaryQuery } from '@/lib/api/queries'

export function HsnSummaryView() {
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  const query = useHsnSummaryQuery({
    from: fromDate || undefined,
    to: toDate || undefined,
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Date Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="hsn-from-date" className="text-xs font-semibold text-muted-foreground uppercase">
            From
          </label>
          <Input
            id="hsn-from-date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-38 rounded-xl bg-card"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="hsn-to-date" className="text-xs font-semibold text-muted-foreground uppercase">
            To
          </label>
          <Input
            id="hsn-to-date"
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
          title="Could not load HSN summary"
          error={query.error}
          onRetry={() => void query.refetch()}
          noDataFallback
        />
      ) : !query.data || query.data.rows.length === 0 ? (
        <EmptyState
          title="No HSN/SAC data found"
          description="There are no items billed with HSN/SAC codes in the selected date range."
        />
      ) : (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>HSN / SAC Code Summary</CardTitle>
            <CardDescription>
              Aggregate values and tax amounts mapped by commodity and service code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HSN / SAC Code</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Taxable Value</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">IGST</TableHead>
                  <TableHead className="text-right">Total Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.rows.map((row) => (
                  <TableRow key={row.hsnSac}>
                    <TableCell className="font-mono font-semibold">{row.hsnSac || 'None'}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.invoiceCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyText value={row.taxableValue} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyText value={row.cgst} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyText value={row.sgst} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyText value={row.igst} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-primary">
                      <MoneyText value={row.totalTax} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

