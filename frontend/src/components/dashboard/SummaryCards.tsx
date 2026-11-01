import { AlertCircleIcon, ArrowRightIcon, ClockIcon, ShieldCheckIcon, TrendingUpIcon } from 'lucide-react'
import Link from 'next/link'

import { MoneyText } from '@/components/common/MoneyText'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import type { ReportSummary } from '@/lib/api/types'

export function SummaryCards({ summary }: { summary: ReportSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Revenue this Month (Primary Forest Green Theme) */}
      <Card className="relative overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-primary via-primary/95 to-primary/90 text-primary-foreground shadow-md dark:border dark:border-white/[0.15]">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 size-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/80">
            Revenue this month
          </CardDescription>
          <div className="flex size-8 items-center justify-center rounded-lg bg-white/15 text-white shadow-2xs">
            <TrendingUpIcon className="size-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl sm:text-3xl font-black tracking-tight">
            <MoneyText value={summary.revenueThisMonth} />
          </div>
          <p className="mt-1 text-[11px] text-primary-foreground/75 font-medium">
            Cash collected &amp; balanced in ledger
          </p>
        </CardContent>
      </Card>

      {/* 2. Overdue Invoices Count (Coral / Accent Theme) */}
      <Card className="relative overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-accent via-accent/95 to-accent/90 text-accent-foreground shadow-md dark:border dark:border-white/[0.15]">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 size-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-accent-foreground/80">
            Overdue invoices
          </CardDescription>
          <div className="flex size-8 items-center justify-center rounded-lg bg-white/15 text-white shadow-2xs">
            <AlertCircleIcon className="size-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums">
            <Link
              href="/invoices?status=overdue"
              className="inline-flex items-center gap-2 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-md"
            >
              <span>{summary.overdueCount}</span>
              <ArrowRightIcon className="size-4 opacity-70" />
            </Link>
          </div>
          <p className="mt-1 text-[11px] text-accent-foreground/75 font-medium">
            {summary.overdueCount > 0 ? 'Requires follow-up chaser' : 'All invoices up to date'}
          </p>
        </CardContent>
      </Card>

      {/* 3. Overdue Amount (Warm Amber / Golden Warning Theme) */}
      <Card className="relative overflow-hidden rounded-2xl border border-warning/30 bg-card text-foreground shadow-sm dark:border-white/[0.15]">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Overdue total
          </CardDescription>
          <div className="flex size-8 items-center justify-center rounded-lg bg-warning/15 text-amber-600 dark:text-amber-400">
            <ClockIcon className="size-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            <MoneyText value={summary.overdueTotal} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground font-medium">Outstanding past maturity date</p>
        </CardContent>
      </Card>

      {/* 4. Guardrails & Safety (Fresh Green / Success Theme) */}
      <Card className="relative overflow-hidden rounded-2xl border border-success/30 bg-card text-foreground shadow-sm dark:border-white/[0.15]">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-success">
            Ledger safety
          </CardDescription>
          <div className="flex size-8 items-center justify-center rounded-lg bg-success/15 text-success">
            <ShieldCheckIcon className="size-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Human-gated
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground font-medium">
            Human approval gate active on writes
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
