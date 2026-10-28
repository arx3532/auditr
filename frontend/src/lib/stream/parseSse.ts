import { StreamProtocolError } from './errors'

/** A single event that never reaches a blank line is cut off instead of growing forever. */
const MAX_LINE_CHARS = 1_000_000

export interface SseParser {
  /** Feeds decoded text and returns the `data` payload of every event completed by it. */
  push(chunk: string): string[]
}

/**
 * Incremental parser for the `text/event-stream` format.
 *
 * Network chunks can end anywhere, including mid-line and between a CR and its LF, so
 * state is kept across calls. Comment lines (keepalives) are ignored. Only `data` fields
 * are used: the chat contract carries the event type inside the JSON payload, so
 * `event`, `id` and `retry` fields are deliberately ignored. An event cut off before its
 * terminating blank line is never emitted.
 */
export function createSseParser(): SseParser {
  let pendingLine = ''
  let dataLines: string[] = []
  let atStart = true
  let skipLeadingLineFeed = false

  function handleLine(line: string, completed: string[]): void {
    if (line === '') {
      if (dataLines.length > 0) completed.push(dataLines.join('\n'))
      dataLines = []
      return
    }
    if (line.startsWith(':')) return

    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    if (field !== 'data') return

    const raw = separator === -1 ? '' : line.slice(separator + 1)
    dataLines.push(raw.startsWith(' ') ? raw.slice(1) : raw)
  }

  return {
    push(chunk) {
      let text = chunk
      if (text === '') return []

      if (atStart) {
        atStart = false
        if (text.startsWith('\uFEFF')) text = text.slice(1)
      }
      if (skipLeadingLineFeed) {
        skipLeadingLineFeed = false
        if (text.startsWith('\n')) text = text.slice(1)
      }

      const completed: string[] = []
      const buffer = pendingLine + text
      let lineStart = 0

      for (let index = 0; index < buffer.length; index++) {
        const char = buffer[index]
        if (char !== '\n' && char !== '\r') continue

        handleLine(buffer.slice(lineStart, index), completed)

        if (char === '\r') {
          if (buffer[index + 1] === '\n') index++
          else if (index + 1 === buffer.length) skipLeadingLineFeed = true
        }
        lineStart = index + 1
      }

      pendingLine = buffer.slice(lineStart)
      if (pendingLine.length > MAX_LINE_CHARS) {
        throw new StreamProtocolError('event_too_large', 'The server sent an event that was too large.')
      }
      return completed
    },
  }
}

/**
 * Yields the `data` payload of each server-sent event in a response body.
 *
 * Aborting the signal cancels the underlying reader, which ends iteration cleanly.
 * Read failures (a dropped connection) are thrown to the caller. The reader is always
 * released, including when the consumer stops iterating early.
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()

  const cancel = () => {
    reader.cancel().catch(() => undefined)
  }
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      for (const data of parser.push(decoder.decode(value, { stream: true }))) {
        yield data
      }
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
    cancel()
    reader.releaseLock()
  }
}
