import { SiteDisclaimer } from '@/components/layout/SiteDisclaimer'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <main className="flex flex-1 items-center justify-center p-4">{children}</main>
      <SiteDisclaimer />
    </div>
  )
}
