'use client'

import { AlertTriangleIcon, CheckIcon, PencilIcon, XIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { isApiError } from '@/lib/api/client'
import { useCancelInvoiceMutation, useIssueInvoiceMutation } from '@/lib/api/queries'
import { createIdempotencyKey } from '@/lib/idempotency'

interface DraftReviewBarProps {
  invoiceId: string
  onEdit?: () => void
}

/**
 * Shown above a draft invoice. Allows issuing with an Idempotency-Key, editing via sheet,
 * or cancelling with confirmation.
 */
export function DraftReviewBar({ invoiceId, onEdit }: DraftReviewBarProps) {
  const issue = useIssueInvoiceMutation(invoiceId)
  const cancel = useCancelInvoiceMutation(invoiceId)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const keyRef = useRef<string | null>(null)
  const lockedRef = useRef(false)

  function confirmIssue() {
    if (lockedRef.current) return
    lockedRef.current = true
    keyRef.current ??= createIdempotencyKey()
    issue.mutate(keyRef.current, {
      onSuccess: (invoice) => {
        toast.success(invoice.number ? `Invoice ${invoice.number} issued` : 'Invoice issued')
      },
      onError: () => {
        lockedRef.current = false
      },
    })
  }

  function handleCancelDraft() {
    cancel.mutate(undefined, {
      onSuccess: () => {
        toast.success('Draft invoice cancelled')
        setConfirmCancel(false)
      },
      onError: (err) => {
        toast.error(isApiError(err) ? err.message : 'Could not cancel draft invoice.')
      },
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <section
        aria-label="Review draft"
        className="flex flex-col gap-4 rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="font-semibold text-foreground">This invoice is a draft</p>
          <p className="text-sm text-muted-foreground">
            Check the tax and totals below. Nothing is issued until you confirm.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onEdit}
              disabled={issue.isPending || cancel.isPending}
              className="rounded-xl border-border bg-card font-medium"
            >
              <PencilIcon className="mr-1.5 size-4" />
              Edit draft
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmCancel(true)}
            disabled={issue.isPending || cancel.isPending}
            className="rounded-xl font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <XIcon className="mr-1.5 size-4" />
            Cancel draft
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={confirmIssue}
            disabled={issue.isPending || issue.isSuccess || cancel.isPending}
            className="rounded-xl bg-primary font-semibold text-primary-foreground shadow-xs"
          >
            {issue.isPending ? (
              <Spinner className="mr-1.5 size-4" />
            ) : (
              <CheckIcon className="mr-1.5 size-4 stroke-[2.5]" />
            )}
            Confirm &amp; issue
          </Button>
        </div>
      </section>

      {issue.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {isApiError(issue.error) ? issue.error.message : 'Could not issue the invoice.'} Nothing
            was issued twice: you can safely try again.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Confirmation Dialog for cancelling draft */}
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangleIcon className="size-5" />
              Cancel draft invoice?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this draft? Once cancelled, it cannot be issued or
              edited. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmCancel(false)}
              disabled={cancel.isPending}
            >
              Keep draft
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancelDraft}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? <Spinner data-icon="inline-start" /> : null}
              Yes, cancel draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
