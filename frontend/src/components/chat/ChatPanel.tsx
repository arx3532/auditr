'use client'

import {
  CoinsIcon,
  FileCheckIcon,
  FileTextIcon,
  MessageSquarePlusIcon,
  SparklesIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useApi } from '@/lib/api/useApi'
import { useChatStream } from '@/lib/stream/useChatStream'
import { cn } from '@/lib/utils'

import { ChatErrorRow } from './ChatErrorRow'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { ToolStatus } from './ToolStatus'

/** Each suggestion gets one colour from the palette: orange, green, yellow, purple. */
const SUGGESTIONS = [
  {
    icon: FileTextIcon,
    prompt: 'Invoice AdTech ₹50,000, due the 15th',
    chip: 'border-primary/30 bg-primary/10 hover:bg-primary/15',
    badge: 'bg-primary/15 text-primary',
  },
  {
    icon: SparklesIcon,
    prompt: 'Bill HyperScale $2,400 for cloud API consulting, due end of month',
    chip: 'border-success/30 bg-success/10 hover:bg-success/15',
    badge: 'bg-success/20 text-success',
  },
  {
    icon: CoinsIcon,
    prompt: 'Show all overdue invoices and calculate total amount due',
    chip: 'border-highlight/50 bg-highlight/15 hover:bg-highlight/25',
    badge: 'bg-highlight/40 text-highlight-foreground',
  },
  {
    icon: FileCheckIcon,
    prompt: 'Draft monthly retainer invoice of ₹75,000 for Nexus Design LLP',
    chip: 'border-chart-5/25 bg-chart-5/10 hover:bg-chart-5/15',
    badge: 'bg-chart-5/20 text-chart-5',
  },
]

/**
 * One centred column, no boxes. Before the first message the composer sits in the middle of
 * the page under a greeting; after it, the conversation fills the space and the composer
 * drops to the bottom. The composer stays at the same place in the tree, so it keeps focus.
 */
export function ChatPanel() {
  const api = useApi()
  const { state, canSend, canDecide, send, decide, stop, retry, newThread } = useChatStream(api)

  const isWorking = state.status === 'streaming' || state.status === 'resuming'
  const lastUserText = state.messages.findLast((message) => message.role === 'user')?.text
  const hasMessages = state.messages.length > 0

  const hint =
    state.status === 'awaiting_approval' || (state.status === 'error' && canDecide)
      ? 'Confirm, edit or reject the draft above to continue.'
      : undefined

  return (
    <section
      aria-label="Chat workspace"
      className="relative isolate mx-auto flex h-[calc(100dvh-15rem)] min-h-[28rem] w-full max-w-3xl flex-col gap-3"
    >
      {!hasMessages && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-6 -z-10 h-80">
          <div className="absolute top-0 left-1/2 h-64 w-[34rem] max-w-full -translate-x-1/2 rounded-full bg-secondary/80 blur-3xl" />
          <div className="absolute top-8 right-0 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
          <div className="absolute top-24 left-0 h-36 w-36 rounded-full bg-highlight/25 blur-3xl" />
        </div>
      )}

      {hasMessages && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={newThread}
            className="text-muted-foreground"
          >
            <MessageSquarePlusIcon className="size-3.5" aria-hidden="true" />
            New conversation
          </Button>
        </div>
      )}

      {hasMessages && (
        <MessageList
          messages={state.messages}
          canDecide={canDecide}
          onDecide={decide}
          onAskAgain={lastUserText ? () => send(lastUserText) : undefined}
        />
      )}

      <div className={cn('flex flex-col gap-3', !hasMessages && 'flex-1 justify-center gap-6')}>
        {!hasMessages && (
          <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">  
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              What would you like to <span className="text-primary">bill today?</span>
            </h2>
            <p className="max-w-md text-sm text-balance text-muted-foreground sm:text-base">
              Describe the invoice in plain English. You review the draft before anything is issued.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <ToolStatus tool={state.activeTool} active={isWorking} />
          {state.error ? <ChatErrorRow error={state.error} onRetry={retry} /> : null}
          <Composer onSend={send} onStop={stop} busy={isWorking} disabled={!canSend} hint={hint} />
        </div>

        {!hasMessages && (
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map(({ icon: Icon, prompt, chip, badge }) => (
              <button
                key={prompt}
                type="button"
                disabled={!canSend}
                onClick={() => send(prompt)}
                className={cn(
                  'inline-flex max-w-full items-center gap-2.5 rounded-2xl border py-2 pr-4 pl-2 text-left text-sm text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
                  chip,
                )}
              >
                <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', badge)}>
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span>{prompt}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}