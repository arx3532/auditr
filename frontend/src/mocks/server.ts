import { setupServer } from 'msw/node'

import { getApiUrl } from '@/lib/env'

import { createHandlers } from './handlers'

export const server = setupServer(...createHandlers(getApiUrl()))
