import { describe, expect, it, vi } from 'vitest'

import { createInitialRecords } from '@/mocks/fixtures'
import { decodeChatEvent } from '@/lib/stream/chatEvent'
import { StreamProtocolError } from '@/lib/stream/errors'
import { createSseParser, parseSse } from '@/lib/stream/parseSse'

const encoder = new TextEncoder()

async function collect(source: AsyncIterable<string>): Promise<string[]> {
  const items: string[] = []
  for await (const item of source) items.push(item)
  return items
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function pushAcrossSplit(message: string, splitAt: number): string[] {
  const parser = createSseParser()
  return [...parser.push(message.slice(0, splitAt)), ...parser.push(message.slice(splitAt))]
}

describe('createSseParser', () => {
  it('returns the data of each completed event', () => {
    const parser = createSseParser()
    expect(parser.push('data: one\n\ndata: two\n\n')).toEqual(['one', 'two'])
  })

  it('buffers an event until its blank line arrives', () => {
    const parser = createSseParser()
    expect(parser.push('data: {"text":')).toEqual([])
    expect(parser.push('"hello"}\n')).toEqual([])
    expect(parser.push('\n')).toEqual(['{"text":"hello"}'])
  })

  it('gives the same result however the stream is split into chunks', () => {
    const samples: Array<[string, string[]]> = [
      ['data: {"a":1}\n\ndata: {"b":2}\n\n', ['{"a":1}', '{"b":2}']],
      ['data: x\r\n\r\ndata: y\r\n\r\n', ['x', 'y']],
      ['data: x\r\rdata: y\r\r', ['x', 'y']],
      [': keepalive\n\ndata: x\n\n', ['x']],
    ]
    for (const [message, expected] of samples) {
      for (let splitAt = 1; splitAt < message.length; splitAt++) {
        expect(pushAcrossSplit(message, splitAt)).toEqual(expected)
      }
    }
  })

  it('ignores comment and keepalive lines', () => {
    const parser = createSseParser()
    expect(parser.push(': keepalive\n\n')).toEqual([])
    expect(parser.push('data: one\n: mid-event comment\n\n')).toEqual(['one'])
  })

  it('joins multiple data lines with a newline', () => {
    const parser = createSseParser()
    expect(parser.push('data: first\ndata: second\n\n')).toEqual(['first\nsecond'])
  })

  it('removes only one leading space and treats a colon-less data field as empty', () => {
    const parser = createSseParser()
    expect(parser.push('data:  padded\n\n')).toEqual([' padded'])
    expect(parser.push('data:tight\n\n')).toEqual(['tight'])
    expect(parser.push('data\n\n')).toEqual([''])
  })

  it('ignores event, id and retry fields', () => {
    const parser = createSseParser()
    expect(parser.push('event: custom\nid: 7\nretry: 1000\ndata: payload\n\n')).toEqual(['payload'])
  })

  it('never emits an event that was cut off before its blank line', () => {
    const parser = createSseParser()
    expect(parser.push('data: complete\n\ndata: truncated\n')).toEqual(['complete'])
  })

  it('skips an event that has no data lines', () => {
    const parser = createSseParser()
    expect(parser.push('event: ping\n\n')).toEqual([])
  })

  it('strips a leading byte order mark', () => {
    const parser = createSseParser()
    expect(parser.push('\uFEFFdata: one\n\n')).toEqual(['one'])
  })

  it('throws when a single line grows past the limit', () => {
    const parser = createSseParser()
    expect(() => parser.push(`data: ${'x'.repeat(1_000_001)}`)).toThrow(StreamProtocolError)
  })
})

describe('parseSse', () => {
  it('decodes multi-byte characters split across network chunks', () => {
    const bytes = encoder.encode('data: {"text":"₹50,000"}\n\n')
    const oneByteAtATime = Array.from(bytes, (byte) => Uint8Array.of(byte))

    return expect(collect(parseSse(streamOf(oneByteAtATime)))).resolves.toEqual(['{"text":"₹50,000"}'])
  })

  it('throws read errors after yielding the events that arrived before them', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: one\n\n'))
      },
      pull(controller) {
        controller.error(new Error('connection reset'))
      },
    })

    const received: string[] = []
    const consume = (async () => {
      for await (const data of parseSse(stream)) received.push(data)
    })()

    await expect(consume).rejects.toThrow('connection reset')
    expect(received).toEqual(['one'])
  })

  it('ends cleanly and cancels the reader when the signal aborts', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: one\n\n'))
      },
      cancel,
    })
    const controller = new AbortController()

    const received: string[] = []
    for await (const data of parseSse(stream, controller.signal)) {
      received.push(data)
      controller.abort()
    }

    expect(received).toEqual(['one'])
    expect(cancel).toHaveBeenCalled()
  })

  it('ends immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const neverEnding = new ReadableStream<Uint8Array>({})
    await expect(collect(parseSse(neverEnding, controller.signal))).resolves.toEqual([])
  })

  it('releases the stream when the consumer stops early', async () => {
    const stream = streamOf([encoder.encode('data: one\n\ndata: two\n\n')])

    for await (const data of parseSse(stream)) {
      expect(data).toBe('one')
      break
    }

    expect(stream.locked).toBe(false)
  })
})

describe('decodeChatEvent', () => {
  const invoice = createInitialRecords()[0].invoice

  it('decodes every event type in the contract', () => {
    const events = [
      { type: 'thread', threadId: 'thr_1' },
      { type: 'text_delta', text: 'hello' },
      { type: 'tool_start', tool: 'lookup_customer' },
      { type: 'tool_end', tool: 'lookup_customer' },
      { type: 'approval_required', approvalId: 'apr_1', expiresAt: '2030-01-01T00:00:00Z', draft: invoice },
      {
        type: 'approval_required',
        approvalId: 'apr_2',
        expiresAt: '2030-01-01T00:00:00Z',
        payment: {
          invoice,
          cashReceived: '100.00',
          tdsDeducted: '10.00',
          date: '2030-01-01',
          amountDueAfter: '0.00',
          statusAfter: 'paid',
        },
      },
      { type: 'approval_resolved', approvalId: 'apr_1', outcome: 'approved', invoice },
      {
        type: 'approval_resolved',
        approvalId: 'apr_2',
        outcome: 'approved',
        invoice,
        payment: {
          id: 'pay_1',
          invoiceId: invoice.id,
          cashReceived: '100.00',
          tdsDeducted: '10.00',
          date: '2030-01-01',
        },
      },
      { type: 'approval_resolved', approvalId: 'apr_3', outcome: 'rejected' },
      { type: 'error', code: 'upstream_unavailable', message: 'Try again.' },
      { type: 'done' },
    ]
    for (const event of events) {
      expect(decodeChatEvent(JSON.stringify(event))).toEqual(event)
    }
  })

  it('ignores empty payloads and event types it does not know', () => {
    expect(decodeChatEvent('')).toBeNull()
    expect(decodeChatEvent('   ')).toBeNull()
    expect(decodeChatEvent('{"type":"future_event","anything":true}')).toBeNull()
  })

  it('ignores invoice_issued, which the backend never sends', () => {
    expect(decodeChatEvent(JSON.stringify({ type: 'invoice_issued', invoice }))).toBeNull()
  })

  it('decodes the backend approval_required payload, including its extra kind label', () => {
    const wire = {
      type: 'approval_required',
      approvalId: 'apr_1',
      kind: 'issue_invoice',
      expiresAt: '2030-01-01T00:00:00+00:00',
      draft: invoice,
    }
    const decoded = decodeChatEvent(JSON.stringify(wire))
    expect(decoded).toMatchObject({ type: 'approval_required', draft: JSON.parse(JSON.stringify(invoice)) })
    expect(decoded).not.toHaveProperty('kind')
  })

  it('decodes a record_payment approval exactly as the backend builds it', () => {
    // Shape of `build_approval_payload` for kind "record_payment", sent through `approval_required`.
    const wire = {
      type: 'approval_required',
      approvalId: '6f1c1b0e-3a57-4c43-9d0e-2b6f0f7a9c11',
      kind: 'record_payment',
      expiresAt: '2026-11-01T10:15:00.123456+00:00',
      payment: {
        invoice: { ...invoice, status: 'issued' },
        cashReceived: '53100.00',
        tdsDeducted: '5900.00',
        date: '2026-11-01',
        amountDueAfter: '0.00',
        statusAfter: 'paid',
      },
    }
    const decoded = decodeChatEvent(JSON.stringify(wire))
    expect(decoded).toMatchObject({
      type: 'approval_required',
      approvalId: wire.approvalId,
      payment: { cashReceived: '53100.00', statusAfter: 'paid' },
    })
    expect(decoded).not.toHaveProperty('draft')
  })

  it('rejects an approval_required event with neither a draft nor a payment', () => {
    const payload = JSON.stringify({ type: 'approval_required', approvalId: 'a', expiresAt: 'x' })
    expect(() => decodeChatEvent(payload)).toThrow(StreamProtocolError)
  })

  it('rejects an approval_resolved event with an unknown outcome', () => {
    const payload = JSON.stringify({ type: 'approval_resolved', approvalId: 'a', outcome: 'maybe' })
    expect(() => decodeChatEvent(payload)).toThrow(StreamProtocolError)
  })

  it('throws StreamProtocolError for malformed payloads', () => {
    const malformed = [
      'not json',
      '[]',
      '"text"',
      '{"no":"type"}',
      '{"type":"text_delta"}',
      '{"type":"thread","threadId":5}',
    ]
    for (const payload of malformed) {
      expect(() => decodeChatEvent(payload)).toThrow(StreamProtocolError)
    }
  })

  it('rejects a draft whose money is not a decimal string', () => {
    const floaty = { ...invoice, total: 59000.5 }
    const payload = JSON.stringify({
      type: 'approval_required',
      approvalId: 'apr_1',
      expiresAt: '2030-01-01T00:00:00Z',
      draft: floaty,
    })
    expect(() => decodeChatEvent(payload)).toThrow(StreamProtocolError)
  })

  it('does not echo the payload in the error message', () => {
    expect(() => decodeChatEvent('{"type":"text_delta","text":42,"secret":"pan-1234"}')).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('pan-1234') }),
    )
  })
})