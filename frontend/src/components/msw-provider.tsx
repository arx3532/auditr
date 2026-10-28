'use client'

import { useEffect, useState } from 'react'

import { env } from '@/lib/env'

let workerStart: Promise<void> | undefined

function startMockWorker() {
  workerStart ??= import('@/mocks/browser').then(async ({ worker }) => {
    await worker.start({ onUnhandledFrame: 'bypass' })
  })
  return workerStart
}

/** Starts the MSW service worker before rendering children when NEXT_PUBLIC_USE_MOCKS=true. */
export function MswProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!env.useMocks)

  useEffect(() => {
    if (!env.useMocks) return
    let cancelled = false

    startMockWorker()
      .catch((error) => {
        console.error('Failed to start mock API worker', error)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return ready ? children : null
}
