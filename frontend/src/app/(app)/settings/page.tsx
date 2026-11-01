'use client'

import { SettingsView } from '@/components/settings/SettingsView'
import { useProfileQuery } from '@/lib/api/queries'

/**
 * Settings page — fetches the real user profile from GET /me and populates
 * SettingsView with the actual stateCode and businessName from the database.
 *
 * A loading skeleton is shown while the query is in flight so the form never
 * flashes with empty or hardcoded values.
 */
export default function SettingsPage() {
  const { data: profile, isLoading } = useProfileQuery()

  return (
    <SettingsView
      initialBusinessName={profile?.businessName ?? ''}
      initialStateCode={profile?.stateCode ?? ''}
      isLoading={isLoading}
    />
  )
}
