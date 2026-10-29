import { ClerkProvider } from '@clerk/nextjs'
import { shadcn } from '@clerk/ui/themes'
import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Figtree, Geist_Mono } from 'next/font/google'

import { Providers } from '@/components/providers'

import './globals.css'

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  weight: ['400', '500', '600', '700', '800'],
})
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: {
    default: 'Auditr',
    template: '%s | Auditr',
  },
  description:
    'A demo AI assistant for Indian freelancers that drafts invoices and issues them only after you confirm.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF8F5' },
    { media: '(prefers-color-scheme: dark)', color: '#0F2820' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider
      appearance={{
        theme: shadcn,
        options: { unsafe_disableDevelopmentModeWarnings: true },
        // Hides the "Secured by Clerk" footer in the user menu popover and in Clerk's other cards.
        elements: {
          footer: { display: 'none' },
          userButtonPopoverFooter: { display: 'none' },
          footerItem: { display: 'none' },
        },
      }}

      localization={{
        signIn: {
          start: { title: 'Welcome to Auditr', subtitle: 'Log in or create an account to continue' },
        },
      }}
      signInUrl="/login"
      signUpUrl="/login"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html
        lang="en"
        className={`${figtree.variable} ${geistMono.variable} bg-background`}
        suppressHydrationWarning
      >
        <body className="font-sans antialiased">
          <Providers>{children}</Providers>
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </body>
      </html>
    </ClerkProvider>
  )
}
