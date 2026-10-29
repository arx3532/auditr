import { BookOpenIcon, CalculatorIcon, RefreshCwIcon, ShieldCheckIcon } from 'lucide-react'

const features = [
  {
    icon: ShieldCheckIcon,
    title: 'Approval before issuing',
    description:
      'A strict confirmation gate sits before every write operation. The agent cannot create, issue, or send an invoice without your explicit sign-off.',
    card: 'from-primary/10',
    chip: 'bg-primary/15 text-primary',
  },
  {
    icon: CalculatorIcon,
    title: 'Tax logic in tested code',
    description:
      'GST and TDS calculations are executed by deterministic, unit-tested backend code. The AI extracts parameters but never calculates tax math.',
    card: 'from-highlight/20',
    chip: 'bg-highlight/35 text-highlight-foreground',
  },
  {
    icon: BookOpenIcon,
    title: 'Double-entry ledger',
    description:
      'Transactions map directly to balanced debit and credit journal entries in PostgreSQL, preserving financial consistency.',
    card: 'from-chart-5/10',
    chip: 'bg-chart-5/15 text-chart-5',
  },
  {
    icon: RefreshCwIcon,
    title: 'Safe retries',
    description:
      'Write endpoints use idempotent request keys. Network timeouts or duplicate clicks will never produce duplicate invoices or ledger entries.',
    card: 'from-success/10',
    chip: 'bg-success/20 text-success',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="border-t border-border px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-xs font-semibold tracking-wider text-primary uppercase">
            Engineering Guardrails
          </h2>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Built for reliability, not surprises
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Financial software demands deterministic guarantees. We keep the AI in the drafting seat and
            proven code in the driver seat.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className={`flex flex-col justify-between rounded-lg border border-border bg-linear-to-br to-card to-60% p-6 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${feature.card}`}
              >
                <div>
                  <div className={`flex size-10 items-center justify-center rounded-lg ${feature.chip}`}>
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}