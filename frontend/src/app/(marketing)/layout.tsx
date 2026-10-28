import { MarketingFooter } from '@/components/marketing/MarketingFooter'
import { MarketingHeader } from '@/components/marketing/MarketingHeader'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground transition-colors">
      {/* Accessible skip-to-content link for keyboard & screen reader users */}
      <a
        href="#main-content"
        className="sr-only fixed top-4 left-4 z-50 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-lg transition-transform focus:not-sr-only focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        Skip to main content
      </a>

      <MarketingHeader />
      <main id="main-content" className="flex-1 focus:outline-none">
        {children}
      </main>
      <MarketingFooter />
    </div>
  )
}
