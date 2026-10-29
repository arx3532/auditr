import { ArrowRightIcon, ExternalLinkIcon, ShieldCheckIcon } from 'lucide-react'
import Link from 'next/link'

import { ProductVisual } from '@/components/marketing/ProductVisual'
import { buttonVariants } from '@/components/ui/button'
import { siteConfig } from '@/config/site'

// "Say it. Review it. Issue it." becomes three phrases so the middle one can be highlighted.
const sentences = siteConfig.tagline.split(/(?<=\.)\s+/)

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:px-8">
      {/* Soft colour wash: sage glow in the middle, coral and gold at the edges */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-[28rem] w-[46rem] max-w-full -translate-x-1/2 rounded-full bg-secondary/80 blur-3xl" />
        <div className="absolute top-8 right-[6%] h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
        <div className="absolute top-44 left-[4%] h-56 w-56 rounded-full bg-highlight/25 blur-3xl" />
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

        {/* Semantic single <h1>: the middle sentence is highlighted in yellow, the last in orange */}
        <h1 className="text-3xl font-extrabold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
          {sentences.length === 3 ? (
            <>
              {sentences[0]}{' '}
              <span className="rounded-md bg-highlight px-2 text-highlight-foreground box-decoration-clone">
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