import { Loader2Icon } from 'lucide-react'

const TOOL_LABELS: Record<string, string> = {
  list_overdue_invoices: 'Looking up overdue invoices...',
  lookup_customer: 'Looking up customer billing records...',
  calculate_tax: 'Calculating GST, SAC & tax split...',
  prepare_draft: 'Drafting structured invoice...',
}

const FALLBACK_LABEL = 'Agent reasoning...'

export function toolLabel(tool: string | undefined): string {
  return (tool && TOOL_LABELS[tool]) || FALLBACK_LABEL
}

interface ToolStatusProps {
  /** The tool running right now, or undefined when the assistant is only replying. */
  tool: string | undefined
  /** A reply is on its way, even if no tool is running. */
  active: boolean
}

/** A small sage pill above the composer: a green spinner and a softly pulsing label. */
export function ToolStatus({ tool, active }: ToolStatusProps) {
  return (
    <div role="status" className="min-h-8 px-2">
      {active ? (
        <p className="inline-flex animate-in items-center gap-2 rounded-full border border-success/30 bg-secondary px-3 py-1 text-sm text-secondary-foreground duration-200 fade-in">
          <Loader2Icon
            className="size-3.5 animate-spin text-success motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span className="animate-pulse motion-reduce:animate-none">
            {tool ? toolLabel(tool) : 'Assistant is thinking...'}
          </span>
        </p>
      ) : null}
    </div>
  )
}