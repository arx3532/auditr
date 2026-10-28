import { cookies } from 'next/headers'

import { AppShell, SIDEBAR_COOKIE } from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies()
  const defaultOpen = store.get(SIDEBAR_COOKIE)?.value !== 'false'

  return <AppShell defaultOpen={defaultOpen}>{children}</AppShell>
}
