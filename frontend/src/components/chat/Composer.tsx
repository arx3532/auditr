'use client'

import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const MAX_LENGTH = 2000
/** The field grows with its content up to this height, then scrolls. */
const MAX_HEIGHT_PX = 200

interface ComposerProps {
  onSend: (text: string) => void
  onStop: () => void
  /** A reply is streaming, so Stop replaces Send. */
  busy: boolean
  /** Typing is not possible right now. */
  disabled: boolean
  /** Why the composer is disabled, shown under the field. */
  hint?: string
}

export function Composer({ onSend, onStop, busy, disabled, hint }: ComposerProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Hand focus back to the field whenever it becomes usable again.
  useEffect(() => {
    if (!disabled) textareaRef.current?.focus()
  }, [disabled])

  // Grow with the text, like the Claude and ChatGPT inputs.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
  }, [value])

  function submit() {
    const text = value.trim()
    if (text === '' || disabled) return
    onSend(text)
    setValue('')
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    submit()
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Label htmlFor="chat-message" className="sr-only">
        Message
      </Label>

      <div
        className={cn(
          'flex items-end gap-2 rounded-3xl border border-border bg-card p-2 pl-4 shadow-sm transition-[border-color,box-shadow] duration-200',
          'focus-within:border-ring/50 focus-within:shadow-md focus-within:ring-4 focus-within:ring-ring/10',
          disabled && !busy && 'bg-muted/40 opacity-70',
        )}
      >
        <textarea
          ref={textareaRef}
          id="chat-message"
          value={value}
          maxLength={MAX_LENGTH}
          rows={1}
          disabled={disabled}
          placeholder="Describe an invoice, e.g. Invoice Acme ₹45,000 for web design, due in 15 days"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          className="max-h-[200px] min-h-10 w-full resize-none bg-transparent py-2 text-base leading-6 md:text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />

        {busy ? (
          <Button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="size-10 shrink-0 rounded-full bg-foreground p-0 text-background hover:bg-foreground/85"
          >
            <SquareIcon className="size-3.5 fill-current" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="submit"
            aria-label="Send message"
            disabled={disabled || value.trim() === ''}
            className="size-10 shrink-0 rounded-full bg-primary p-0 text-primary-foreground transition-transform duration-150 hover:bg-primary/90 active:scale-95 disabled:opacity-30"
          >
            <ArrowUpIcon className="size-5" aria-hidden="true" />
          </Button>
        )}
      </div>

      {hint ? (
        <p className="animate-in px-3 text-sm text-amber-700 fade-in dark:text-amber-400">{hint}</p>
      ) : null}
    </form>
  )
}