import { ExternalLinkIcon } from 'lucide-react'

import { siteConfig } from '@/config/site'

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-muted/30 py-8 text-xs text-muted-foreground transition-colors">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        {/* Mandatory Disclaimer */}
        <p className="text-center sm:text-left">Demo only. Not tax, legal or accounting advice.</p>

        {/* Links and Context */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-center sm:text-right">
          <span className="opacity-80">Inspired by AI-first finance tools.</span>
          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xs"
          >
            <span>GitHub repository</span>
            <ExternalLinkIcon className="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  )
}
