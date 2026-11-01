'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LandmarkIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { isApiError } from '@/lib/api/client'
import { useRecordPaymentMutation } from '@/lib/api/queries'
import { recordPaymentFormSchema, type RecordPaymentForm } from '@/lib/api/schemas'
import type { Invoice } from '@/lib/api/types'
import { formatMoney } from '@/lib/format/money'
import { createIdempotencyKey } from '@/lib/idempotency'

interface RecordPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Invoice
}

export function RecordPaymentDialog({ open, onOpenChange, invoice }: RecordPaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LandmarkIcon className="size-5 text-primary" />
            Record payment
          </DialogTitle>
          <DialogDescription>
            Record cash received and TDS withheld for invoice{' '}
            <span className="font-semibold text-foreground">{invoice.number ?? invoice.id}</span>.
            Current amount due: <span className="font-semibold text-foreground">{formatMoney(invoice.amountDue)}</span>.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <RecordPaymentFormView
            invoice={invoice}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface RecordPaymentFormViewProps {
  invoice: Invoice
  onSuccess: () => void
  onCancel: () => void
}

function RecordPaymentFormView({ invoice, onSuccess, onCancel }: RecordPaymentFormViewProps) {
  const mutation = useRecordPaymentMutation(invoice.id)
  const keyRef = useRef<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RecordPaymentForm>({
    resolver: zodResolver(recordPaymentFormSchema),
    defaultValues: {
      cashReceived: invoice.amountDue,
      tdsDeducted: '0.00',
      paidOn: new Date().toISOString().slice(0, 10),
    },
  })

  // Reset idempotency key when unmounted or opened freshly
  useEffect(() => {
    keyRef.current = null
  }, [invoice.id])

  function onSubmit(values: RecordPaymentForm) {
    keyRef.current ??= createIdempotencyKey()

    mutation.mutate(
      {
        body: {
          cashReceived: values.cashReceived.trim(),
          tdsDeducted: values.tdsDeducted?.trim() || '0.00',
          date: values.paidOn,
        },
        idempotencyKey: keyRef.current,
      },
      {
        onSuccess: (data) => {
          toast.success(
            `Recorded payment of ${formatMoney(data.payment.cashReceived)}. Remaining due: ${formatMoney(data.invoice.amountDue)}`,
          )
          keyRef.current = null
          onSuccess()
        },
        onError: (err) => {
          toast.error(isApiError(err) ? err.message : 'Could not record payment. You can safely retry.')
        },
      },
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FieldGroup>
        {/* Cash received */}
        <Field data-invalid={errors.cashReceived ? true : undefined}>
          <FieldLabel htmlFor="payment-cash-received">Cash received (INR)</FieldLabel>
          <Input
            id="payment-cash-received"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 50000.00"
            aria-invalid={errors.cashReceived ? true : undefined}
            {...register('cashReceived')}
          />
          {errors.cashReceived ? <FieldError>{errors.cashReceived.message}</FieldError> : null}
        </Field>

        {/* TDS deducted */}
        <Field data-invalid={errors.tdsDeducted ? true : undefined}>
          <FieldLabel htmlFor="payment-tds-deducted">TDS deducted by customer (INR)</FieldLabel>
          <Input
            id="payment-tds-deducted"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-invalid={errors.tdsDeducted ? true : undefined}
            {...register('tdsDeducted')}
          />
          {errors.tdsDeducted ? <FieldError>{errors.tdsDeducted.message}</FieldError> : null}
        </Field>

        {/* Payment date */}
        <Field data-invalid={errors.paidOn ? true : undefined}>
          <FieldLabel htmlFor="payment-paid-on">Payment date</FieldLabel>
          <Input
            id="payment-paid-on"
            type="date"
            aria-invalid={errors.paidOn ? true : undefined}
            {...register('paidOn')}
          />
          {errors.paidOn ? <FieldError>{errors.paidOn.message}</FieldError> : null}
        </Field>
      </FieldGroup>

      {mutation.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {isApiError(mutation.error) ? mutation.error.message : 'Failed to record payment.'}
          </AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Confirm &amp; Record
        </Button>
      </DialogFooter>
    </form>
  )
}

