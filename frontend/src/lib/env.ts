import { z } from 'zod'

const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().optional(),
  NEXT_PUBLIC_USE_MOCKS: z.enum(['true', 'false']).default('false'),
})

// NEXT_PUBLIC_* values are inlined at build time only when referenced statically.
const parsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || undefined,
  NEXT_PUBLIC_USE_MOCKS: process.env.NEXT_PUBLIC_USE_MOCKS || undefined,
})

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`)
}

const useMocks = parsed.data.NEXT_PUBLIC_USE_MOCKS === 'true'

// The mock worker answers requests inside the browser, so in mock mode any valid origin will do.
// `.invalid` is a reserved domain that can never resolve, so nothing can leak to a real server.
const MOCK_API_URL = 'https://mock-api.invalid'

export const env = {
  apiUrl: (parsed.data.NEXT_PUBLIC_API_URL ?? (useMocks ? MOCK_API_URL : undefined))?.replace(
    /\/+$/,
    '',
  ),
  useMocks,
}

/** Returns the configured API origin, or throws if a real API call is attempted without one. */
export function getApiUrl(): string {
  if (!env.apiUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is not set. Set it, or enable NEXT_PUBLIC_USE_MOCKS=true.')
  }
  return env.apiUrl
}
