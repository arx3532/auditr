import type { Metadata } from 'next'

import { FAQSection } from '@/components/marketing/FAQSection'
import { FeaturesSection } from '@/components/marketing/FeaturesSection'
import { HeroSection } from '@/components/marketing/HeroSection'
import { HowItWorksSection } from '@/components/marketing/HowItWorksSection'
import { SafetySection } from '@/components/marketing/SafetySection'
import { siteConfig } from '@/config/site'

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: '/',
    siteName: siteConfig.name,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
}

export default function MarketingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <HeroSection />

      {/* How it works */}
      <HowItWorksSection />

      {/* Feature cards */}
      <FeaturesSection />

      {/* Safety and privacy */}
      <SafetySection />

      {/* FAQ */}
      <FAQSection />
    </div>
  )
}
