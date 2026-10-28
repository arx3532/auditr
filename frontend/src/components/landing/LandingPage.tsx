'use client'

import {
  ArrowRightIcon,
  BotIcon,
  FileTextIcon,
  GlobeIcon,
  IndianRupeeIcon,
  MessageSquareIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'

/* ────────────────────────────── Hero ────────────────────────────── */
function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden px-6 pt-24 pb-20 sm:px-12 lg:px-24 lg:pt-36 lg:pb-32">
      {/* Background decoration */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* Large gradient blob top-right */}
        <div className="absolute -top-24 -right-24 size-[480px] rounded-full bg-accent/15 blur-3xl" />
        {/* Green blob bottom-left */}
        <div className="absolute -bottom-32 -left-32 size-[420px] rounded-full bg-primary/10 blur-3xl" />
        {/* Small golden accent */}
        <div className="absolute top-1/2 left-1/2 size-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-warning/8 blur-2xl" />
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />
      </div>

      <div className="mx-auto max-w-4xl text-center">
        {/* Floating badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent-foreground dark:text-accent">
          <SparklesIcon className="size-4 animate-pulse text-accent" />
          <span className="text-accent">AI-Powered Invoicing</span>
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-7xl">
          <span className="block">Draft invoices with</span>
          <span className="mt-2 block bg-gradient-to-r from-primary via-accent to-success bg-clip-text text-transparent">
            a single message.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty sm:text-xl">
          Tell the AI what to bill, review the draft, and issue GST-compliant invoices — all from a chat
          interface built for Indian freelancers.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className={buttonVariants({
              size: 'lg',
              className:
                'h-12 rounded-full bg-accent px-8 text-base font-semibold text-accent-foreground shadow-lg shadow-accent/25 transition-all hover:bg-accent/90 hover:shadow-xl hover:shadow-accent/30 hover:-translate-y-0.5',
            })}
          >
            Get started free
            <ArrowRightIcon className="ml-1 size-4" />
          </Link>
        </div>

        {/* Demo preview card */}
        <div className="relative mx-auto mt-16 max-w-2xl">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary/50 via-accent/50 to-success/50 opacity-20 blur-lg" />
          <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-2xl ring-1 ring-border/50">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <MessageSquareIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="rounded-xl bg-muted px-4 py-3 text-left text-sm">
                  <span className="font-medium text-foreground">
                    &quot;Invoice AdTech Corp ₹50,000 for website redesign, due the 15th&quot;
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <BotIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="rounded-xl bg-secondary px-4 py-3 text-left text-sm text-secondary-foreground">
                  <p className="font-medium">Got it! Here&apos;s your invoice draft:</p>
                  <div className="mt-2 space-y-1 text-xs opacity-80">
                    <p>📄 Invoice #INV-2024-042</p>
                    <p>🏢 AdTech Corp</p>
                    <p>💰 ₹50,000 + 18% GST = ₹59,000</p>
                    <p>📅 Due: 15th Nov 2024</p>
                  </div>
                  <p className="mt-2 text-xs font-medium text-accent">Shall I issue this invoice?</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────── Features ────────────────────────── */
const features = [
  {
    icon: MessageSquareIcon,
    title: 'Chat-first invoicing',
    description: 'Describe what to bill in natural language. The AI drafts a complete GST-compliant invoice.',
    color: 'bg-accent text-accent-foreground',
  },
  {
    icon: ShieldCheckIcon,
    title: 'You stay in control',
    description:
      'Every invoice is a draft until you approve it. Review, edit, or reject before anything is sent.',
    color: 'bg-primary text-primary-foreground',
  },
  {
    icon: IndianRupeeIcon,
    title: 'Built for India',
    description:
      'GST-ready invoices with CGST, SGST, IGST calculations. SAC/HSN codes included automatically.',
    color: 'bg-success text-success-foreground',
  },
  {
    icon: ZapIcon,
    title: 'Lightning fast',
    description: 'Create invoices in under 10 seconds. No forms, no templates, no friction.',
    color: 'bg-warning text-warning-foreground',
  },
  {
    icon: UsersIcon,
    title: 'Client management',
    description: 'Keep all your clients organized. The AI remembers billing details for recurring invoices.',
    color: 'bg-secondary text-secondary-foreground',
  },
  {
    icon: GlobeIcon,
    title: 'International payments',
    description: 'Handle cross-border invoicing with multi-currency support and proper documentation.',
    color: 'bg-accent text-accent-foreground',
  },
]

function FeaturesSection() {
  return (
    <section className="px-6 py-24 sm:px-12 lg:px-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need.{' '}
            <span className="bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
              Nothing you don&apos;t.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Built for freelancers, consultants, and agencies who want to spend less time on admin.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative overflow-hidden rounded-2xl border bg-card p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            >
              <div
                className={`mb-4 inline-flex size-10 items-center justify-center rounded-xl ${feature.color} shadow-sm transition-transform duration-300 group-hover:scale-110`}
              >
                <feature.icon className="size-5" />
              </div>
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ──────────────────── How it works ──────────────────── */
const steps = [
  {
    step: '01',
    title: 'Describe your invoice',
    description: 'Type a natural language message like "Invoice Acme ₹1L for consulting, due next Friday".',
    accent: 'bg-secondary text-secondary-foreground',
    ring: 'ring-primary/20',
  },
  {
    step: '02',
    title: 'Review the draft',
    description:
      'The AI generates a complete invoice with GST, line items, and client details. Edit if needed.',
    accent: 'bg-primary text-primary-foreground',
    ring: 'ring-accent/20',
  },
  {
    step: '03',
    title: 'Issue & track',
    description:
      'Approve to issue. Track payment status, send reminders, and manage everything from one dashboard.',
    accent: 'bg-accent text-accent-foreground',
    ring: 'ring-success/20',
  },
]

function HowItWorksSection() {
  return (
    <section className="bg-muted/40 px-6 py-24 sm:px-12 lg:px-24">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps.{' '}
            <span className="bg-gradient-to-r from-accent to-warning bg-clip-text text-transparent">
              Zero hassle.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            From thought to issued invoice in under a minute.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {steps.map((item) => (
            <div
              key={item.step}
              className={`relative overflow-hidden rounded-2xl border bg-card p-8 ring-2 ${item.ring} transition-all duration-300 hover:shadow-lg`}
            >
              <span
                className={`inline-flex size-10 items-center justify-center rounded-full ${item.accent} text-sm font-bold shadow-sm`}
              >
                {item.step}
              </span>
              <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ──────────────────── Stats strip ──────────────────── */
function StatsStrip() {
  return (
    <section className="border-y bg-gradient-to-r from-primary to-primary/90 px-6 py-12 sm:px-12">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-12 text-center text-primary-foreground sm:gap-16">
        <div>
          <div className="text-4xl font-extrabold">10s</div>
          <div className="mt-1 text-sm opacity-80">Average invoice time</div>
        </div>
        <div className="hidden h-12 w-px bg-primary-foreground/20 sm:block" />
        <div>
          <div className="text-4xl font-extrabold">100%</div>
          <div className="mt-1 text-sm opacity-80">GST compliant</div>
        </div>
        <div className="hidden h-12 w-px bg-primary-foreground/20 sm:block" />
        <div>
          <div className="text-4xl font-extrabold">₹0</div>
          <div className="mt-1 text-sm opacity-80">To get started</div>
        </div>
        <div className="hidden h-12 w-px bg-primary-foreground/20 sm:block" />
        <div>
          <div className="text-4xl font-extrabold">AI</div>
          <div className="mt-1 text-sm opacity-80">Powered by intelligence</div>
        </div>
      </div>
    </section>
  )
}

/* ──────────────────── CTA ──────────────────── */
function CTASection() {
  return (
    <section className="px-6 py-24 sm:px-12 lg:px-24">
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-accent p-12 text-center text-primary-foreground shadow-2xl sm:p-16">
        {/* Decorative circles */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-accent/20 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -left-16 size-48 rounded-full bg-success/20 blur-2xl"
        />

        <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to stop wrestling with invoices?
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-lg opacity-85">
          Join freelancers and agencies who draft, issue, and track invoices in seconds — not hours.
        </p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className={buttonVariants({
              size: 'lg',
              className:
                'h-12 rounded-full bg-white px-8 text-base font-semibold text-primary shadow-lg transition-all hover:bg-white/90 hover:-translate-y-0.5',
            })}
          >
            Start for free
            <ArrowRightIcon className="ml-1 size-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ──────────────────── Footer ──────────────────── */
function Footer() {
  return (
    <footer className="border-t px-6 py-8 sm:px-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm">
            <FileTextIcon className="size-4" />
          </div>
          <span className="text-lg font-bold">Invoice Agent</span>
        </div>
        <p className="text-sm text-muted-foreground">Demo only. Not tax, legal or accounting advice.</p>
      </div>
    </footer>
  )
}

/* ──────────────────── Main export ──────────────────── */
export function LandingPage() {
  return (
    <>
      <HeroSection />
      <StatsStrip />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
      <Footer />
    </>
  )
}
