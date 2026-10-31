import { MarketingFooter } from '@/components/marketing/MarketingFooter'
import { MarketingHeader } from '@/components/marketing/MarketingHeader'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col bg-background text-foreground transition-colors">
      {/* ── Background blobs ── placed at layout level so they sit behind the sticky
          header at all times — this is what gives the header its glass effect even
          at the very top of the page, not just when content scrolls beneath it. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* Main lime blob — centred, bleeds into top edge behind the header */}
        <div className="absolute -top-32 left-1/2 h-[42rem] w-[60rem] max-w-full -translate-x-1/2 rounded-full bg-[oklch(0.72_0.13_130)] opacity-35 blur-3xl dark:opacity-20" />
        {/* Secondary bloom left */}
        <div className="absolute -top-10 left-[5%] h-[26rem] w-[32rem] rounded-full bg-[oklch(0.68_0.14_128)] opacity-25 blur-3xl dark:opacity-15" />
        {/* Coral glow right */}
        <div className="absolute top-16 right-[4%] h-72 w-72 rounded-full bg-accent opacity-10 blur-3xl dark:opacity-10" />
        {/* Lime-gold lower left */}
        <div className="absolute top-52 left-[3%] h-64 w-64 rounded-full bg-highlight opacity-15 blur-3xl dark:opacity-10" />
      </div>

      {/* Accessible skip-to-content link for keyboard & screen reader users */}
      <a
        href="#main-content"
        className="sr-only fixed top-4 left-4 z-50 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-lg transition-transform focus:not-sr-only focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        Skip to main content
      </a>

      <MarketingHeader />
      <main id="main-content" className="flex-1 focus:outline-none" tabIndex={-1}>
        {children}
      </main>
      <MarketingFooter />
    </div>
  )
}
