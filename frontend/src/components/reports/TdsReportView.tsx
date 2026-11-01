'use client'

import { useState } from 'react'

import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { MoneyText } from '@/components/common/MoneyText'
import { TableSkeleton } from '@/components/common/Skeletons'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTdsReportQuery } from '@/lib/api/queries'
import { addDecimalStrings } from '@/lib/format/money'

function generateFinancialYears(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear()
  const years: { value: string; label: string }[] = []
  for (let y = currentYear + 1; y >= currentYear - 3; y--) {
    const nextYY = String((y + 1) % 100).padStart(2, '0')
    const val = `${y}-${nextYY}`
    years.push({ value: val, label: `FY ${val}` })
  }
  return years
}

const FY_OPTIONS = generateFinancialYears()

export function TdsReportView() {
  const [selectedFy, setSelectedFy] = useState<string>(FY_OPTIONS[1]?.value ?? '2026-27')
  const query = useTdsReportQuery(selectedFy)

  return (
    <div className="flex flex-col gap-6">
      {/* Financial Year Selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="tds-fy-select" className="text-xs font-semibold text-muted-foreground uppercase">
          Financial Year
        </label>
        <Select items={FY_OPTIONS} value={selectedFy} onValueChange={(val) => setSelectedFy(val ?? FY_OPTIONS[0].value)}>
          <SelectTrigger id="tds-fy-select" className="w-44 rounded-xl bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {FY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isPending ? (
        <TableSkeleton rows={4} />
      ) : query.isError ? (
        <ErrorState
          title="Could not load TDS report"
          error={query.error}
          onRetry={() => void query.refetch()}
          noDataFallback
        />
      ) : !query.data || query.data.rows.length === 0 ? (
        <EmptyState
          title="No TDS deductions recorded"
          description={`No customer payments with TDS were recorded for ${selectedFy}.`}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Summary metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Cash Received — success green */}
            <Card className="border-l-4 border-l-success border-border bg-card">
              <CardHeader className="pb-2">
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                  Received
                </div>
                <CardDescription className="text-xs font-semibold uppercase">Total Cash Received</CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight text-success">
                  <MoneyText value={query.data.totalCashReceived} />
                </CardTitle>
              </CardHeader>
            </Card>

            {/* TDS Withheld — primary orange */}
            <Card className="border-l-4 border-l-primary border-border bg-card">
              <CardHeader className="pb-2">
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  Withheld
                </div>
                <CardDescription className="text-xs font-semibold uppercase">Total TDS Withheld</CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight text-primary">
                  <MoneyText value={query.data.totalTdsDeducted} />
                </CardTitle>
              </CardHeader>
            </Card>

            {/* Gross Settlements — highlight amber */}
            <Card className="border-l-4 border-l-highlight border-border bg-card">
              <CardHeader className="pb-2">
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-highlight/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-highlight-foreground">
                  Gross
                </div>
                <CardDescription className="text-xs font-semibold uppercase">Total Gross Settlements</CardDescription>
                <CardTitle className="text-2xl font-bold tracking-tight text-highlight-foreground">
                  <MoneyText
                    value={addDecimalStrings(
                      query.data.totalCashReceived,
                      query.data.totalTdsDeducted,
                    )}
                  />
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Customer TDS Table */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Customer Withholding Summary</CardTitle>
              <CardDescription>
                TDS deductions aggregated per client for Form 26AS reconciliation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                    <TableHead className="text-right">Cash Received</TableHead>
                    <TableHead className="text-right">TDS Deducted</TableHead>
                    <TableHead className="text-right">Gross Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.rows.map((row) => (
                    <TableRow key={row.customerId}>
                      <TableCell className="font-semibold">{row.customerName}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.paymentCount}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        <MoneyText value={row.cashReceived} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-primary">
                        <MoneyText value={row.tdsDeducted} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-highlight-foreground font-medium">
                        <MoneyText
                          value={addDecimalStrings(row.cashReceived, row.tdsDeducted)}
                        />
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

