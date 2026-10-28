'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getApiUrl } from '@/lib/env'

import { createApiClient } from './client'
import { createEndpoints } from './endpoints'

/** The public page has no session: this client never asks Clerk for a token and never redirects. */
export function usePublicInvoiceQuery(token: string) {
  const api = useMemo(
    () => createEndpoints(createApiClient({ baseUrl: getApiUrl(), getToken: async () => null })),
    [],
  )

  return useQuery({
    queryKey: ['public-invoice', token],
    queryFn: ({ signal }) => api.getPublicInvoice(token, signal),
  })
}
