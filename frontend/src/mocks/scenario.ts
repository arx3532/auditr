export const MOCK_SCENARIOS = ['default', 'drop', 'expired', 'error', 'unauthorized', 'server_error'] as const

export type MockScenario = (typeof MOCK_SCENARIOS)[number]

const STORAGE_KEY = 'mock-scenario'

function isScenario(value: string | null): value is MockScenario {
  return value !== null && (MOCK_SCENARIOS as readonly string[]).includes(value)
}

let override: MockScenario | null = null

/** Lets tests pin a scenario without touching `window.location`. */
export function setMockScenario(scenario: MockScenario | null): void {
  override = scenario
}

/**
 * Failure scenario toggled by the `?mock=` query param on the page URL, for example
 * `/chat?mock=drop`. The choice is remembered for the browser session so it survives
 * client-side navigation; `?mock=default` clears it.
 */
export function getMockScenario(): MockScenario {
  if (override) return override
  if (typeof window === 'undefined') return 'default'

  const fromUrl = new URLSearchParams(window.location.search).get('mock')
  if (isScenario(fromUrl)) {
    window.sessionStorage.setItem(STORAGE_KEY, fromUrl)
    return fromUrl
  }

  const stored = window.sessionStorage.getItem(STORAGE_KEY)
  return isScenario(stored) ? stored : 'default'
}

let timingScale = 1

/** Scales every simulated delay. Tests set this to 0. */
export function setMockTimingScale(scale: number): void {
  timingScale = scale
}

export function mockSleep(ms: number): Promise<void> {
  const scaled = ms * timingScale
  return scaled > 0 ? new Promise((resolve) => setTimeout(resolve, scaled)) : Promise.resolve()
}
