'use client'

import { CheckIcon, PencilIcon, XIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { ResumeDecision } from '@/lib/api/types'

interface ApprovalActionsProps {
  /** The decision currently being sent, if any. */
  submitting: ResumeDecision | undefined
  /** The card cannot be acted on right now, for example another request is in flight. */
  disabled: boolean
  canEdit: boolean
  /** Hide the Edit button entirely, for approvals that cannot be edited in the UI. */
  hideEdit?: boolean
  /** Primary button text. Defaults to the invoice wording. */
  confirmLabel?: string
  /** Accessible name of the button group. */
  groupLabel?: string
  onConfirm: () => void
  onEdit: () => void
  onReject: () => void
}

export function ApprovalActions({
  submitting,
  disabled,
  canEdit,
  hideEdit = false,
  confirmLabel = 'Confirm & issue',
  groupLabel = 'Decide on this draft',
  onConfirm,
  onEdit,
  onReject,
}: ApprovalActionsProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const isSubmitting = submitting !== undefined
  const locked = disabled || isSubmitting

  // The primary action takes focus when the card appears and again after a failed attempt.
  useEffect(() => {
    if (!isSubmitting) confirmRef.current?.focus()
  }, [isSubmitting])

  return (
    <div role="group" aria-label={groupLabel} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <Button
        ref={confirmRef}
        type="button"
        disabled={locked}
        onClick={onConfirm}
        className="col-span-2 h-10 w-full rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:bg-primary/90 active:scale-[0.98] sm:col-span-1 sm:w-auto"
      >
        {submitting === 'approve' ? (
          <Spinner className="mr-1.5 size-4" />
        ) : (
          <CheckIcon className="mr-1.5 size-4 stroke-[2.5]" />
        )}
        {confirmLabel}
      </Button>

      {hideEdit ? null : (
        <Button
          type="button"
          variant="outline"
          disabled={locked || !canEdit}
          onClick={onEdit}
          className="h-10 w-full rounded-xl border-border px-4 text-sm font-medium sm:w-auto"
        >
          {submitting === 'edit' ? (
            <Spinner className="mr-1.5 size-4" />
          ) : (
            <PencilIcon className="mr-1.5 size-4" />
          )}
          Edit draft
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        disabled={locked}
        onClick={onReject}
        className="h-10 w-full rounded-xl px-4 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
      >
        {submitting === 'reject' ? (
          <Spinner className="mr-1.5 size-4" />
        ) : (
          <XIcon className="mr-1.5 size-4" />
        )}
        Reject
      </Button>
    </div>
  )
}