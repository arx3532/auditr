import { ArrowRightIcon, ExternalLinkIcon, ShieldCheckIcon } from 'lucide-react'
import Link from 'next/link'

import { ProductVisual } from '@/components/marketing/ProductVisual'
import { buttonVariants } from '@/components/ui/button'
import { siteConfig } from '@/config/site'

// "Say it. Review it. Issue it." becomes three phrases so the middle one can be highlighted.
const sentences = siteConfig.tagline.split(/(?<=\.)\s+/)

export function HeroSection() {
  return (
    <section className="relative isolate px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:px-8">
      {/* Hero gradient — warm peach from bottom-left like the reference screenshot */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* Main peach/salmon glow — bottom-left origin, fades toward centre-right */}
        <div className="absolute -bottom-20 -left-20 h-[36rem] w-[36rem] rounded-full bg-[oklch(0.88_0.07_45)] opacity-55 blur-3xl dark:bg-sage dark:opacity-20" />
        {/* Lighter secondary bloom extending upward */}
        <div className="absolute top-0 left-[15%] h-[24rem] w-[28rem] rounded-full bg-[oklch(0.92_0.05_50)] opacity-45 blur-3xl dark:bg-sage dark:opacity-15" />
        {/* Faint accent dot top-right */}
        <div className="absolute top-1/4 right-[8%] h-48 w-48 rounded-full bg-primary opacity-[0.08] blur-3xl dark:opacity-[0.05]" />
      </div>

      <div className="mx-auto max-w-5xl text-center">
        {/* Status tag */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary px-3.5 py-1 text-xs font-medium text-secondary-foreground">
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <ShieldCheckIcon className="size-3.5 text-primary" aria-hidden="true" />
          <span>Deterministic tax calculation • Human-in-the-loop approval</span>
        </div>

        {/* Semantic single <h1>: "Say it." is white in light / foreground in dark, middle highlighted, last in orange */}
        <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          {sentences.length === 3 ? (
            <>
              {/* "Say it." — black in light mode, warm off-white in dark */}
              <span className="text-foreground dark:text-foreground">{sentences[0]}</span>{' '}
              {/* "Review it." — white text on lime background in light, dark foreground in dark */}
              <span className="rounded-md bg-highlight px-2 text-white dark:text-highlight-foreground box-decoration-clone">
                {sentences[1]}
              </span>{' '}
              <span className="text-primary">{sentences[2]}</span>
            </>
          ) : (
            siteConfig.tagline
          )}
        </h1>

        {/* One-sentence plain, specific subhead */}
        <p className="mx-auto mt-4 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
          A demo finance agent that drafts invoices from natural language messages, computes tax with
          deterministic code, and requires your explicit confirmation before issuing.
        </p>

        {/* Two Action Buttons */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={siteConfig.links.demo}
            className={buttonVariants({
              size: 'lg',
              className:
                'h-11 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            })}
          >
            <span>Try the demo</span>
            <ArrowRightIcon className="ml-1.5 size-4" aria-hidden="true" />
          </Link>

          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonVariants({
              variant: 'outline',
              size: 'lg',
              className:
                'h-11 rounded-md border-accent/40 bg-card/70 px-6 text-sm font-semibold text-foreground hover:border-accent hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            })}
          >
            <span>View on GitHub</span>
            <ExternalLinkIcon className="ml-1.5 size-4 text-accent" aria-hidden="true" />
          </a>
        </div>

        {/* Product Visual Preview */}
        <div className="mt-12 sm:mt-16">
          <ProductVisual />
        </div>
      </div>
    </section>
  )
}