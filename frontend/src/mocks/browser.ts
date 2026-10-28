import { setupWorker } from 'msw/browser'

import { getApiUrl } from '@/lib/env'

import { createHandlers } from './handlers'

export const worker = setupWorker(...createHandlers(getApiUrl()))
