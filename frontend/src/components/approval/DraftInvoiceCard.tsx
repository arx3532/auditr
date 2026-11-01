'use client'

import { CheckCircle2Icon, ClockIcon, LockIcon, XCircleIcon } from 'lucide-react'
import Link from 'next/link'
import { useId, useState } from 'react'

import { DateText } from '@/components/common/DateText'
import { MoneyText } from '@/components/common/MoneyText'
import { DetailRow, TaxRows } from '@/components/invoices/InvoiceDetail'
import { Button, buttonVariants } from '@/components/ui/button'
import { isEditableDraft } from '@/lib/api/schemas'
import type { DraftEdits, ResumeDecision } from '@/lib/api/types'
import { formatMoney, formatRate } from '@/lib/format/money'
import type { ApprovalDecisionState, InvoiceApprovalMessage } from '@/lib/stream/chatState'
import { cn } from '@/lib/utils'

import { ApprovalActions } from './ApprovalActions'
import { EditDraftDialog } from './EditDraftDialog'

interface DraftInvoiceCardProps {
  approval: InvoiceApprovalMessage
  /** A decision may be sent: no request is in flight for this card. */
  canDecide: boolean
  onDecide: (decision: ResumeDecision, edits?: DraftEdits) => void
  /** Offered once the draft has expired. Sends the original request again. */
  onAskAgain?: () => void
}

const STATE_LABEL: Record<ApprovalDecisionState['kind'], string> = {
  pending: 'Awaiting your decision',
  submitting: 'Sending your decision',
  approved: 'Issued & Confirmed',
  rejected: 'Rejected',
  expired: 'Expired',
}

function announcement(approval: InvoiceApprovalMessage): string {
  const { draft, decision } = approval
  switch (decision.kind) {
    case 'pending':
      return `Draft invoice for ${draft.customer.name}, total ${formatMoney(draft.total)}, is ready for your decision.`
    case 'submitting':
      return 'Sending your decision.'
    case 'approved':
      return decision.invoice?.number
        ? `Invoice ${decision.invoice.number} was issued.`
        : 'The invoice was issued.'
    case 'rejected':
      return 'The draft was rejected. Nothing was issued.'
    case 'expired':
      return 'This draft has expired.'
  }
}

function Outcome({
  approval,
  onAskAgain,
}: {
  approval: InvoiceApprovalMessage
  onAskAgain?: () => void
}) {
  const { decision } = approval

  if (decision.kind === 'approved') {
    const invoice = decision.invoice
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-foreground">
        <CheckCircle2Icon className="size-4 text-success" aria-hidden="true" />
        <span className="font-medium">
          {invoice?.number ? `Successfully issued as invoice #${invoice.number}.` : 'The invoice was issued.'}
        </span>
        <Link
          href={invoice ? `/invoices/${invoice.id}` : '/invoices'}
          className={buttonVariants({
            size: 'sm',
            className: 'ml-auto rounded-lg bg-primary text-primary-foreground font-semibold text-xs',
          })}
        >
          {invoice ? 'View invoice' : 'View invoices'}
        </Link>
      </div>
    )
  }

  if (decision.kind === 'rejected') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
        <XCircleIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="font-medium">Draft rejected. No changes were written to the ledger.</span>
      </div>
    )
  }

  if (decision.kind === 'expired') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <ClockIcon className="size-4" aria-hidden="true" />
          <span>This draft expired before confirmation.</span>
        </div>
        {onAskAgain ? (
          <Button type="button" variant="outline" size="sm" onClick={onAskAgain}>
            Ask again
          </Button>
        ) : null}
      </div>
    )
  }

  return null
}

export function DraftInvoiceCard({ approval, canDecide, onDecide, onAskAgain }: DraftInvoiceCardProps) {
  const titleId = useId()
  const [editing, setEditing] = useState(false)
  const { draft, decision } = approval
  const isOpen = decision.kind === 'pending' || decision.kind === 'submitting'
  const editable = isEditableDraft(draft)

  return (
    <section
      aria-labelledby={titleId}
      className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-sm"
    >

      <div className="h-1.5 rounded-t-2xl bg-linear-to-r from-primary via-highlight to-success" />
      <p role="status" className="sr-only">
        {announcement(approval)}
      </p>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5 pb-4">
        <div>
          <h3 id={titleId} className="text-base font-semibold text-foreground">
            Draft Tax Invoice
          </h3>
          {isOpen ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Review draft before issuing</p>
          ) : null}
        </div>

        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
            decision.kind === 'pending'
              ? 'border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning'
              : decision.kind === 'approved'
                ? 'border-success/40 bg-success/15 text-success'
                : decision.kind === 'rejected'
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : 'border-border bg-muted text-muted-foreground',
          )}
        >
          {decision.kind === 'pending' && (
            <span className="size-1.5 animate-pulse rounded-full bg-warning motion-reduce:animate-none" />
          )}
          {STATE_LABEL[decision.kind]}
        </span>
      </div>

      {/* Billed to and due date */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-dashed border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Billed to</p>
          <p className="mt-1 font-medium break-words text-foreground">{draft.customer.name}</p>
          {draft.customer.gstin ? (
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">GSTIN {draft.customer.gstin}</p>
          ) : null}
        </div>
        <div className="sm:text-right">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Due date</p>
          <DateText value={draft.dueDate} className="mt-1 block font-medium text-foreground" />
        </div>
      </div>

      {/* Line items */}
      <ul
        aria-label="Line items"
        className="divide-y divide-dashed divide-border border-t border-dashed border-border px-5"
      >
        {draft.items.map((item, index) => (
          <li key={`${item.description}-${index}`} className="flex items-baseline justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-medium break-words text-foreground">{item.description}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted-foreground">
                {item.hsnSac ? <span>SAC {item.hsnSac}</span> : null}
                <span>GST {formatRate(item.gstRate)}</span>
              </p>
            </div>
            <div className="font-medium text-foreground tabular-nums">
              <MoneyText value={item.taxableValue} />
            </div>
          </li>
        ))}
      </ul>

      {/* Subtotal and tax, exactly as the server returned them */}
      <div className="flex flex-col gap-2 border-t border-dashed border-border px-5 py-4">
        <dl>
          <DetailRow label="Subtotal">
            <MoneyText value={draft.subtotal} />
          </DetailRow>
        </dl>
        <TaxRows tax={draft.tax} />
      </div>

      {/* Total */}
      <div className="flex items-baseline justify-between gap-4 border-t border-border bg-muted/50 px-5 py-4">
        <span className="text-sm font-medium text-foreground">Total</span>
        <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          <MoneyText value={draft.total} />
        </span>
      </div>
      {decision.kind === 'pending' ? (
        <p className="bg-muted/50 px-5 pb-3 text-right text-xs text-muted-foreground">
          Confirm by <DateText value={approval.expiresAt} />
        </p>
      ) : null}

      {/* Actions stay visible at the bottom of the chat while the draft is long */}
      <div
        className={cn(
          'rounded-b-2xl border-t border-border px-5 py-4',
          isOpen && 'sticky bottom-0 z-10 bg-card/95 backdrop-blur-sm',
        )}
      >
        {isOpen ? (
          <div className="flex flex-col gap-3">
            <ApprovalActions
              submitting={decision.kind === 'submitting' ? decision.decision : undefined}
              disabled={!canDecide}
              canEdit={editable}
              onConfirm={() => onDecide('approve')}
              onEdit={() => setEditing(true)}
              onReject={() => onDecide('reject')}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockIcon className="size-3 shrink-0" aria-hidden="true" />
              Nothing is issued until you confirm.
            </p>
            {editable ? null : (
              <p className="text-xs text-muted-foreground">
                This draft has several line items, which cannot be edited here. Reject it and ask again
                instead.
              </p>
            )}
            <EditDraftDialog
              open={editing}
              onOpenChange={setEditing}
              draft={draft}
              onSubmit={(edits) => {
                setEditing(false)
                onDecide('edit', edits)
              }}
            />
          </div>
        ) : (
          <Outcome approval={approval} onAskAgain={onAskAgain} />
        )}
      </div>
    </section>
  )
}