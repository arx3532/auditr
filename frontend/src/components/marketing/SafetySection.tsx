import { AlertCircleIcon, LockIcon } from 'lucide-react'

/** A dark forest band: the one strong contrast block on the page. */
export function SafetySection() {
  return (
    <section className="border-t border-sidebar-border bg-sidebar px-4 py-16 text-sidebar-foreground sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-6 shadow-lg shadow-black/20 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/20 text-sidebar-primary">
              <LockIcon className="size-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-sidebar-accent-foreground">Safety and privacy</h2>
              <p className="mt-2 text-sm leading-relaxed text-sidebar-foreground/80">
                Sensitive identifiers such as PAN, GSTIN, bank account numbers, and email addresses are masked
                or redacted before reaching external language model APIs. Only structured, sanitized tokens
                are processed.
              </p>

              {/* Mandatory demo disclaimer callout */}
              <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3.5 text-xs text-sidebar-accent-foreground">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
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