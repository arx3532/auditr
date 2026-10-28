'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { PlusIcon, Trash2Icon, UserPlusIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { isApiError } from '@/lib/api/client'
import { useCreateInvoiceMutation, useCustomersQuery } from '@/lib/api/queries'
import {
  GST_RATES,
  emptyLineItem,
  newInvoiceFormSchema,
  toCreateInvoiceRequest,
  type NewInvoiceForm as NewInvoiceFormValues,
} from '@/lib/api/schemas'

import { NewCustomerDialog } from './NewCustomerDialog'

const RATE_OPTIONS = GST_RATES.map((rate) => ({ value: rate, label: `${rate}%` }))
const MAX_ITEMS = 20

/**
 * Manual invoice creation. The form collects what the user typed and sends it to
 * `POST /invoices`; the server answers with a draft whose tax and totals it calculated.
 * Nothing here adds up or rounds money, which is why the form shows no totals.
 */
export function NewInvoiceForm() {
  const router = useRouter()
  const customers = useCustomersQuery()
  const createInvoice = useCreateInvoiceMutation()
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<NewInvoiceFormValues>({
    resolver: zodResolver(newInvoiceFormSchema),
    defaultValues: { customerId: '', dueDate: '', lutRef: '', items: [emptyLineItem()] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const customerOptions = useMemo(
    () => (customers.data ?? []).map((customer) => ({ value: customer.id, label: customer.name })),
    [customers.data],
  )

  const submitting = createInvoice.isPending || createInvoice.isSuccess

  const onSubmit = handleSubmit((values) => {
    createInvoice.mutate(toCreateInvoiceRequest(values), {
      onSuccess: (draft) => router.push(`/invoices/${draft.id}`),
    })
  })

  return (
    <>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-8">
        <section aria-labelledby="new-invoice-details" className="flex flex-col gap-4">
          <h2 id="new-invoice-details" className="text-base font-semibold">
            Customer and due date
          </h2>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={errors.customerId ? true : undefined}>
              <FieldLabel htmlFor="invoice-customer">Customer</FieldLabel>
              <Controller
                control={control}
                name="customerId"
                render={({ field }) => (
                  <Select
                    items={customerOptions}
                    value={field.value}
                    onValueChange={(next) => field.onChange(next ?? '')}
                    disabled={customers.isPending}
                  >
                    <SelectTrigger
                      id="invoice-customer"
                      className="w-full"
                      aria-invalid={errors.customerId ? true : undefined}
                    >
                      <SelectValue
                        placeholder={customers.isPending ? 'Loading customers…' : 'Select a customer'}
                      />
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
              {customers.isError ? (
                <FieldError>
                  Could not load your customers.{' '}
                  <button type="button" className="underline" onClick={() => void customers.refetch()}>
                    Try again
                  </button>
                </FieldError>
              ) : customers.isSuccess && customerOptions.length === 0 ? (
                <FieldDescription>No customers yet. Add one to continue.</FieldDescription>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() => setCustomerDialogOpen(true)}
              >
                <UserPlusIcon data-icon="inline-start" />
                New customer
              </Button>
            </Field>

            <Field data-invalid={errors.dueDate ? true : undefined}>
              <FieldLabel htmlFor="invoice-due-date">Due date</FieldLabel>
              <Input
                id="invoice-due-date"
                type="date"
                aria-invalid={errors.dueDate ? true : undefined}
                {...register('dueDate')}
              />
              {errors.dueDate ? <FieldError>{errors.dueDate.message}</FieldError> : null}
            </Field>
          </FieldGroup>
        </section>

        <section aria-labelledby="new-invoice-items" className="flex flex-col gap-4">
          <h2 id="new-invoice-items" className="text-base font-semibold">
            Line items
          </h2>

          <ul className="flex flex-col gap-4">
            {fields.map((field, index) => {
              const itemErrors = errors.items?.[index]
              return (
                <li key={field.id} className="rounded-2xl border border-border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">Item {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                      aria-label={`Remove line item ${index + 1}`}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Remove
                    </Button>
                  </div>

                  <FieldGroup className="grid gap-4 sm:grid-cols-6">
                    <Field
                      className="sm:col-span-6"
                      data-invalid={itemErrors?.description ? true : undefined}
                    >
                      <FieldLabel htmlFor={`item-${index}-description`}>Description</FieldLabel>
                      <Input
                        id={`item-${index}-description`}
                        autoComplete="off"
                        aria-invalid={itemErrors?.description ? true : undefined}
                        {...register(`items.${index}.description`)}
                      />
                      {itemErrors?.description ? (
                        <FieldError>{itemErrors.description.message}</FieldError>
                      ) : null}
                    </Field>

                    <Field className="sm:col-span-2" data-invalid={itemErrors?.hsnSac ? true : undefined}>
                      <FieldLabel htmlFor={`item-${index}-hsn`}>HSN/SAC (optional)</FieldLabel>
                      <Input
                        id={`item-${index}-hsn`}
                        inputMode="numeric"
                        autoComplete="off"
                        className="font-mono"
                        aria-invalid={itemErrors?.hsnSac ? true : undefined}
                        {...register(`items.${index}.hsnSac`)}
                      />
                      {itemErrors?.hsnSac ? <FieldError>{itemErrors.hsnSac.message}</FieldError> : null}
                    </Field>

                    <Field className="sm:col-span-2" data-invalid={itemErrors?.amount ? true : undefined}>
                      <FieldLabel htmlFor={`item-${index}-amount`}>Amount (INR, before tax)</FieldLabel>
                      <Input
                        id={`item-${index}-amount`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={itemErrors?.amount ? true : undefined}
                        {...register(`items.${index}.amount`)}
                      />
                      {itemErrors?.amount ? <FieldError>{itemErrors.amount.message}</FieldError> : null}
                    </Field>

                    <Field className="sm:col-span-2" data-invalid={itemErrors?.gstRate ? true : undefined}>
                      <FieldLabel htmlFor={`item-${index}-gst`}>GST rate</FieldLabel>
                      <Controller
                        control={control}
                        name={`items.${index}.gstRate`}
                        render={({ field: rateField }) => (
                          <Select
                            items={RATE_OPTIONS}
                            value={rateField.value}
                            onValueChange={(next) => rateField.onChange(next ?? '18')}
                          >
                            <SelectTrigger id={`item-${index}-gst`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                              {RATE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                  </FieldGroup>
                </li>
              )
            })}
          </ul>

          {errors.items?.message ? <FieldError>{errors.items.message}</FieldError> : null}

          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={fields.length >= MAX_ITEMS}
            onClick={() => append(emptyLineItem())}
          >
            <PlusIcon data-icon="inline-start" />
            Add line item
          </Button>
        </section>

        <section aria-labelledby="new-invoice-extra" className="flex flex-col gap-4">
          <h2 id="new-invoice-extra" className="text-base font-semibold">
            Export details
          </h2>
          <Field className="sm:max-w-sm" data-invalid={errors.lutRef ? true : undefined}>
            <FieldLabel htmlFor="invoice-lut">LUT reference (optional)</FieldLabel>
            <Input
              id="invoice-lut"
              autoComplete="off"
              aria-invalid={errors.lutRef ? true : undefined}
              {...register('lutRef')}
            />
            <FieldDescription>Only needed for zero-rated export invoices.</FieldDescription>
            {errors.lutRef ? <FieldError>{errors.lutRef.message}</FieldError> : null}
          </Field>
        </section>

        {createInvoice.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {isApiError(createInvoice.error)
                ? createInvoice.error.message
                : 'Could not create the draft. Please try again.'}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-sm text-muted-foreground">
            Tax and totals are calculated by the server when you create the draft. You review them before
            anything is issued.
          </p>
          <div className="flex items-center gap-2">
            <Link href="/invoices" className={buttonVariants({ variant: 'outline' })}>
              Cancel
            </Link>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              Create draft
            </Button>
          </div>
        </div>
      </form>

      {/* Outside the <form>, so the dialog's own form can never submit this one. */}
      <NewCustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onCreated={(customer) => setValue('customerId', customer.id, { shouldValidate: true })}
      />
    </>
  )
}