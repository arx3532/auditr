'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'

import { getApiUrl } from '@/lib/env'

import { createApiClient } from './client'
import { createEndpoints, type ApiEndpoints } from './endpoints'

/** Endpoints bound to the current Clerk session. 401 responses send the user to the login page. */
export function useApi(): ApiEndpoints {
  const { getToken } = useAuth()
  const router = useRouter()

  return useMemo(
    () =>
      createEndpoints(
        createApiClient({
          baseUrl: getApiUrl(),
          getToken: () => getToken(),
          onUnauthorized: () => router.push('/login'),
        }),
      ),
    [getToken, router],
  )
}
