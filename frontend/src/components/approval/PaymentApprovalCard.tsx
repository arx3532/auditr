'use client'

import { CheckCircle2Icon, ClockIcon, LockIcon, XCircleIcon } from 'lucide-react'
import Link from 'next/link'
import { useId } from 'react'

import { DateText } from '@/components/common/DateText'
import { MoneyText } from '@/components/common/MoneyText'
import { DetailRow } from '@/components/invoices/InvoiceDetail'
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge'
import { Button, buttonVariants } from '@/components/ui/button'
import type { ResumeDecision } from '@/lib/api/types'
import { formatMoney } from '@/lib/format/money'
import type { ApprovalDecisionState, PaymentApprovalMessage } from '@/lib/stream/chatState'
import { cn } from '@/lib/utils'

import { ApprovalActions } from './ApprovalActions'

interface PaymentApprovalCardProps {
  approval: PaymentApprovalMessage
  /** A decision may be sent: no request is in flight for this card. */
  canDecide: boolean
  onDecide: (decision: ResumeDecision) => void
  /** Offered once the approval has expired. Sends the original request again. */
  onAskAgain?: () => void
}

const STATE_LABEL: Record<ApprovalDecisionState['kind'], string> = {
  pending: 'Awaiting your decision',
  submitting: 'Sending your decision',
  approved: 'Recorded',
  rejected: 'Rejected',
  expired: 'Expired',
}

function invoiceLabel(approval: PaymentApprovalMessage): string {
  const { invoice } = approval.payment
  return invoice.number ? `invoice ${invoice.number}` : 'the invoice'
}

function announcement(approval: PaymentApprovalMessage): string {
  const { payment, decision } = approval
  switch (decision.kind) {
    case 'pending':
      return `Payment of ${formatMoney(payment.cashReceived)} against ${invoiceLabel(approval)} is ready for your decision.`
    case 'submitting':
      return 'Sending your decision.'
    case 'approved':
      return `The payment was recorded against ${invoiceLabel(approval)}.`
    case 'rejected':
      return 'The payment was rejected. Nothing was recorded.'
    case 'expired':
      return 'This payment approval has expired.'
  }
}

function Outcome({
  approval,
  onAskAgain,
}: {
  approval: PaymentApprovalMessage
  onAskAgain?: () => void
}) {
  const { decision } = approval

  if (decision.kind === 'approved') {
    // Prefer the invoice the server returned: it reflects the amount due after the payment.
    const invoice = decision.invoice ?? approval.payment.invoice
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-foreground">
        <CheckCircle2Icon className="size-4 text-success" aria-hidden="true" />
        <span className="font-medium">
          {invoice.number
            ? `Payment recorded against invoice #${invoice.number}.`
            : 'The payment was recorded.'}
        </span>
        <Link
          href={`/invoices/${invoice.id}`}
          className={buttonVariants({
            size: 'sm',
            className: 'ml-auto rounded-lg bg-primary text-primary-foreground font-semibold text-xs',
          })}
        >
          View invoice
        </Link>
      </div>
    )
  }

  if (decision.kind === 'rejected') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
        <XCircleIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="font-medium">Payment rejected. Nothing was recorded.</span>
      </div>
    )
  }

  if (decision.kind === 'expired') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <ClockIcon className="size-4" aria-hidden="true" />
          <span>This payment approval expired before confirmation.</span>
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

/**
 * The record-payment counterpart of `DraftInvoiceCard`. Every figure is shown exactly as the
 * server previewed it (amount due after, status after); nothing is calculated here.
 * Payments are confirmed or rejected, not edited, in the chat.
 */
export function PaymentApprovalCard({
  approval,
  canDecide,
  onDecide,
  onAskAgain,
}: PaymentApprovalCardProps) {
  const titleId = useId()
  const { payment, decision } = approval
  const { invoice } = payment
  const isOpen = decision.kind === 'pending' || decision.kind === 'submitting'

  return (
    <section
      aria-labelledby={titleId}
      className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="h-1.5 rounded-t-2xl bg-linear-to-r from-primary via-highlight to-success" />
      <p role="status" className="sr-only">
        {announcement(approval)}
      </p>

      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5 pb-4">
        <div>
          <h3 id={titleId} className="text-base font-semibold text-foreground">
            Record Payment
          </h3>
          {isOpen ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Review before recording</p>
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

      {/* Which invoice */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-dashed border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Against invoice
          </p>
          <p className="mt-1 font-medium break-words text-foreground">
            {invoice.number ?? 'Unnumbered invoice'}
          </p>
          <p className="mt-0.5 text-sm break-words text-muted-foreground">{invoice.customer.name}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Payment date
          </p>
          <DateText value={payment.date} className="mt-1 block font-medium text-foreground" />
        </div>
      </div>

      {/* The payment, and what it leaves behind */}
      <dl className="flex flex-col gap-2 border-t border-dashed border-border px-5 py-4">
        <DetailRow label="Invoice total">
          <MoneyText value={invoice.total} />
        </DetailRow>
        <DetailRow label="Cash received">
          <MoneyText value={payment.cashReceived} className="font-medium text-foreground" />
        </DetailRow>
        <DetailRow label="TDS deducted">
          <MoneyText value={payment.tdsDeducted} />
        </DetailRow>
        <DetailRow label="Status after">
          <InvoiceStatusBadge status={payment.statusAfter} />
        </DetailRow>
      </dl>

      <div className="flex items-baseline justify-between gap-4 border-t border-border bg-muted/50 px-5 py-4">
        <span className="text-sm font-medium text-foreground">Amount due after</span>
        <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          <MoneyText value={payment.amountDueAfter} />
        </span>
      </div>
      {decision.kind === 'pending' ? (
        <p className="bg-muted/50 px-5 pb-3 text-right text-xs text-muted-foreground">
          Confirm by <DateText value={approval.expiresAt} />
        </p>
      ) : null}

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
              canEdit={false}
              hideEdit
              confirmLabel="Confirm & record"
              groupLabel="Decide on this payment"
              onConfirm={() => onDecide('approve')}
              onEdit={() => undefined}
              onReject={() => onDecide('reject')}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockIcon className="size-3 shrink-0" aria-hidden="true" />
              Nothing is recorded until you confirm.
            </p>
          </div>
        ) : (
          <Outcome approval={approval} onAskAgain={onAskAgain} />
        )}
      </div>
    </section>
  )
}