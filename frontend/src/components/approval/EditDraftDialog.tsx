'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCustomersQuery } from '@/lib/api/queries'
import {
  draftEditFormSchema,
  draftToFormValues,
  GST_RATES,
  toDraftEdits,
  type DraftEditForm,
} from '@/lib/api/schemas'
import type { DraftEdits, Invoice } from '@/lib/api/types'

interface EditDraftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: Invoice
  onSubmit: (edits: DraftEdits) => void
}

export function EditDraftDialog({ open, onOpenChange, draft, onSubmit }: EditDraftDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit draft</DialogTitle>
          <DialogDescription>
            Change the details below. The server recalculates tax and totals and sends back a new
            draft for you to review.
          </DialogDescription>
        </DialogHeader>
        <EditDraftForm draft={draft} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />
      </DialogContent>
    </Dialog>
  )
}

interface EditDraftFormProps {
  draft: Invoice
  onCancel: () => void
  onSubmit: (edits: DraftEdits) => void
}

/** Mounted only while the dialog is open, so every open starts fresh from the current draft. */
function EditDraftForm({ draft, onCancel, onSubmit }: EditDraftFormProps) {
  const initial = useMemo(() => draftToFormValues(draft), [draft])
  const customers = useCustomersQuery()

  const customerOptions = useMemo(() => {
    const known = customers.data ?? []
    const list = known.some((c) => c.id === draft.customer.id) ? known : [draft.customer, ...known]
    return list.map((c) => ({ value: c.id, label: c.name }))
  }, [customers.data, draft.customer])

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<DraftEditForm>({
    resolver: zodResolver(draftEditFormSchema),
    defaultValues: initial,
  })

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => onSubmit(toDraftEdits(initial, values)))}
      className="flex flex-col gap-4"
    >
      <FieldGroup>
        {/* Customer */}
        <Field data-invalid={errors.customerId ? true : undefined}>
          <FieldLabel htmlFor="edit-customer">Customer</FieldLabel>
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
                  id="edit-customer"
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
          <FieldLabel htmlFor="edit-due-date">Due date</FieldLabel>
          <Input
            id="edit-due-date"
            type="date"
            aria-invalid={errors.dueDate ? true : undefined}
            {...register('dueDate')}
          />
          {errors.dueDate ? <FieldError>{errors.dueDate.message}</FieldError> : null}
        </Field>

        {/* Line-item description */}
        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="edit-description">Description</FieldLabel>
          <Input
            id="edit-description"
            autoComplete="off"
            aria-invalid={errors.description ? true : undefined}
            {...register('description')}
          />
          {errors.description ? <FieldError>{errors.description.message}</FieldError> : null}
        </Field>

        {/* Taxable value (replaces the old "amount" field) */}
        <Field data-invalid={errors.taxableValue ? true : undefined}>
          <FieldLabel htmlFor="edit-taxable-value">Amount (INR, before tax)</FieldLabel>
          <Input
            id="edit-taxable-value"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={errors.taxableValue ? true : undefined}
            {...register('taxableValue')}
          />
          {errors.taxableValue ? <FieldError>{errors.taxableValue.message}</FieldError> : null}
        </Field>

        {/* HSN / SAC code */}
        <Field data-invalid={errors.hsnSac ? true : undefined}>
          <FieldLabel htmlFor="edit-hsn-sac">HSN / SAC code (optional)</FieldLabel>
          <Input
            id="edit-hsn-sac"
            autoComplete="off"
            placeholder="e.g. 998314"
            aria-invalid={errors.hsnSac ? true : undefined}
            {...register('hsnSac')}
          />
          {errors.hsnSac ? <FieldError>{errors.hsnSac.message}</FieldError> : null}
        </Field>

        {/* GST rate */}
        <Field data-invalid={errors.gstRate ? true : undefined}>
          <FieldLabel htmlFor="edit-gst-rate">GST rate</FieldLabel>
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
                  id="edit-gst-rate"
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

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isDirty}>
          Save changes
        </Button>
      </DialogFooter>
    </form>
  )
}
