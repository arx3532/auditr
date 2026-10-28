'use client'

import { CheckIcon } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { isApiError } from '@/lib/api/client'
import { useIssueInvoiceMutation } from '@/lib/api/queries'
import { createIdempotencyKey } from '@/lib/idempotency'

/**
 * Shown above a draft. Confirming sends `POST /invoices/:id/issue` with one Idempotency-Key per
 * decision. The key is kept so a retry after a failure reuses it, and the button stays locked
 * from the first click until the request fails, so a second click can never start a new decision.
 */
export function DraftReviewBar({ invoiceId }: { invoiceId: string }) {
  const issue = useIssueInvoiceMutation(invoiceId)
  const keyRef = useRef<string | null>(null)
  const lockedRef = useRef(false)

  function confirm() {
    if (lockedRef.current) return
    lockedRef.current = true
    keyRef.current ??= createIdempotencyKey()
    issue.mutate(keyRef.current, {
      onSuccess: (invoice) => {
        toast.success(invoice.number ? `Invoice ${invoice.number} issued` : 'Invoice issued')
      },
      // Only a failure reopens the button; the same key is then reused for the retry.
      onError: () => {
        lockedRef.current = false
      },
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <section
        aria-label="Review draft"
        className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="font-medium text-foreground">This invoice is a draft</p>
          <p className="text-sm text-muted-foreground">
            Check the tax and totals below. Nothing is issued until you confirm.
          </p>
        </div>
        <Button type="button" onClick={confirm} disabled={issue.isPending || issue.isSuccess}>
          {issue.isPending ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
          Confirm &amp; issue
        </Button>
      </section>

      {issue.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {isApiError(issue.error) ? issue.error.message : 'Could not issue the invoice.'} Nothing was
            issued twice: you can safely try again.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}