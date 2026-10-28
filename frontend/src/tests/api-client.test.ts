import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient, isApiError } from '@/lib/api/client'
import { server } from '@/mocks/server'

const BASE_URL = 'http://api.test'

function makeClient(
  overrides: { getToken?: () => Promise<string | null>; onUnauthorized?: () => void } = {},
) {
  return createApiClient({
    baseUrl: BASE_URL,
    getToken: overrides.getToken ?? (async () => 'test-token'),
    onUnauthorized: overrides.onUnauthorized,
  })
}

async function catchError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (isApiError(error)) return error
    throw error
  }
  throw new Error('Expected the request to fail')
}

describe('createApiClient', () => {
  it('sends the bearer token and query params, skipping empty values', async () => {
    server.use(
      http.get(`${BASE_URL}/echo`, ({ request }) =>
        HttpResponse.json({
          authorization: request.headers.get('Authorization'),
          search: new URL(request.url).search,
        }),
      ),
    )

    const result = await makeClient().request<{ authorization: string; search: string }>('/echo', {
      query: { status: 'paid', cursor: undefined },
    })

    expect(result).toEqual({ authorization: 'Bearer test-token', search: '?status=paid' })
  })

  it('sends no Authorization header for public requests', async () => {
    const getToken = vi.fn(async () => 'test-token')
    server.use(
      http.get(`${BASE_URL}/open`, ({ request }) =>
        HttpResponse.json({ authorization: request.headers.get('Authorization') }),
      ),
    )

    const result = await makeClient({ getToken }).request<{ authorization: string | null }>('/open', {
      auth: false,
    })

    expect(result.authorization).toBeNull()
    expect(getToken).not.toHaveBeenCalled()
  })

  it('fails as unauthorized without a request when there is no token', async () => {
    const onUnauthorized = vi.fn()
    const error = await catchError(
      makeClient({ getToken: async () => null, onUnauthorized }).request('/invoices'),
    )

    expect(error.kind).toBe('unauthorized')
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('normalises a 401 and notifies onUnauthorized', async () => {
    const onUnauthorized = vi.fn()
    server.use(http.get(`${BASE_URL}/secure`, () => HttpResponse.json({}, { status: 401 })))

    const error = await catchError(makeClient({ onUnauthorized }).request('/secure'))

    expect(error).toMatchObject({ kind: 'unauthorized', status: 401, retryable: false })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('reads code and message from the error body', async () => {
    server.use(
      http.get(`${BASE_URL}/missing`, () =>
        HttpResponse.json({ code: 'invoice_not_found', message: 'No such invoice.' }, { status: 404 }),
      ),
    )

    const error = await catchError(makeClient().request('/missing'))

    expect(error).toMatchObject({ kind: 'not_found', code: 'invoice_not_found', message: 'No such invoice.' })
  })

  it("accepts FastAPI's default { detail } error body", async () => {
    server.use(http.get(`${BASE_URL}/bad`, () => HttpResponse.json({ detail: 'Bad input' }, { status: 422 })))

    const error = await catchError(makeClient().request('/bad'))

    expect(error).toMatchObject({ kind: 'client', message: 'Bad input' })
  })

  it('marks 5xx responses as retryable', async () => {
    server.use(http.get(`${BASE_URL}/boom`, () => new HttpResponse('oops', { status: 503 })))

    const error = await catchError(makeClient().request('/boom'))

    expect(error).toMatchObject({ kind: 'server', retryable: true })
  })

  it('maps connection failures to a retryable network error', async () => {
    server.use(http.get(`${BASE_URL}/down`, () => HttpResponse.error()))

    const error = await catchError(makeClient().request('/down'))

    expect(error).toMatchObject({ kind: 'network', retryable: true })
  })

  it('rejects absolute and protocol-relative paths so only the API origin is called', async () => {
    const client = makeClient()

    await expect(client.request('https://evil.test/steal')).rejects.toThrow(/relative/)
    await expect(client.request('//evil.test/steal')).rejects.toThrow(/relative/)
  })

  it('rejects a streaming response that is not an event stream', async () => {
    server.use(http.post(`${BASE_URL}/chat`, () => HttpResponse.json({ ok: true })))

    const error = await catchError(makeClient().stream('/chat', { method: 'POST', body: {} }))

    expect(error.kind).toBe('invalid_response')
  })
})
