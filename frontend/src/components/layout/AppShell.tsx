'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { AppHeader } from '@/components/layout/AppHeader'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { SiteDisclaimer } from '@/components/layout/SiteDisclaimer'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

export const SIDEBAR_COOKIE = 'sidebar_state'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const EASE = 'duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none'

interface AppShellProps {
  /** Initial desktop state, read from the cookie on the server so there is no flash. */
  defaultOpen: boolean
  children: React.ReactNode
}

/**
 * Application chrome. The screen is exactly one viewport tall: the top bar never moves, and only the
 * content card scrolls. On desktop the sidebar collapses to icons and always pushes the page aside,
 * so it never covers anything. On a phone the menu slides in from the left and pushes the page along.
 */
export function AppShell({ defaultOpen, children }: AppShellProps) {
  const isMobile = useIsMobile()
  // The chat page does not scroll as a document: it fills the card and scrolls inside itself.
  const fill = usePathname().startsWith('/chat')
  const [open, setOpen] = useState(defaultOpen)
  const [menuRequested, setMenuRequested] = useState(false)
  // The phone menu only exists on a phone, so widening the window closes it without any effect.
  const drawerOpen = isMobile && menuRequested

  const toggle = useCallback(() => {
    if (isMobile) {
      setMenuRequested((value) => !value)
      return
    }
    const next = !open
    setOpen(next)
    document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  }, [isMobile, open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuRequested(false)
      if (event.key.toLowerCase() === 'b' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  return (
    <div className="flex h-dvh flex-col bg-muted md:pt-1.5">

      <AppHeader
        onMenuClick={toggle}
        menuExpanded={isMobile ? drawerOpen : open}
        menuControls={isMobile ? 'mobile-navigation' : 'primary-navigation'}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop sidebar: icon rail that expands on hover when collapsed, Gmail-style */}
        <aside
          id="primary-navigation"
          data-state={open ? 'expanded' : 'collapsed'}
          className={cn(
            'group hidden shrink-0 overflow-y-auto transition-[width] md:block md:pt-3',
            'overflow-x-hidden',
            EASE,
            open ? 'w-64' : 'w-[72px]',
            !open && 'hover:w-64',
          )}
        >
          <SidebarNav wide={open} />
        </aside>

        {/* Phone: waits off-screen behind the page, and is not focusable until it is open. */}
        <div
          id="mobile-navigation"
          inert={!drawerOpen}
          className="absolute inset-y-0 left-0 w-72 overflow-y-auto md:hidden"
        >
          <SidebarNav wide onNavigate={() => setMenuRequested(false)} />
        </div>

        <div
          className={cn(
            'relative z-10 min-h-0 min-w-0 flex-1 transition-transform md:translate-x-0 md:pt-5 md:pr-4 md:pb-4',
            EASE,
            drawerOpen && 'translate-x-72 shadow-[-12px_0_28px_rgb(0_0_0/0.18)]',
          )}
        >
          {drawerOpen ? (
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuRequested(false)}
              className="absolute inset-0 z-20 cursor-default md:hidden"
            />
          ) : null}

          <div className="flex h-full flex-col overflow-hidden bg-background md:rounded-2xl dark:md:border dark:md:border-white/[0.06]">
            <div className={cn('flex min-h-0 flex-1 flex-col', !fill && 'overflow-y-auto')}>
              <main
                className={cn(
                  'flex flex-1 flex-col p-4 md:p-6',
                  fill ? 'min-h-0 gap-3 p-3 md:gap-4 md:p-5' : 'gap-6',
                )}
              >
                {children}
              </main>
              <SiteDisclaimer />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}