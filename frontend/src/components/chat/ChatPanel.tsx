'use client'

import { CoinsIcon, FileCheckIcon, FileTextIcon, MessageSquarePlusIcon, SparklesIcon } from 'lucide-react'

import { AuditrLogo } from '@/components/common/AuditrLogo'
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
 * One centred column, no boxes. It fills the height its parent gives it (the app shell sizes the
 * chat page to the screen), so the conversation scrolls inside it and the composer is always in view.
 * Before the first message the composer sits in the middle under a greeting; after it, the
 * conversation fills the space and the composer drops to the bottom. The composer stays at the same
 * place in the tree, so it keeps focus.
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
      className="relative isolate mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3"
    >
      {/* Warm peach glow matching the landing page hero — fades out smoothly. */}
      {!hasMessages && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_65%_50%_at_45%_60%,color-mix(in_oklab,oklch(0.88_0.07_45)_55%,transparent),transparent_75%)] dark:bg-[radial-gradient(ellipse_60%_45%_at_50%_30%,color-mix(in_oklab,var(--sage)_50%,transparent),transparent_75%)]"
        />
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

      {/* Before the first message this area scrolls on a very short screen, and centres its content when there is room. */}
      <div className={cn('flex flex-col', !hasMessages && 'min-h-0 flex-1 overflow-y-auto')}>
        <div className={cn('flex flex-col gap-3', !hasMessages && 'my-auto gap-4 py-2 sm:gap-5')}>
          {!hasMessages && (
            <div className="flex flex-col items-center gap-2 text-center">
              <AuditrLogo className="size-12 drop-shadow-md sm:size-14" />
              <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                What would you like to <span className="text-primary">bill today?</span>
              </h2>
              <p className="hidden max-w-md text-base text-balance text-muted-foreground sm:block">
                Describe the invoice in plain English. You review the draft before anything is issued.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <ToolStatus tool={state.activeTool} active={isWorking} />
            {state.error ? <ChatErrorRow error={state.error} onRetry={retry} /> : null}
            <Composer onSend={send} onStop={stop} busy={isWorking} disabled={!canSend} hint={hint} />
          </div>

          {/* Two columns on a wide screen, and only the first two on a phone, so it all fits. */}
          {!hasMessages && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(({ icon: Icon, prompt, chip, badge }, index) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={!canSend}
                  onClick={() => send(prompt)}
                  className={cn(
                    'items-center gap-2.5 rounded-2xl border py-2 pr-4 pl-2 text-left text-sm text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
                    index > 1 ? 'hidden sm:flex' : 'flex',
                    chip,
                  )}
                >
                  <span
                    className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', badge)}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}