'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Building2Icon, CheckIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/common/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { isApiError } from '@/lib/api/client'
import { useUpdateProfileMutation } from '@/lib/api/queries'
import { profileFormSchema, type ProfileForm } from '@/lib/api/schemas'
import { STATE_OPTIONS } from '@/lib/constants/states'

export function SettingsView({
  initialBusinessName = '',
  initialStateCode = '',
  isLoading = false,
}: {
  initialBusinessName?: string
  initialStateCode?: string
  /** True while the profile is being fetched from the server. */
  isLoading?: boolean
}) {
  const mutation = useUpdateProfileMutation()

  const {
    register,
    control,
    reset,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      businessName: initialBusinessName,
      stateCode: initialStateCode,
    },
  })

  // Once the async fetch resolves, reset the form with the real server values.
  useEffect(() => {
    if (!isLoading) {
      reset({ businessName: initialBusinessName, stateCode: initialStateCode })
    }
  }, [isLoading, initialBusinessName, initialStateCode, reset])

  function onSubmit(values: ProfileForm) {
    mutation.mutate(
      {
        businessName: values.businessName?.trim() || null,
        stateCode: values.stateCode,
      },
      {
        onSuccess: (data) => {
          toast.success(
            data.businessName
              ? `Profile updated: ${data.businessName} (State: ${data.stateCode})`
              : `Profile updated (State: ${data.stateCode})`,
          )
        },
        onError: (err) => {
          toast.error(isApiError(err) ? err.message : 'Could not update profile.')
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Manage your business information and GST tax configuration."
      />

      <Card className="max-w-2xl border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2Icon className="size-5 text-primary" />
            Business Profile &amp; GST State
          </CardTitle>
          <CardDescription>
            Your state code determines whether sales are classified as intra-state (CGST + SGST) or
            inter-state (IGST). Your business name is displayed on public shareable invoices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            /* Loading skeleton — prevents a flash of empty/wrong form values */
            <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading profile">
              <div className="flex flex-col gap-2">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="h-4 w-56 animate-pulse rounded bg-muted" />
                <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              </div>
              <div className="flex justify-end pt-2">
                <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
              </div>
            </div>
          ) : (
            <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
              <FieldGroup>
                {/* Business Name */}
                <Field data-invalid={errors.businessName ? true : undefined}>
                  <FieldLabel htmlFor="profile-business-name">Business / Trade Name</FieldLabel>
                  <Input
                    id="profile-business-name"
                    placeholder="e.g. Acme Studio Technologies"
                    autoComplete="organization"
                    aria-invalid={errors.businessName ? true : undefined}
                    {...register('businessName')}
                  />
                  {errors.businessName ? (
                    <FieldError>{errors.businessName.message}</FieldError>
                  ) : null}
                </Field>

                {/* State Code */}
                <Field data-invalid={errors.stateCode ? true : undefined}>
                  <FieldLabel htmlFor="profile-state-code">Principal Place of Business (State)</FieldLabel>
                  <Controller
                    control={control}
                    name="stateCode"
                    render={({ field }) => (
                      <Select
                        items={STATE_OPTIONS}
                        value={field.value}
                        onValueChange={(next) => field.onChange(next ?? '')}
                      >
                        <SelectTrigger
                          id="profile-state-code"
                          className="w-full"
                          aria-invalid={errors.stateCode ? true : undefined}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false} className="max-h-72">
                          {STATE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.stateCode ? <FieldError>{errors.stateCode.message}</FieldError> : null}
                </Field>
              </FieldGroup>

              {mutation.isError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>
                    {isApiError(mutation.error)
                      ? mutation.error.message
                      : 'Failed to update business profile.'}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={mutation.isPending || !isDirty} className="font-semibold">
                  {mutation.isPending ? (
                    <Spinner className="mr-1.5 size-4" />
                  ) : (
                    <CheckIcon className="mr-1.5 size-4" />
                  )}
                  Save changes
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
