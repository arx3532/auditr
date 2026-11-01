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

  it('reads code and message from the backend { error: { code, message } } body', async () => {
    server.use(
      http.get(`${BASE_URL}/missing`, () =>
        HttpResponse.json(
          { error: { code: 'invoice_not_found', message: 'Invoice not found' } },
          { status: 404 },
        ),
      ),
    )

    const error = await catchError(makeClient().request('/missing'))

    expect(error).toMatchObject({ kind: 'not_found', code: 'invoice_not_found', message: 'Invoice not found' })
  })

  it('prefers the nested error over a flat code and message', async () => {
    server.use(
      http.get(`${BASE_URL}/both`, () =>
        HttpResponse.json(
          { code: 'flat', message: 'Flat.', error: { code: 'nested', message: 'Nested.' } },
          { status: 409 },
        ),
      ),
    )

    const error = await catchError(makeClient().request('/both'))

    expect(error).toMatchObject({ code: 'nested', message: 'Nested.' })
  })

  it('summarises a FastAPI 422 validation error whose detail is an array', async () => {
    server.use(
      http.post(`${BASE_URL}/invoices`, () =>
        HttpResponse.json(
          {
            detail: [
              { type: 'missing', loc: ['body', 'dueDate'], msg: 'Field required', input: {} },
              { type: 'string_too_short', loc: ['body', 'items', 0, 'description'], msg: 'String should have at least 1 character' },
            ],
          },
          { status: 422 },
        ),
      ),
    )

    const error = await catchError(makeClient().request('/invoices', { method: 'POST', body: {} }))

    expect(error).toMatchObject({
      kind: 'client',
      status: 422,
      code: 'validation_error',
      message: 'dueDate: Field required; items.0.description: String should have at least 1 character',
    })
  })

  it('falls back to the status defaults for an empty validation detail array', async () => {
    server.use(http.get(`${BASE_URL}/empty`, () => HttpResponse.json({ detail: [] }, { status: 422 })))

    const error = await catchError(makeClient().request('/empty'))

    expect(error).toMatchObject({ code: 'validation_error', message: 'Something went wrong with that request.' })
  })

  it('still reads the flat { code, message } shape as a final fallback', async () => {
    server.use(
      http.get(`${BASE_URL}/flat`, () =>
        HttpResponse.json({ code: 'invoice_not_found', message: 'No such invoice.' }, { status: 404 }),
      ),
    )

    const error = await catchError(makeClient().request('/flat'))

    expect(error).toMatchObject({ kind: 'not_found', code: 'invoice_not_found', message: 'No such invoice.' })
  })

  it('keeps the status defaults when the error body has an unexpected shape', async () => {
    server.use(
      http.get(`${BASE_URL}/odd`, () => HttpResponse.json({ error: 'nope' }, { status: 500 })),
    )

    const error = await catchError(makeClient().request('/odd'))

    expect(error).toMatchObject({ kind: 'server', code: 'http_500', message: 'The server ran into a problem. Please try again.' })
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