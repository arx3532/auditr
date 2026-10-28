import type { ChatEvent, Customer, Invoice } from '@/lib/api/types'

import { CUSTOMERS, createInitialRecords, type InvoiceRecord } from './fixtures'

interface ReplayEntry {
  fingerprint: string
  events: ChatEvent[]
}

export interface MockState {
  customers: Customer[]
  records: InvoiceRecord[]
  /** Drafts awaiting a decision, keyed by thread id. */
  pending: Map<string, Invoice>
  /** Decisions already applied, keyed by Idempotency-Key, so retries replay instead of re-issuing. */
  replays: Map<string, ReplayEntry>
  /** Issue requests already applied, keyed by Idempotency-Key, mapping to the invoice id. */
  issueKeys: Map<string, string>
  nextInvoiceNumber: number
}

function createState(): MockState {
  return {
    customers: [...CUSTOMERS],
    records: createInitialRecords(),
    pending: new Map(),
    replays: new Map(),
    issueKeys: new Map(),
    nextInvoiceNumber: 11,
  }
}

let state = createState()

export function getMockState(): MockState {
  return state
}

export function resetMockState(): void {
  state = createState()
}