import { BotIcon, CheckCircle2Icon, LockIcon, MessageSquareIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ProductVisualProps {
  className?: string
}

export function ProductVisual({ className }: ProductVisualProps) {
  const altText =
    'Product preview: user prompts "Invoice AdTech Corp ₹50,000 for website redesign", AI drafts invoice #INV-2025-042 with 18% GST calculated by deterministic code, and requires user confirmation before issuing.'

  return (
    <figure className={cn('relative mx-auto w-full max-w-4xl', className)}>
      {/* Container frame with subtle border and a green-tinted shadow */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-primary/10 ring-1 ring-primary/10">
        {/* Top window chrome header */}
        <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-accent" aria-hidden="true" />
            <span className="size-2.5 rounded-full bg-warning" aria-hidden="true" />
            <span className="size-2.5 rounded-full bg-success" aria-hidden="true" />
            <span className="ml-2 font-mono text-[11px]">preview: chat-to-invoice flow</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
            <LockIcon className="size-3" aria-hidden="true" />
            Approval Gate Active
          </span>
        </div>

        {/* Product preview content */}
        <div className="space-y-4 bg-background/50 p-4 sm:p-6 md:p-8">
          {/* Step 1: User message, coral like the real chat */}
          <div className="flex max-w-xl items-start gap-3">
            <div
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
              aria-hidden="true"
            >
              <MessageSquareIcon className="size-3.5" />
            </div>
            <div className="flex-1 rounded-lg rounded-tl-sm border border-accent/30 bg-accent/10 p-3">
              <span className="mb-0.5 block text-[11px] font-semibold text-muted-foreground">
                User prompt
              </span>
              <p className="text-sm font-medium text-foreground">
                &ldquo;Invoice AdTech Corp ₹50,000 for website redesign, due the 15th&rdquo;
              </p>
            </div>
          </div>

          {/* Step 2: AI draft response with confirmation gate, sage like the real chat */}
          <div className="ml-auto flex max-w-xl items-start gap-3">
            <div className="flex-1 rounded-lg rounded-tr-sm border border-primary/25 bg-secondary/60 p-4 text-left shadow-2xs">
              <div className="mb-3 flex items-center justify-between border-b border-primary/15 pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
                    AI
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    Draft Prepared (#INV-2025-042)
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 font-mono text-[10px] text-foreground">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                  Tax logic computed by code
                </span>
              </div>

              {/* Structured draft preview */}
              <div className="space-y-1.5 font-mono text-xs text-foreground">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Client:</span>
                  <span className="font-semibold">AdTech Corp</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Service (SAC 998314):</span>
                  <span>Website Redesign</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Taxable Amount:</span>
                  <span>₹50,000.00</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">18% GST (CGST 9% + SGST 9%):</span>
                  <span>₹9,000.00</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-primary px-2.5 py-1.5 text-sm font-bold text-primary-foreground">
                  <span>Total Due:</span>
                  <span>₹59,000.00</span>
                </div>
              </div>

              {/* Explicit Human Approval Gate */}
              <div className="mt-4 flex flex-col justify-between gap-2.5 border-t border-primary/20 pt-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <LockIcon className="size-3.5 text-accent" aria-hidden="true" />
                  <span>Requires your confirmation to write to ledger</span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-2xs">
                  <CheckCircle2Icon className="size-3.5" aria-hidden="true" />
                  <span>Confirm &amp; Issue</span>
                </div>
              </div>
            </div>

            <div
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
              aria-hidden="true"
            >
              <BotIcon className="size-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Accessible caption / text alternative for screen readers */}
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">{altText}</figcaption>
    </figure>
  )
}