'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { PencilIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { isApiError } from '@/lib/api/client'
import { useCustomersQuery, useUpdateInvoiceMutation } from '@/lib/api/queries'
import {
  draftEditFormSchema,
  draftToFormValues,
  GST_RATES,
  toDraftEdits,
  type DraftEditForm,
} from '@/lib/api/schemas'
import type { Invoice } from '@/lib/api/types'

interface EditInvoiceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Invoice
}

export function EditInvoiceSheet({ open, onOpenChange, invoice }: EditInvoiceSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PencilIcon className="size-5 text-primary" />
            Edit draft invoice
          </SheetTitle>
          <SheetDescription>
            Update customer, due date, line item details, or tax rate. The server will recalculate
            tax and subtotal automatically.
          </SheetDescription>
        </SheetHeader>
        {open ? (
          <EditInvoiceForm
            invoice={invoice}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

interface EditInvoiceFormProps {
  invoice: Invoice
  onSuccess: () => void
  onCancel: () => void
}

function EditInvoiceForm({ invoice, onSuccess, onCancel }: EditInvoiceFormProps) {
  const initial = useMemo(() => draftToFormValues(invoice), [invoice])
  const customers = useCustomersQuery()
  const mutation = useUpdateInvoiceMutation(invoice.id)

  const customerOptions = useMemo(() => {
    const known = customers.data ?? []
    const list = known.some((c) => c.id === invoice.customer.id) ? known : [invoice.customer, ...known]
    return list.map((c) => ({ value: c.id, label: c.name }))
  }, [customers.data, invoice.customer])

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<DraftEditForm>({
    resolver: zodResolver(draftEditFormSchema),
    defaultValues: initial,
  })

  function onSubmit(values: DraftEditForm) {
    const edits = toDraftEdits(initial, values)
    if (Object.keys(edits).length === 0) {
      toast.info('No changes were made.')
      onSuccess()
      return
    }

    mutation.mutate(edits, {
      onSuccess: () => {
        toast.success('Draft invoice updated successfully')
        onSuccess()
      },
      onError: (err) => {
        toast.error(isApiError(err) ? err.message : 'Failed to update draft invoice.')
      },
    })
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 p-4">
      <FieldGroup>
        {/* Customer */}
        <Field data-invalid={errors.customerId ? true : undefined}>
          <FieldLabel htmlFor="sheet-edit-customer">Customer</FieldLabel>
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <Select
                items={customerOptions}
                value={field.value}
                onValueChange={(next) => field.onChange(next ?? '')}
              >
                <SelectTrigger
                  id="sheet-edit-customer"
                  className="w-full"
                  aria-invalid={errors.customerId ? true : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {customerOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.customerId ? <FieldError>{errors.customerId.message}</FieldError> : null}
        </Field>

        {/* Due date */}
        <Field data-invalid={errors.dueDate ? true : undefined}>
          <FieldLabel htmlFor="sheet-edit-due-date">Due date</FieldLabel>
          <Input
            id="sheet-edit-due-date"
            type="date"
            aria-invalid={errors.dueDate ? true : undefined}
            {...register('dueDate')}
          />
          {errors.dueDate ? <FieldError>{errors.dueDate.message}</FieldError> : null}
        </Field>

        {/* Line item description */}
        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="sheet-edit-description">Description</FieldLabel>
          <Input
            id="sheet-edit-description"
            autoComplete="off"
            aria-invalid={errors.description ? true : undefined}
            {...register('description')}
          />
          {errors.description ? <FieldError>{errors.description.message}</FieldError> : null}
        </Field>

        {/* Taxable value */}
        <Field data-invalid={errors.taxableValue ? true : undefined}>
          <FieldLabel htmlFor="sheet-edit-taxable-value">Amount (INR, before tax)</FieldLabel>
          <Input
            id="sheet-edit-taxable-value"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={errors.taxableValue ? true : undefined}
            {...register('taxableValue')}
          />
          {errors.taxableValue ? <FieldError>{errors.taxableValue.message}</FieldError> : null}
        </Field>

        {/* HSN/SAC */}
        <Field data-invalid={errors.hsnSac ? true : undefined}>
          <FieldLabel htmlFor="sheet-edit-hsn-sac">HSN / SAC code (optional)</FieldLabel>
          <Input
            id="sheet-edit-hsn-sac"
            autoComplete="off"
            placeholder="e.g. 998314"
            aria-invalid={errors.hsnSac ? true : undefined}
            {...register('hsnSac')}
          />
          {errors.hsnSac ? <FieldError>{errors.hsnSac.message}</FieldError> : null}
        </Field>

        {/* GST rate */}
        <Field data-invalid={errors.gstRate ? true : undefined}>
          <FieldLabel htmlFor="sheet-edit-gst-rate">GST rate</FieldLabel>
          <Controller
            control={control}
            name="gstRate"
            render={({ field }) => (
              <Select
                items={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))}
                value={field.value}
                onValueChange={(next) => field.onChange(next ?? '18')}
              >
                <SelectTrigger
                  id="sheet-edit-gst-rate"
                  className="w-full"
                  aria-invalid={errors.gstRate ? true : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {GST_RATES.map((rate) => (
                    <SelectItem key={rate} value={rate}>
                      {rate}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.gstRate ? <FieldError>{errors.gstRate.message}</FieldError> : null}
        </Field>
      </FieldGroup>

      {mutation.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {isApiError(mutation.error) ? mutation.error.message : 'Could not update draft invoice.'}
          </AlertDescription>
        </Alert>
      ) : null}

      <SheetFooter className="mt-4 px-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isDirty || mutation.isPending}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Save changes
        </Button>
      </SheetFooter>
    </form>
  )
}

