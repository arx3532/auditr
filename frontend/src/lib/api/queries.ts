'use client'

import { useAuth } from '@clerk/nextjs'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateCustomerRequest,
  CreateInvoiceRequest,
  Customer,
  Invoice,
  InvoiceStatus,
  Payment,
  RecordPaymentRequest,
  UpdateInvoiceRequest,
  UpdateProfileRequest,
  UserProfile,
} from './types'
import type { DateRangeParams } from './endpoints'

import { useApi } from './useApi'

/** Queries wait for Clerk to load so a not-yet-hydrated session is never mistaken for signed out. */
function useSessionReady(): boolean {
  const { isLoaded, isSignedIn } = useAuth()
  return isLoaded && Boolean(isSignedIn)
}

// ---------------------------------------------------------------------------
// Invoice queries
// ---------------------------------------------------------------------------

export function useInvoicesQuery(status?: InvoiceStatus, limit?: number) {
  const api = useApi()
  const enabled = useSessionReady()

  return useInfiniteQuery({
    queryKey: ['invoices', status ?? 'all', limit],
    queryFn: ({ pageParam, signal }) =>
      api.listInvoices({ status, cursor: pageParam, limit }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
  })
}

export function useInvoiceQuery(id: string) {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery({
    queryKey: ['invoice', id],
    queryFn: ({ signal }) => api.getInvoice(id, signal),
    enabled,
  })
}

/**
 * Fetches the payment list for one invoice separately from the invoice itself.
 * Mirrors GET /invoices/:id/payments → Payment[].
 *
 * The query is co-located on the detail page alongside `useInvoiceQuery` and the
 * two results are passed as separate props to `InvoiceDetail`.
 */
export function useInvoicePaymentsQuery(invoiceId: string) {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery({
    queryKey: ['invoice-payments', invoiceId],
    queryFn: ({ signal }) => api.listInvoicePayments(invoiceId, signal),
    enabled,
  })
}

// ---------------------------------------------------------------------------
// Invoice mutations
// ---------------------------------------------------------------------------

/** Creates a draft. The server returns it with tax and totals already calculated. */
export function useCreateInvoiceMutation() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateInvoiceRequest) => api.createInvoice(body),
    onSuccess: (invoice) => {
      // Seed the invoice cache so the detail page shows instantly after redirect.
      queryClient.setQueryData<Invoice>(['invoice', invoice.id], invoice)
      // Seed an empty payments list so the payments section renders without a flash.
      queryClient.setQueryData(['invoice-payments', invoice.id], [])
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

/** Updates a draft invoice (PATCH /invoices/:id). */
export function useUpdateInvoiceMutation(id: string) {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: UpdateInvoiceRequest) => api.updateInvoice(id, body),
    onSuccess: (invoice) => {
      queryClient.setQueryData<Invoice>(['invoice', id], invoice)
      void queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}

/** The caller owns the idempotency key so a retry of the same decision can reuse it. */
export function useIssueInvoiceMutation(id: string) {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (idempotencyKey: string) => api.issueInvoice(id, idempotencyKey),
    onSuccess: (invoice) => {
      queryClient.setQueryData<Invoice>(['invoice', id], invoice)
      void queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}

/** Cancels a draft invoice (POST /invoices/:id/cancel). */
export function useCancelInvoiceMutation(id: string) {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.cancelInvoice(id),
    onSuccess: (invoice) => {
      queryClient.setQueryData<Invoice>(['invoice', id], invoice)
      void queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Payment mutations
// ---------------------------------------------------------------------------

/**
 * Records a payment against an invoice (POST /invoices/:id/payments).
 * Requires an Idempotency-Key header passed along with the payload.
 */
export function useRecordPaymentMutation(invoiceId: string) {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      body,
      idempotencyKey,
    }: {
      body: RecordPaymentRequest
      idempotencyKey: string
    }) => api.recordPayment(invoiceId, body, idempotencyKey),
    onSuccess: ({ payment, invoice }) => {
      queryClient.setQueryData<Invoice>(['invoice', invoiceId], invoice)
      queryClient.setQueryData(
        ['invoice-payments', invoiceId],
        (prev: Payment[] | undefined) => [...(prev ?? []), payment],
      )
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      void queryClient.invalidateQueries({ queryKey: ['invoice-payments', invoiceId] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Share-link mutations
// ---------------------------------------------------------------------------

/** Creates (or returns the existing) public share link for an issued invoice. */
export function useCreatePublicLinkMutation(invoiceId: string) {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.createPublicLink(invoiceId),
    onSuccess: (shareLink) => {
      // Patch the cached invoice so CopyLinkButton shows immediately.
      queryClient.setQueryData<Invoice>(['invoice', invoiceId], (prev) =>
        prev ? { ...prev, publicToken: shareLink.token } : prev,
      )
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    },
  })
}

/** Revokes the public share link for an invoice. */
export function useRevokePublicLinkMutation(invoiceId: string) {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.revokePublicLink(invoiceId),
    onSuccess: () => {
      queryClient.setQueryData<Invoice>(['invoice', invoiceId], (prev) =>
        prev ? { ...prev, publicToken: undefined } : prev,
      )
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    },
  })
}

// ---------------------------------------------------------------------------
// Customer queries & mutations
// ---------------------------------------------------------------------------

export function useCustomersQuery() {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery({
    queryKey: ['customers'],
    queryFn: ({ signal }) => api.listCustomers(signal),
    enabled,
  })
}

export function useCreateCustomerMutation() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateCustomerRequest) => api.createCustomer(body),
    onSuccess: (customer) => {
      // Add it straight away so it can be selected before the list refetches.
      queryClient.setQueryData<Customer[]>(['customers'], (known) => [...(known ?? []), customer])
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Report queries
// ---------------------------------------------------------------------------

export function useSummaryQuery() {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery({
    queryKey: ['summary'],
    queryFn: ({ signal }) => api.getSummary(signal),
    enabled,
  })
}

/** GST summary, optionally scoped to a date range. */
export function useGstSummaryQuery(range: DateRangeParams = {}) {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery({
    queryKey: ['gst-summary', range.from ?? null, range.to ?? null],
    queryFn: ({ signal }) => api.getGstSummary(range, signal),
    enabled,
  })
}

/** HSN/SAC summary, optionally scoped to a date range. */
export function useHsnSummaryQuery(range: DateRangeParams = {}) {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery({
    queryKey: ['hsn-summary', range.from ?? null, range.to ?? null],
    queryFn: ({ signal }) => api.getHsnSummary(range, signal),
    enabled,
  })
}

/**
 * TDS report for a specific financial year, e.g. "2024-25".
 * Omit `fy` to default to the current financial year on the server.
 */
export function useTdsReportQuery(fy?: string) {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery({
    queryKey: ['tds-report', fy ?? 'current'],
    queryFn: ({ signal }) => api.getTdsReport(fy, signal),
    enabled,
  })
}

/** Receivables aging report bucketed by days overdue. */
export function useReceivablesAgingQuery() {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery({
    queryKey: ['receivables-aging'],
    queryFn: ({ signal }) => api.getReceivablesAging(signal),
    enabled,
  })
}

// ---------------------------------------------------------------------------
// Profile mutation & query
// ---------------------------------------------------------------------------

/**
 * Fetches the current user's saved profile (GET /me).
 * Used to seed the Settings form with the real stateCode and businessName.
 */
export function useProfileQuery() {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: ({ signal }) => api.getMe(signal),
    enabled,
    // Profile changes rarely — no need to refetch on window focus.
    staleTime: 5 * 60 * 1000,
  })
}

/** Updates the current user's business name and state code (PUT /me/profile). */
export function useUpdateProfileMutation() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => api.updateProfile(body),
    onSuccess: (data) => {
      // Keep the profile cache in sync so SettingsView reflects the saved values.
      queryClient.setQueryData<UserProfile>(['profile'], (prev) =>
        prev
          ? { ...prev, stateCode: data.stateCode, businessName: data.businessName }
          : prev,
      )
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Export helpers  (CSV downloads — handles responses as Blob)
// ---------------------------------------------------------------------------

/**
 * Triggers a browser file download from a Blob.
 * Uses window.URL.createObjectURL, mounts an invisible anchor, clicks it, and cleans up.
 */
export function downloadCsvBlob(blob: Blob, filename = 'export.csv'): void {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}