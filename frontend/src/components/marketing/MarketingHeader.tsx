'use client'

import { ExternalLinkIcon, MenuIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { buttonVariants } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { AuditrLogo } from '@/components/common/AuditrLogo'
import { siteConfig } from '@/config/site'

export function MarketingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header
      className={[
        'sticky top-0 z-40 w-full',
        // Softened edges — small horizontal margin + rounded bottom corners on desktop
        'md:mx-3 md:w-[calc(100%-1.5rem)] md:rounded-b-2xl',
        // Liquid glass — always visible, not just when scrolled
        'bg-white/50 dark:bg-black/45',
        'backdrop-blur-2xl backdrop-saturate-200',
        // Borders: bottom + sides (on desktop rounded) with highlight shimmer on top
        'border border-white/55 dark:border-white/[0.09]',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.70),0_2px_16px_0_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_2px_16px_0_rgba(0,0,0,0.40)]',
        'transition-all duration-200',
      ].join(' ')}
    >
      <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo / Wordmark */}
        <Link
          href="/"
          className="flex items-center gap-3 font-bold tracking-tight text-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
          aria-label={`${siteConfig.name} - Home`}
        >
          {/* Subtle wordmark icon */}
          <AuditrLogo className="size-9" />
          <span className="text-xl font-semibold">{siteConfig.name}</span>
          <span className="rounded-md bg-highlight px-2 py-0.5 text-xs font-semibold tracking-wider text-highlight-foreground uppercase">
            Demo
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main Navigation">
          <a
            href="#how-it-works"
            className="text-base font-medium text-muted-foreground dark:text-foreground/75 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
          >
            How it works
          </a>
          <a
            href="#features"
            className="text-base font-medium text-muted-foreground dark:text-foreground/75 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
          >
            Features
          </a>
          <a
            href="#faq"
            className="text-base font-medium text-muted-foreground dark:text-foreground/75 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
          >
            FAQ
          </a>
          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-base font-medium text-muted-foreground dark:text-foreground/75 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
          >
            <span>GitHub</span>
            <ExternalLinkIcon className="size-3 opacity-70" aria-hidden="true" />
          </a>
        </nav>

        {/* Right Actions: Theme Toggle & Primary Button */}
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle variant="icon" className="size-10 [&_svg]:size-5" />
          <Link
            href={siteConfig.links.demo}
            className={buttonVariants({
              size: 'sm',
              className:
                'h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            })}
          >
            Try the demo
          </Link>
        </div>

        {/* Mobile Menu & Theme Toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle variant="icon" className="size-11 [&_svg]:size-5" />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <XIcon className="size-5" aria-hidden="true" />
            ) : (
              <MenuIcon className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu — rendered as a modal-equivalent; background is inert while open */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="border-b border-border bg-background px-4 py-4 md:hidden"
        >
          <nav className="flex flex-col space-y-3" aria-label="Mobile Navigation">
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-foreground hover:text-primary transition-colors py-1"
            >
              How it works
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-foreground hover:text-primary transition-colors py-1"
            >
              Features
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-foreground hover:text-primary transition-colors py-1"
            >
              FAQ
            </a>
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex items-center gap-1.5 text-base font-medium text-foreground hover:text-primary transition-colors py-1"
            >
              <span>GitHub</span>
              <ExternalLinkIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </a>
            <div className="pt-2 border-t border-border">
              <Link
                href={siteConfig.links.demo}
                onClick={() => setMobileMenuOpen(false)}
                className={buttonVariants({
                  className:
                    'h-11 w-full justify-center bg-primary text-primary-foreground text-sm font-semibold',
                })}
              >
                Try the demo
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}