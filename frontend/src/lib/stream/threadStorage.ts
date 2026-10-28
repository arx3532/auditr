export interface ThreadStorage {
  load(): string | null
  save(threadId: string): void
  clear(): void
}

const STORAGE_KEY = 'invoice-agent.thread-id'

/**
 * Keeps only the thread id (never message text) in sessionStorage so a refresh can
 * continue the thread without it outliving the browser tab.
 * Storage can be unavailable (private mode, SSR), so persistence is best effort.
 */
export const sessionThreadStorage: ThreadStorage = {
  load() {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  },
  save(threadId) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, threadId)
    } catch {
      // Best effort only.
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Best effort only.
    }
  },
}
