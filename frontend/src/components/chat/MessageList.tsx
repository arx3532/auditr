'use client'

import { ArrowDownIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { DraftInvoiceCard } from '@/components/approval/DraftInvoiceCard'
import { PaymentApprovalCard } from '@/components/approval/PaymentApprovalCard'
import type { DraftEdits, ResumeDecision } from '@/lib/api/types'
import type { ChatMessage } from '@/lib/stream/chatState'

import { MessageBubble } from './MessageBubble'

/** How close to the bottom still counts as "following along". */
const NEAR_BOTTOM_PX = 96

interface MessageListProps {
  messages: ChatMessage[]
  canDecide: boolean
  onDecide: (decision: ResumeDecision, edits?: DraftEdits) => void
  onAskAgain?: () => void
}

export function MessageList({ messages, canDecide, onDecide, onAskAgain }: MessageListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const [showJump, setShowJump] = useState(false)

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    followingRef.current = near
    setShowJump(!near)
  }, [])

  // Follow new content only while the reader is at the bottom, so scrolling up to reread is
  // never yanked away. A message the user has just sent always scrolls into view.
  useEffect(() => {
    if (followingRef.current || messages.at(-1)?.role === 'user') {
      endRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto rounded-lg py-2 pr-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {messages.map((message) => {
          if (message.role !== 'approval') {
            return <MessageBubble key={message.id} role={message.role} text={message.text} />
          }
          return message.kind === 'payment' ? (
            <PaymentApprovalCard
              key={message.id}
              approval={message}
              canDecide={canDecide}
              onDecide={onDecide}
              onAskAgain={onAskAgain}
            />
          ) : (
            <DraftInvoiceCard
              key={message.id}
              approval={message}
              canDecide={canDecide}
              onDecide={onDecide}
              onAskAgain={onAskAgain}
            />
          )
        })}
        <div ref={endRef} aria-hidden="true" />
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })}
          aria-label="Jump to latest message"
          className="absolute bottom-3 left-1/2 flex size-9 -translate-x-1/2 animate-in items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors duration-150 fade-in hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowDownIcon className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}