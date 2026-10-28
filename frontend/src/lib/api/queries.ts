'use client'

import { useAuth } from '@clerk/nextjs'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateCustomerRequest,
  CreateInvoiceRequest,
  Customer,
  InvoiceDetail,
  InvoiceStatus,
} from './types'

import { useApi } from './useApi'

/** Queries wait for Clerk to load so a not-yet-hydrated session is never mistaken for signed out. */
function useSessionReady(): boolean {
  const { isLoaded, isSignedIn } = useAuth()
  return isLoaded && Boolean(isSignedIn)
}

export function useInvoicesQuery(status?: InvoiceStatus) {
  const api = useApi()
  const enabled = useSessionReady()

  return useInfiniteQuery({
    queryKey: ['invoices', status ?? 'all'],
    queryFn: ({ pageParam, signal }) => api.listInvoices({ status, cursor: pageParam }, signal),
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

export function useCustomersQuery() {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery({
    queryKey: ['customers'],
    queryFn: ({ signal }) => api.listCustomers(signal),
    enabled,
  })
}

export function useSummaryQuery() {
  const api = useApi()
  const enabled = useSessionReady()

  return useQuery({
    queryKey: ['summary'],
    queryFn: ({ signal }) => api.getSummary(signal),
    enabled,
  })
}

/** Creates a draft. The server returns it with tax and totals already calculated. */
export function useCreateInvoiceMutation() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateInvoiceRequest) => api.createInvoice(body),
    onSuccess: (invoice) => {
      // Seed the detail page so the draft shows instantly after the redirect.
      queryClient.setQueryData<InvoiceDetail>(['invoice', invoice.id], { ...invoice, payments: [] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
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

/** The caller owns the idempotency key, so a retry of the same decision can reuse it. */
export function useIssueInvoiceMutation(id: string) {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (idempotencyKey: string) => api.issueInvoice(id, idempotencyKey),
    onSuccess: (invoice) => {
      queryClient.setQueryData<InvoiceDetail>(['invoice', id], (known) => ({
        payments: known?.payments ?? [],
        ...invoice,
      }))
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}
