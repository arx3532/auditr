'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { isApiError } from '@/lib/api/client'
import { useCreateCustomerMutation } from '@/lib/api/queries'
import { newCustomerFormSchema, toCreateCustomerRequest, type NewCustomerForm } from '@/lib/api/schemas'
import type { Customer } from '@/lib/api/types'

interface NewCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the customer the server created, so the form can select it. */
  onCreated: (customer: Customer) => void
}

export function NewCustomerDialog({ open, onOpenChange, onCreated }: NewCustomerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>Add who you are invoicing. You can pick them straight away.</DialogDescription>
        </DialogHeader>
        <NewCustomerForm
          onCancel={() => onOpenChange(false)}
          onCreated={(customer) => {
            onCreated(customer)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

interface NewCustomerFormProps {
  onCancel: () => void
  onCreated: (customer: Customer) => void
}

/** Mounted only while the dialog is open, so every open starts with an empty form. */
function NewCustomerForm({ onCancel, onCreated }: NewCustomerFormProps) {
  const createCustomer = useCreateCustomerMutation()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewCustomerForm>({
    resolver: zodResolver(newCustomerFormSchema),
    defaultValues: { name: '', gstin: '', stateCode: '' },
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        // The dialog renders in a portal; keep this submit from reaching any form around it.
        event.stopPropagation()
        void handleSubmit((values) =>
          createCustomer.mutate(toCreateCustomerRequest(values), { onSuccess: onCreated }),
        )(event)
      }}
      className="flex flex-col gap-4"
    >
      <FieldGroup>
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="customer-name">Customer name</FieldLabel>
          <Input
            id="customer-name"
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            {...register('name')}
          />
          {errors.name ? <FieldError>{errors.name.message}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.gstin ? true : undefined}>
          <FieldLabel htmlFor="customer-gstin">GSTIN (optional)</FieldLabel>
          <Input
            id="customer-gstin"
            autoComplete="off"
            maxLength={15}
            className="font-mono uppercase"
            aria-invalid={errors.gstin ? true : undefined}
            {...register('gstin')}
          />
          {errors.gstin ? <FieldError>{errors.gstin.message}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.stateCode ? true : undefined}>
          <FieldLabel htmlFor="customer-state-code">State code (optional)</FieldLabel>
          <Input
            id="customer-state-code"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            aria-invalid={errors.stateCode ? true : undefined}
            {...register('stateCode')}
          />
          <FieldDescription>The 2-digit GST state code, for example 29.</FieldDescription>
          {errors.stateCode ? <FieldError>{errors.stateCode.message}</FieldError> : null}
        </Field>
      </FieldGroup>

      {createCustomer.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {isApiError(createCustomer.error)
              ? createCustomer.error.message
              : 'Could not add the customer. Please try again.'}
          </AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={createCustomer.isPending}>
          {createCustomer.isPending ? <Spinner data-icon="inline-start" /> : null}
          Add customer
        </Button>
      </DialogFooter>
    </form>
  )
}