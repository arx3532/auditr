import type { ChatEvent } from '@/lib/api/types'

import { mockSleep } from './scenario'

export type ScriptStep =
  | { event: ChatEvent; delayMs?: number }
  /** Ends the stream abruptly with a network-level error, as a dropped connection would. */
  | { drop: true; delayMs?: number }

const DEFAULT_DELAY_MS = 90

export function formatSse(event: ChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export function eventSteps(events: ChatEvent[], delayMs?: number): ScriptStep[] {
  return events.map((event) => ({ event, delayMs }))
}

/**
 * Replays a script as a server-sent event stream. Every event is deliberately split
 * across two chunks, and the stream opens with a keepalive comment, so consumers
 * exercise partial-chunk buffering and comment handling on every run.
 */
export function scriptedStream(steps: ScriptStep[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  let pendingSecondHalf: Uint8Array | null = null
  let sentKeepalive = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentKeepalive) {
        sentKeepalive = true
        controller.enqueue(encoder.encode(': keepalive\n\n'))
        return
      }

      if (pendingSecondHalf) {
        await mockSleep(10)
        controller.enqueue(pendingSecondHalf)
        pendingSecondHalf = null
        return
      }

      const step = steps[index++]
      if (!step) {
        controller.close()
        return
      }

      await mockSleep(step.delayMs ?? DEFAULT_DELAY_MS)

      if ('drop' in step) {
        controller.error(new Error('Simulated dropped connection'))
        return
      }

      const bytes = encoder.encode(formatSse(step.event))
      const midpoint = Math.floor(bytes.length / 2)
      controller.enqueue(bytes.slice(0, midpoint))
      pendingSecondHalf = bytes.slice(midpoint)
    },
  })
}
