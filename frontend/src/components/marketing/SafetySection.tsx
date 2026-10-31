import { AlertCircleIcon, LockIcon } from 'lucide-react'

export function SafetySection() {
  return (
    <section className="border-t border-border bg-muted/40 px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LockIcon className="size-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground">Safety and privacy</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Sensitive identifiers such as PAN, GSTIN, bank account numbers, and email addresses are masked
                or redacted before reaching external language model APIs. Only structured, sanitized tokens
                are processed.
              </p>

              {/* Mandatory demo disclaimer callout */}
              <div className="mt-5 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3.5 text-xs text-foreground">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <p className="font-medium">
                  <strong>Demo data only.</strong> Please do not enter real personal or financial details.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}