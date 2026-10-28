import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient } from '@/lib/api/client'
import { createEndpoints, type ApiEndpoints } from '@/lib/api/endpoints'
import type { ChatEvent } from '@/lib/api/types'
import { useChatStream } from '@/lib/stream/useChatStream'
import type { ThreadStorage } from '@/lib/stream/threadStorage'
import { createInitialRecords } from '@/mocks/fixtures'
import { setMockScenario } from '@/mocks/scenario'
import { formatSse } from '@/mocks/scriptedStream'

const encoder = new TextEncoder()
const draft = createInitialRecords()[0].invoice

const thread: ChatEvent = { type: 'thread', threadId: 'thr_1' }
const approval = (approvalId = 'apr_1'): ChatEvent => ({
  type: 'approval_required',
  approvalId,
  expiresAt: '2030-01-01T00:00:00Z',
  draft,
})

function sseResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

function eventsResponse(events: ChatEvent[]): Response {
  return sseResponse(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(formatSse(event)))
        controller.close()
      },
    }),
  )
}

function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn()
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel,
  })
  return {
    response: sseResponse(stream),
    cancel,
    push: (event: ChatEvent) => controller.enqueue(encoder.encode(formatSse(event))),
    pushRaw: (raw: string) => controller.enqueue(encoder.encode(raw)),
    close: () => controller.close(),
    fail: (error: Error) => controller.error(error),
  }
}

function memoryStorage(initial: string | null = null): ThreadStorage & { value: string | null } {
  const storage = {
    value: initial,
    load: () => storage.value,
    save: (id: string) => {
      storage.value = id
    },
    clear: () => {
      storage.value = null
    },
  }
  return storage
}

const startChat = vi.fn<ApiEndpoints['startChat']>()
const resumeChat = vi.fn<ApiEndpoints['resumeChat']>()
const api = { startChat, resumeChat }

function setup(storage: ThreadStorage = memoryStorage()) {
  return renderHook(() => useChatStream(api, { storage }))
}

async function reachApproval(result: ReturnType<typeof setup>['result']) {
  startChat.mockResolvedValueOnce(eventsResponse([thread, approval()]))
  act(() => result.current.send('Invoice AdTech'))
  await waitFor(() => expect(result.current.state.status).toBe('awaiting_approval'))
}

const networkError = () =>
  new ApiError({ kind: 'network', status: 0, code: 'network_error', message: 'Offline.' })

// Events cross the wire as JSON, so fields that were undefined in the fixture are absent.
const draftOnTheWire = JSON.parse(JSON.stringify(draft)) as typeof draft

beforeEach(() => {
  startChat.mockReset()
  resumeChat.mockReset()
})

describe('useChatStream', () => {
  it('streams a reply into one assistant message and remembers the thread', async () => {
    const storage = memoryStorage()
    startChat.mockResolvedValueOnce(
      eventsResponse([
        thread,
        { type: 'tool_start', tool: 'list_overdue_invoices' },
        { type: 'tool_end', tool: 'list_overdue_invoices' },
        { type: 'text_delta', text: 'You have ' },
        { type: 'text_delta', text: 'one overdue invoice.' },
        { type: 'done' },
      ]),
    )
    const { result } = setup(storage)

    act(() => result.current.send('  what is overdue?  '))
    expect(result.current.state.status).toBe('streaming')
    await waitFor(() => expect(result.current.state.status).toBe('idle'))

    expect(startChat).toHaveBeenCalledWith({ message: 'what is overdue?' }, expect.any(AbortSignal))
    expect(result.current.state.messages).toMatchObject([
      { role: 'user', text: 'what is overdue?' },
      { role: 'assistant', text: 'You have one overdue invoice.' },
    ])
    expect(result.current.state.activeTool).toBeUndefined()
    expect(storage.value).toBe('thr_1')
  })

  it('sends the thread id on later messages and when restored from storage', async () => {
    startChat.mockImplementation(async () => eventsResponse([thread, { type: 'done' }]))
    const { result } = setup(memoryStorage('thr_saved'))

    await waitFor(() => expect(result.current.state.threadId).toBe('thr_saved'))
    act(() => result.current.send('first'))
    await waitFor(() => expect(result.current.state.status).toBe('idle'))
    expect(startChat).toHaveBeenLastCalledWith(
      { threadId: 'thr_saved', message: 'first' },
      expect.any(AbortSignal),
    )

    act(() => result.current.send('second'))
    await waitFor(() => expect(result.current.state.status).toBe('idle'))
    expect(startChat).toHaveBeenLastCalledWith(
      { threadId: 'thr_1', message: 'second' },
      expect.any(AbortSignal),
    )
  })

  it('ignores empty input', () => {
    const { result } = setup()
    act(() => result.current.send('   '))
    expect(startChat).not.toHaveBeenCalled()
  })

  it('blocks the composer while a draft waits and approves it with an idempotency key', async () => {
    const { result } = setup()
    await reachApproval(result)

    expect(result.current.canSend).toBe(false)
    expect(result.current.canDecide).toBe(true)
    act(() => result.current.send('something else'))
    expect(startChat).toHaveBeenCalledTimes(1)

    resumeChat.mockResolvedValueOnce(
      eventsResponse([
        thread,
        { type: 'text_delta', text: 'Done.' },
        { type: 'invoice_issued', invoice: draft },
        { type: 'done' },
      ]),
    )
    act(() => result.current.decide('approve'))
    expect(result.current.state.status).toBe('resuming')
    await waitFor(() => expect(result.current.state.status).toBe('idle'))

    expect(resumeChat).toHaveBeenCalledWith(
      { threadId: 'thr_1', decision: 'approve' },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      expect.any(AbortSignal),
    )
    expect(result.current.state.messages.at(-1)).toMatchObject({
      role: 'assistant',
    })
    expect(result.current.state.messages.find((m) => m.role === 'approval')).toMatchObject({
      decision: { kind: 'approved', invoice: draftOnTheWire },
    })
    expect(result.current.canSend).toBe(true)
  })

  it('sends edits only with an edit decision', async () => {
    const { result } = setup()
    await reachApproval(result)

    resumeChat.mockResolvedValueOnce(eventsResponse([thread, approval('apr_2')]))
    act(() => result.current.decide('edit', { amount: '60000.00' }))
    await waitFor(() => expect(result.current.state.status).toBe('awaiting_approval'))

    expect(resumeChat).toHaveBeenCalledWith(
      { threadId: 'thr_1', decision: 'edit', edits: { amount: '60000.00' } },
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(result.current.state.messages.filter((m) => m.role === 'approval')).toHaveLength(1)
  })

  it('starts only one request when a decision is clicked twice in the same tick', async () => {
    const { result } = setup()
    await reachApproval(result)

    const stream = controlledStream()
    resumeChat.mockResolvedValue(stream.response)
    act(() => {
      result.current.decide('approve')
      result.current.decide('approve')
    })

    expect(resumeChat).toHaveBeenCalledTimes(1)
    act(() => stream.close())
  })

  it('stops reading after the approval request so the decision is not blocked', async () => {
    const { result } = setup()
    const stream = controlledStream()
    startChat.mockResolvedValueOnce(stream.response)

    act(() => result.current.send('Invoice AdTech'))
    act(() => {
      stream.push(thread)
      stream.push(approval())
    })
    await waitFor(() => expect(result.current.canDecide).toBe(true))

    resumeChat.mockResolvedValueOnce(eventsResponse([thread, { type: 'done' }]))
    act(() => result.current.decide('reject'))
    await waitFor(() => expect(result.current.state.status).toBe('idle'))
    expect(resumeChat).toHaveBeenCalledTimes(1)
  })

  it('reuses the idempotency key when the same decision is retried, and a new one for a different decision', async () => {
    const { result } = setup()
    await reachApproval(result)

    resumeChat.mockRejectedValueOnce(networkError()).mockRejectedValueOnce(networkError())
    act(() => result.current.decide('approve'))
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.error).toMatchObject({ code: 'network_error', retryable: true })
    expect(result.current.canDecide).toBe(true)

    act(() => result.current.retry())
    await waitFor(() => expect(resumeChat).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.state.status).toBe('error'))

    resumeChat.mockResolvedValueOnce(eventsResponse([thread, { type: 'done' }]))
    act(() => result.current.decide('reject'))
    await waitFor(() => expect(result.current.state.status).toBe('idle'))

    const keys = resumeChat.mock.calls.map(([, key]) => key)
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })

  it('shows a retryable error when the connection drops mid-stream, and retry repeats the message', async () => {
    const { result } = setup()
    const first = controlledStream()
    startChat.mockResolvedValueOnce(first.response)

    act(() => result.current.send('hello'))
    act(() => {
      first.push(thread)
      first.push({ type: 'text_delta', text: 'Sure, I' })
    })
    await waitFor(() => expect(result.current.state.messages).toHaveLength(2))
    act(() => first.fail(new TypeError('network error')))

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.error).toMatchObject({ code: 'stream_dropped', retryable: true })
    expect(result.current.canSend).toBe(true)

    startChat.mockResolvedValueOnce(
      eventsResponse([thread, { type: 'text_delta', text: 'Here you go.' }, { type: 'done' }]),
    )
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state.status).toBe('idle'))

    expect(result.current.state.messages.filter((m) => m.role === 'user')).toHaveLength(1)
    expect(startChat).toHaveBeenLastCalledWith(
      { threadId: 'thr_1', message: 'hello' },
      expect.any(AbortSignal),
    )
  })

  it('treats a stream that closes without a terminal event as dropped', async () => {
    startChat.mockResolvedValueOnce(eventsResponse([thread, { type: 'text_delta', text: 'Half an ans' }]))
    const { result } = setup()

    act(() => result.current.send('hello'))
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.error?.code).toBe('stream_dropped')
  })

  it('surfaces a server error event with its message', async () => {
    startChat.mockResolvedValueOnce(
      eventsResponse([
        thread,
        { type: 'error', code: 'upstream_unavailable', message: 'Assistant is down.' },
      ]),
    )
    const { result } = setup()

    act(() => result.current.send('hello'))
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.error).toEqual({
      code: 'upstream_unavailable',
      message: 'Assistant is down.',
      retryable: true,
    })
  })

  it('does not offer retry for a non-retryable HTTP error', async () => {
    startChat.mockRejectedValueOnce(
      new ApiError({
        kind: 'unauthorized',
        status: 401,
        code: 'unauthorized',
        message: 'Please sign in again.',
      }),
    )
    const { result } = setup()

    act(() => result.current.send('hello'))
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.error).toMatchObject({ code: 'unauthorized', retryable: false })
  })

  it('expires the card when the server reports the approval expired', async () => {
    const { result } = setup()
    await reachApproval(result)

    resumeChat.mockResolvedValueOnce(
      eventsResponse([thread, { type: 'error', code: 'approval_expired', message: 'Expired.' }]),
    )
    act(() => result.current.decide('approve'))
    await waitFor(() => expect(result.current.state.status).toBe('idle'))

    expect(result.current.state.messages.find((m) => m.role === 'approval')).toMatchObject({
      decision: { kind: 'expired' },
    })
    expect(result.current.state.error).toBeUndefined()
    expect(result.current.canSend).toBe(true)
  })

  it('reports a malformed event and skips unknown ones', async () => {
    const skipped = controlledStream()
    startChat.mockResolvedValueOnce(skipped.response)
    const { result } = setup()

    act(() => result.current.send('hello'))
    act(() => {
      skipped.pushRaw('data: {"type":"future_event"}\n\n')
      skipped.push({ type: 'text_delta', text: 'still fine' })
      skipped.push({ type: 'done' })
    })
    await waitFor(() => expect(result.current.state.status).toBe('idle'))
    expect(result.current.state.messages.at(-1)).toMatchObject({ text: 'still fine' })

    const malformed = controlledStream()
    startChat.mockResolvedValueOnce(malformed.response)
    act(() => result.current.send('again'))
    act(() => malformed.pushRaw('data: {"type":"text_delta"}\n\n'))
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.error?.code).toBe('invalid_event')
  })

  it('stop aborts the request, cancels the stream and returns to idle without an error', async () => {
    const { result } = setup()
    const stream = controlledStream()
    startChat.mockResolvedValueOnce(stream.response)

    act(() => result.current.send('hello'))
    act(() => {
      stream.push(thread)
      stream.push({ type: 'tool_start', tool: 'lookup_customer' })
    })
    await waitFor(() => expect(result.current.state.activeTool).toBe('lookup_customer'))

    act(() => result.current.stop())
    await waitFor(() => expect(result.current.state.status).toBe('idle'))

    expect(result.current.state.error).toBeUndefined()
    expect(result.current.state.activeTool).toBeUndefined()
    expect(stream.cancel).toHaveBeenCalled()
    expect(result.current.canSend).toBe(true)
  })

  it('aborts the request in flight when unmounted', async () => {
    const { result, unmount } = setup()
    const stream = controlledStream()
    startChat.mockResolvedValueOnce(stream.response)

    act(() => result.current.send('hello'))
    await waitFor(() => expect(startChat).toHaveBeenCalled())
    const signal = startChat.mock.calls[0][1]

    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('starts a fresh thread and forgets the stored one', async () => {
    const storage = memoryStorage('thr_saved')
    startChat.mockResolvedValueOnce(eventsResponse([thread, { type: 'done' }]))
    const { result } = setup(storage)

    act(() => result.current.send('hello'))
    await waitFor(() => expect(result.current.state.status).toBe('idle'))
    act(() => result.current.newThread())

    expect(result.current.state.messages).toEqual([])
    expect(result.current.state.threadId).toBeUndefined()
    expect(storage.value).toBeNull()
  })
})

describe('useChatStream against the mock server', () => {
  const real = createEndpoints(
    createApiClient({ baseUrl: 'http://api.test', getToken: async () => 'test-token' }),
  )

  function setupReal() {
    return renderHook(() => useChatStream(real, { storage: memoryStorage() }))
  }

  const request = 'Invoice AdTech ₹50,000, due the 15th'

  it('drafts an invoice, waits for approval, then issues it', async () => {
    const { result } = setupReal()

    act(() => result.current.send(request))
    await waitFor(() => expect(result.current.state.status).toBe('awaiting_approval'))

    const card = result.current.state.messages.find((m) => m.role === 'approval')
    expect(card).toMatchObject({ draft: { status: 'draft', customer: { name: expect.any(String) } } })

    act(() => result.current.decide('approve'))
    await waitFor(() => expect(result.current.state.status).toBe('idle'))

    const settled = result.current.state.messages.find((m) => m.role === 'approval')
    expect(settled).toMatchObject({ decision: { kind: 'approved', invoice: { status: 'issued' } } })
  })

  it('answers an overdue question without an approval step', async () => {
    const { result } = setupReal()

    act(() => result.current.send('what is overdue?'))
    await waitFor(() => expect(result.current.state.status).toBe('idle'))

    expect(result.current.state.messages.some((m) => m.role === 'approval')).toBe(false)
    expect(result.current.state.messages.at(-1)).toMatchObject({ role: 'assistant' })
  })

  it('recovers from a dropped connection with retry', async () => {
    setMockScenario('drop')
    const { result } = setupReal()

    act(() => result.current.send(request))
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.error?.code).toBe('stream_dropped')

    setMockScenario(null)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state.status).toBe('awaiting_approval'))
  })

  it('shows the server error event', async () => {
    setMockScenario('error')
    const { result } = setupReal()

    act(() => result.current.send(request))
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state.error?.code).toBe('upstream_unavailable')
  })

  it('expires an approval the server no longer accepts', async () => {
    setMockScenario('expired')
    const { result } = setupReal()

    act(() => result.current.send(request))
    await waitFor(() => expect(result.current.state.status).toBe('awaiting_approval'))
    act(() => result.current.decide('approve'))
    await waitFor(() => expect(result.current.state.status).toBe('idle'))

    expect(result.current.state.messages.find((m) => m.role === 'approval')).toMatchObject({
      decision: { kind: 'expired' },
    })
  })
})
