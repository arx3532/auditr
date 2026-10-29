import { CheckCircle2Icon, FileTextIcon, MessageSquareIcon } from 'lucide-react'

const steps = [
  {
    number: '1',
    title: 'Describe what to bill',
    description:
      'Send a plain chat message specifying the client, services provided, payment terms, and amount.',
    icon: MessageSquareIcon,
    card: 'border-t-primary',
    badge: 'bg-primary/15',
    iconColor: 'text-primary',
  },
  {
    number: '2',
    title: 'Deterministic draft generation',
    description:
      'The AI extracts structured data. Tested, deterministic code calculates GST, TDS, and ledger entries.',
    icon: FileTextIcon,
    card: 'border-t-highlight',
    badge: 'bg-highlight/40',
    iconColor: 'text-highlight-foreground',
  },
  {
    number: '3',
    title: 'Review and confirm',
    description:
      'Inspect the draft invoice. Nothing is written to the ledger or sent until you explicitly approve it.',
    icon: CheckCircle2Icon,
    card: 'border-t-success',
    badge: 'bg-success/20',
    iconColor: 'text-success',
  },
]

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="border-t border-border bg-secondary/30 px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-xs font-semibold tracking-wider text-primary uppercase">Workflow</h2>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">How it works</p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            From natural language instruction to confirmed invoice in three straightforward steps.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div
                key={step.number}
                className={`relative flex flex-col justify-between rounded-lg border border-t-4 border-border bg-card p-6 shadow-xs ${step.card}`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex size-8 items-center justify-center rounded-full text-sm font-bold text-foreground ${step.badge}`}
                    >
                      {step.number}
                    </span>
                    <Icon className={`size-5 ${step.iconColor}`} aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}