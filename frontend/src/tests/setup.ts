import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { setMockScenario, setMockTimingScale } from '@/mocks/scenario'
import { server } from '@/mocks/server'
import { resetMockState } from '@/mocks/state'

beforeAll(() => {
  // jsdom does not implement scrollIntoView, which the message list calls on every update.
  Element.prototype.scrollIntoView = () => {}
  server.listen({ onUnhandledFrame: 'error' })
  setMockTimingScale(0)
})

beforeEach(() => {
  resetMockState()
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  setMockScenario(null)
})

afterAll(() => {
  server.close()
})
