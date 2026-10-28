import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Server and model text is always rendered as plain text, never as HTML.
 * Your messages are a coral-tinted bubble on the right; the assistant's replies are sage green
 * on the left, matching the palette roles (accent for you, secondary for the assistant).
 */
export function MessageBubble({ role, text }: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div
      className={cn(
        'flex animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-7 break-words whitespace-pre-wrap sm:max-w-[75%]',
          isUser
            ? 'rounded-br-lg border border-accent/30 bg-accent/15 text-foreground'
            : 'rounded-bl-lg bg-secondary text-secondary-foreground',
        )}
      >
        <span className="sr-only">{isUser ? 'You said: ' : 'Assistant said: '}</span>
        {text}
      </div>
    </div>
  )
}