import type { Metadata } from 'next'

import { ReportsView } from '@/components/reports/ReportsView'

export const metadata: Metadata = {
  title: 'Reports · Auditr',
}

export default function ReportsPage() {
  return <ReportsView />
}

