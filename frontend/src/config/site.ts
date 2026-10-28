/**
 * Central site configuration for marketing and portfolio presentation.
 * All URLs, copy identifiers, and navigation links are managed here.
 */

export const siteConfig = {
  // TODO: Set your project name (e.g. 'Invoice Agent', 'Kite Ledger')
  name: 'Auditr',
  tagline: 'Say it. Review it. Issue it.',
  description:
    'An AI finance agent demo that drafts invoices from a chat message. You review and confirm before anything is issued. Tax logic is computed by deterministic code, not the AI.',

  links: {
    // TODO: Replace with your deployed demo URL or app route
    demo: '/dashboard',
    // TODO: Replace with your GitHub repository URL
    github: 'https://github.com/arx3532/auditr',
  },

  nav: [
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Features', href: '#features' },
    { label: 'FAQ', href: '#faq' },
  ],
} as const

export type SiteConfig = typeof siteConfig
