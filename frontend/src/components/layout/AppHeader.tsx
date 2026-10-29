'use client'

import { UserButton } from '@clerk/nextjs'
import { MenuIcon } from 'lucide-react'
import Link from 'next/link'

import { AuditrLogo } from '@/components/common/AuditrLogo'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface AppHeaderProps {
  onMenuClick: () => void
  /** Whether the navigation is currently expanded (desktop) or open (mobile drawer). */
  menuExpanded: boolean
}

export function AppHeader({ onMenuClick, menuExpanded }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-1 bg-muted px-2 md:px-4">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Main menu"
        aria-expanded={menuExpanded}
        aria-controls="primary-navigation"
        className="flex size-12 items-center justify-center rounded-full text-foreground transition-colors outline-none hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MenuIcon className="size-6" aria-hidden="true" />
      </button>
      <Link
        href="/dashboard"
        className="ml-1 flex items-center gap-2 rounded-lg px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AuditrLogo className="size-8" />
        <span className="text-lg font-semibold tracking-tight">Auditr</span>
        <span className="hidden rounded-sm bg-highlight px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-highlight-foreground uppercase sm:inline">
          Demo
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle variant="icon" />
        <UserButton />
      </div>
    </header>
  )
}