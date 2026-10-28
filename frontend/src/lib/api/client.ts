export type ApiErrorKind =
  'network' | 'unauthorized' | 'not_found' | 'gone' | 'client' | 'server' | 'invalid_response'

interface ApiErrorInit {
  kind: ApiErrorKind
  code: string
  message: string
  status?: number
}

/** Normalised error for every failed API call, so screens never inspect raw responses. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly code: string
  readonly status?: number

  constructor({ kind, code, message, status }: ApiErrorInit) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.code = code
    this.status = status
  }

  /** Worth offering a "Retry" button: connectivity problems and 5xx responses. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'server'
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export interface ApiClientOptions {
  baseUrl: string
  /** Resolves the current session token, or null when signed out. */
  getToken: () => Promise<string | null>
  /** Called on any authenticated 401 so the app can redirect to the login page. */
  onUnauthorized?: () => void
  fetchImpl?: typeof fetch
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string | undefined>
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Defaults to true. Set false for public endpoints so no token is sent. */
  auth?: boolean
}

export interface ApiClient {
  /** JSON request. Resolves with the parsed body. */
  request<T>(path: string, options?: RequestOptions): Promise<T>
  /** Streaming request. Resolves with the raw response once headers confirm an SSE body. */
  stream(path: string, options?: RequestOptions): Promise<Response>
}

const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.'

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | undefined>): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`API paths must be relative and start with a single "/": ${path}`)
  }
  const base = new URL(baseUrl)
  const url = new URL(`${base.pathname.replace(/\/+$/, '')}${path}`, base.origin)
  // Only the configured API origin may ever be called.
  if (url.origin !== base.origin) {
    throw new Error('Refusing to call an origin other than the configured API URL.')
  }
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 404) return 'not_found'
  if (status === 410) return 'gone'
  if (status >= 500) return 'server'
  return 'client'
}

function defaultMessage(kind: ApiErrorKind): string {
  switch (kind) {
    case 'unauthorized':
      return 'Your session has expired. Please sign in again.'
    case 'not_found':
      return 'We could not find what you were looking for.'
    case 'gone':
      return 'This resource is no longer available.'
    case 'server':
      return 'The server ran into a problem. Please try again.'
    default:
      return 'Something went wrong with that request.'
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const kind = kindForStatus(response.status)
  let code = kind === 'unauthorized' ? 'unauthorized' : `http_${response.status}`
  let message = defaultMessage(kind)

  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>
      if (typeof record.code === 'string') code = record.code
      if (typeof record.message === 'string') message = record.message
      else if (typeof record.detail === 'string') message = record.detail
    }
  } catch {
    // Non-JSON error body: keep the defaults.
  }

  return new ApiError({ kind, code, message, status: response.status })
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, getToken, onUnauthorized } = options
  const doFetch: typeof fetch = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))

  async function send(path: string, requestOptions: RequestOptions, accept: string): Promise<Response> {
    const { method = 'GET', query, body, headers, signal, auth = true } = requestOptions
    const url = buildUrl(baseUrl, path, query)

    const requestHeaders = new Headers({ Accept: accept, ...headers })
    if (body !== undefined) requestHeaders.set('Content-Type', 'application/json')

    if (auth) {
      const token = await getToken()
      if (!token) {
        onUnauthorized?.()
        throw new ApiError({
          kind: 'unauthorized',
          code: 'unauthorized',
          message: defaultMessage('unauthorized'),
        })
      }
      requestHeaders.set('Authorization', `Bearer ${token}`)
    }

    let response: Response
    try {
      response = await doFetch(url, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new ApiError({ kind: 'network', code: 'network_error', message: NETWORK_MESSAGE })
    }

    if (response.ok) return response

    if (response.status === 401 && auth) onUnauthorized?.()
    throw await toApiError(response)
  }

  return {
    async request<T>(path: string, requestOptions: RequestOptions = {}): Promise<T> {
      const response = await send(path, requestOptions, 'application/json')
      if (response.status === 204) return undefined as T
      try {
        return (await response.json()) as T
      } catch {
        throw new ApiError({
          kind: 'invalid_response',
          code: 'invalid_json',
          message: 'The server sent a response we could not read.',
          status: response.status,
        })
      }
    },

    async stream(path: string, requestOptions: RequestOptions = {}): Promise<Response> {
      const response = await send(path, requestOptions, 'text/event-stream')
      const contentType = response.headers.get('Content-Type') ?? ''
      if (!contentType.includes('text/event-stream') || !response.body) {
        throw new ApiError({
          kind: 'invalid_response',
          code: 'not_event_stream',
          message: 'The server did not return a streaming response.',
          status: response.status,
        })
      }
      return response
    },
  }
}
