'use client'

import { useCallback, useEffect, useState } from 'react'

import { AppHeader } from '@/components/layout/AppHeader'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { SiteDisclaimer } from '@/components/layout/SiteDisclaimer'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

export const SIDEBAR_COOKIE = 'sidebar_state'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const RAIL = 'transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none'

interface AppShellProps {
  /** Initial desktop state, read from the cookie on the server so there is no flash. */
  defaultOpen: boolean
  children: React.ReactNode
}

/**
 * Gmail-style application chrome: tinted frame, top bar with a hamburger, a rail that
 * collapses to icons and temporarily floats open on hover or keyboard focus, and the page
 * content in a rounded card. Below `md` the rail becomes a slide-in drawer.
 */
export function AppShell({ defaultOpen, children }: AppShellProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(defaultOpen)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggle = useCallback(() => {
    if (isMobile) {
      setMobileOpen((value) => !value)
      return
    }
    const next = !open
    setOpen(next)
    setHovered(false)
    document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  }, [isMobile, open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'b' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  const floating = !open && (hovered || focused)
  const wide = open || floating

  return (
    <div className="flex min-h-dvh flex-col bg-muted">
      <AppHeader onMenuClick={toggle} menuExpanded={isMobile ? mobileOpen : open} />

      <div className="flex flex-1">
        <div
          aria-hidden="true"
          className={cn('hidden shrink-0 md:block', RAIL, open ? 'w-64' : 'w-[72px]')}
        />

        <div
          id="primary-navigation"
          data-state={wide ? 'expanded' : 'collapsed'}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={(event) => setFocused(event.target.matches(':focus-visible'))}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
          }}
          className={cn(
            'fixed top-16 bottom-0 left-0 z-30 hidden overflow-hidden bg-muted transition-[width,box-shadow] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none md:block',
            wide ? 'w-64' : 'w-[72px]',
            floating &&
              'rounded-r-2xl shadow-[0_8px_10px_1px_rgb(0_0_0/0.14),0_3px_14px_2px_rgb(0_0_0/0.12)]',
          )}
        >
          <SidebarNav wide={wide} />
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="gap-0 bg-muted p-0 data-[side=left]:w-72 data-[side=left]:sm:max-w-72"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarNav wide onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1 md:pr-4 md:pb-4">
          <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-background md:min-h-[calc(100dvh-5rem)] md:rounded-2xl">
            <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
            <SiteDisclaimer />
          </div>
        </div>
      </div>
    </div>
  )
}
