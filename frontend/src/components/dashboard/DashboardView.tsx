'use client'

import { ArrowRightIcon, FileTextIcon, MessageSquareIcon, SparklesIcon, UsersIcon } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { SummaryCardsSkeleton, TableSkeleton } from '@/components/common/Skeletons'
import { InvoiceTable } from '@/components/invoices/InvoiceTable'
import { buttonVariants } from '@/components/ui/button'
import { useInvoicesQuery, useSummaryQuery } from '@/lib/api/queries'

import { SummaryCards } from './SummaryCards'

const RECENT_COUNT = 5

function SummarySection() {
  const query = useSummaryQuery()

  if (query.isPending) return <SummaryCardsSkeleton />
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load the summary"
        error={query.error}
        onRetry={() => void query.refetch()}
        noDataFallback
      />
    )
  }
  return <SummaryCards summary={query.data} />
}

function RecentInvoicesSection() {
  const query = useInvoicesQuery()

  if (query.isPending) return <TableSkeleton rows={3} />
  if (query.isError && !query.data) {
    return (
      <ErrorState
        title="Could not load invoices"
        error={query.error}
        onRetry={() => void query.refetch()}
        noDataFallback
      />
    )
  }

  const recent = (query.data?.pages[0]?.items ?? []).slice(0, RECENT_COUNT)
  if (recent.length === 0) {
    return (
      <EmptyState
        title="No invoices yet"
        description="Describe who to bill in chat to generate your first draft invoice."
      >
        <Link
          href="/chat"
          className={buttonVariants({
            size: 'sm',
            className: 'bg-primary text-primary-foreground font-semibold',
          })}
        >
          <MessageSquareIcon className="size-4 mr-1.5" />
          Open chat to draft
        </Link>
      </EmptyState>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs dark:border-white/[0.15]">
      <InvoiceTable invoices={recent} caption="Recent invoices" />
    </div>
  )
}

export function DashboardView() {
  return (
    <div className="flex flex-col gap-6">
      {/* Quick Action Bar with Palette Colors */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5 shadow-xs backdrop-blur-xs dark:border-white/[0.15]">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-semibold text-success uppercase tracking-wider">
              Financial Copilot Active
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Fast, deterministic invoicing with double-entry balance verification.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/chat"
            className={buttonVariants({
              size: 'sm',
              className:
                'h-9 rounded-xl bg-accent px-4 text-xs font-semibold text-accent-foreground shadow-xs transition-all hover:bg-accent/90 hover:scale-[1.02]',
            })}
          >
            <SparklesIcon className="size-3.5 mr-1.5" />
            Draft via Chat
          </Link>
          <Link
            href="/invoices"
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
              className: 'h-9 rounded-xl border-border text-xs font-semibold hover:bg-muted',
            })}
          >
            <FileTextIcon className="size-3.5 mr-1.5 text-muted-foreground" />
            All Invoices
          </Link>
          <Link
            href="/customers"
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
              className: 'h-9 rounded-xl border-border text-xs font-semibold hover:bg-muted',
            })}
          >
            <UsersIcon className="size-3.5 mr-1.5 text-muted-foreground" />
            Customers
          </Link>
        </div>
      </div>

      {/* Summary Metrics */}
      <SummarySection />

      {/* Recent Invoices Section */}
      <section aria-labelledby="recent-invoices-heading" className="flex flex-col gap-3 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileTextIcon className="size-3.5" />
            </div>
            <h2 id="recent-invoices-heading" className="text-base font-bold text-foreground">
              Recent activity
            </h2>
          </div>
          <Link
            href="/invoices"
            className={buttonVariants({
              variant: 'ghost',
              size: 'sm',
              className: 'text-xs font-medium text-muted-foreground hover:text-foreground',
            })}
          >
            <span>View all invoices</span>
            <ArrowRightIcon className="size-3.5 ml-1" />
          </Link>
        </div>

        <RecentInvoicesSection />
      </section>
    </div>
  )
}
