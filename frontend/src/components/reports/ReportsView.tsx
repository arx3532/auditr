'use client'

import { BarChart3Icon, DownloadIcon, FileSpreadsheetIcon, PieChartIcon, ReceiptIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { isApiError } from '@/lib/api/client'
import { downloadCsvBlob } from '@/lib/api/queries'
import { useApi } from '@/lib/api/useApi'
import { cn } from '@/lib/utils'

import { GstSummaryView } from './GstSummaryView'
import { HsnSummaryView } from './HsnSummaryView'
import { ReceivablesAgingView } from './ReceivablesAgingView'
import { TdsReportView } from './TdsReportView'

type ReportTab = 'gst' | 'hsn' | 'tds' | 'aging'

const TABS: { id: ReportTab; label: string; icon: typeof BarChart3Icon; activeColor: string }[] = [
  { id: 'gst', label: 'GST Summary', icon: ReceiptIcon, activeColor: 'border-primary text-primary bg-primary/5' },
  { id: 'hsn', label: 'HSN / SAC Codes', icon: FileSpreadsheetIcon, activeColor: 'border-success text-success bg-success/5' },
  { id: 'tds', label: 'TDS Withholding', icon: PieChartIcon, activeColor: 'border-accent text-accent bg-accent/5' },
  { id: 'aging', label: 'Receivables Aging', icon: BarChart3Icon, activeColor: 'border-warning text-warning-foreground bg-warning/5' },
]

export function ReportsView() {
  const [activeTab, setActiveTab] = useState<ReportTab>('gst')
  const [exportingInvoices, setExportingInvoices] = useState(false)
  const [exportingPayments, setExportingPayments] = useState(false)
  const api = useApi()

  async function handleExportInvoices() {
    try {
      setExportingInvoices(true)
      const { blob, filename } = await api.exportInvoicesCsv()
      downloadCsvBlob(blob, filename ?? 'invoices.csv')
      toast.success('Invoices CSV exported successfully')
    } catch (err) {
      toast.error(isApiError(err) ? err.message : 'Could not export invoices CSV.')
    } finally {
      setExportingInvoices(false)
    }
  }

  async function handleExportPayments() {
    try {
      setExportingPayments(true)
      const { blob, filename } = await api.exportPaymentsCsv()
      downloadCsvBlob(blob, filename ?? 'payments.csv')
      toast.success('Payments CSV exported successfully')
    } catch (err) {
      toast.error(isApiError(err) ? err.message : 'Could not export payments CSV.')
    } finally {
      setExportingPayments(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header with Export CSV actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Financial Reports"
          description="GST filing schedules, HSN summaries, TDS deductions, and receivables aging."
        />

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportInvoices}
            disabled={exportingInvoices || exportingPayments}
            className="rounded-xl border-border font-medium"
          >
            {exportingInvoices ? (
              <Spinner className="mr-1.5 size-4" />
            ) : (
              <DownloadIcon className="mr-1.5 size-4" />
            )}
            Export Invoices CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPayments}
            disabled={exportingInvoices || exportingPayments}
            className="rounded-xl border-border font-medium"
          >
            {exportingPayments ? (
              <Spinner className="mr-1.5 size-4" />
            ) : (
              <DownloadIcon className="mr-1.5 size-4" />
            )}
            Export Payments CSV
          </Button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-1.5 border-b border-border pb-px overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? `border-b-2 ${tab.activeColor}`
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === 'gst' && <GstSummaryView />}
        {activeTab === 'hsn' && <HsnSummaryView />}
        {activeTab === 'tds' && <TdsReportView />}
        {activeTab === 'aging' && <ReceivablesAgingView />}
      </div>
    </div>
  )
}

