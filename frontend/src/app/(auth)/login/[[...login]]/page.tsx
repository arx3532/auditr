import { SignIn } from '@clerk/nextjs'
import type { Metadata } from 'next'
import Link from 'next/link'

import { AuditrLogo } from '@/components/common/AuditrLogo'

export const metadata: Metadata = { title: 'Log in or sign up' }

export default function LoginPage() {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <Link
        href="/"
        aria-label="Auditr home"
        className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AuditrLogo className="size-12 drop-shadow-sm" />
      </Link>

      <SignIn
        appearance={{
          options: { elevation: 'flush', socialButtonsPlacement: 'top', socialButtonsVariant: 'blockButton' },
          elements: {
            rootBox: { width: '100%' },
            cardBox: { width: '100%', boxShadow: 'none' },
            card: { boxShadow: 'none', border: 'none', background: 'transparent' },
            socialButtonsBlockButton: { height: '3rem', borderRadius: '0.75rem' },
            formFieldInput: { height: '3rem', borderRadius: '0.75rem' },
            formButtonPrimary: {
              height: '3rem',
              borderRadius: '0.75rem',
              fontWeight: 600,
              textTransform: 'none',
            },
            // Hides "Don't have an account? Sign up", "Secured by Clerk" and the dev-mode label.
            footer: { display: 'none' },
          },
        }}
      />
    </div>
  )
}