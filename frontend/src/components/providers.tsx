'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'

import { MswProvider } from '@/components/msw-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isApiError } from '@/lib/api/client'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Only connectivity problems and 5xx responses are worth retrying; a 401/404 will not change.
        retry: (failureCount, error) =>
          isApiError(error) ? error.retryable && failureCount < 2 : failureCount < 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient)

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <MswProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </MswProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
