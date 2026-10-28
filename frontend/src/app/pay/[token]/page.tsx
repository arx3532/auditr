import type { Metadata } from 'next'

import { PublicInvoiceView } from '@/components/public/PublicInvoiceView'
import { SiteDisclaimer } from '@/components/layout/SiteDisclaimer'

export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false },
  // The token is in the URL, so keep it out of any Referer header sent to other sites.
  referrer: 'no-referrer',
}

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  return (
    <div className="flex min-h-svh flex-col">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 md:p-6">
        <PublicInvoiceView token={token} />
      </main>
      <SiteDisclaimer />
    </div>
  )
}
