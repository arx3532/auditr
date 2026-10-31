'use client'

import { UserButton } from '@clerk/nextjs'
import { MenuIcon } from 'lucide-react'
import Link from 'next/link'

import { AuditrLogo } from '@/components/common/AuditrLogo'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface AppHeaderProps {
  onMenuClick: () => void
  /** Whether the navigation is currently expanded (desktop) or open (phone menu). */
  menuExpanded: boolean
  /** The id of the navigation the menu button controls. */
  menuControls: string
}

export function AppHeader({ onMenuClick, menuExpanded, menuControls }: AppHeaderProps) {
  return (
    <header
      className={[
        // Structure — matches marketing header height exactly (h-[4.25rem] = 68px)
        'relative z-40 flex h-[4.25rem] shrink-0 items-center gap-2 px-2 md:gap-3 md:px-4',
        // Softened edges on desktop
        'md:mx-3 md:rounded-b-2xl',
        // Dark: use background token so it always matches chat pane
        'bg-white/50 dark:bg-background',
        'backdrop-blur-2xl backdrop-saturate-200 dark:backdrop-blur-none dark:backdrop-saturate-100',
        // Border with highlight shimmer
        'border border-white/55 dark:border-white/[0.06]',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.70),0_2px_16px_0_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
        // Text
        'text-foreground dark:text-white',
        'transition-all duration-200',
      ].join(' ')}
    >

      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Main menu"
        aria-expanded={menuExpanded}
        aria-controls={menuControls}
        className="flex size-11 items-center justify-center rounded-full text-foreground dark:text-white transition-colors outline-none hover:bg-foreground/[0.08] dark:hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MenuIcon className="size-6" aria-hidden="true" />
      </button>
      <Link
        href="/dashboard"
        className="ml-1 flex items-center gap-2.5 rounded-xl px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AuditrLogo className="size-9 md:size-10" />
        <span className="text-xl font-semibold tracking-tight text-foreground dark:text-white">Auditr</span>
        <span className="hidden rounded-md bg-highlight px-2 py-0.5 text-xs font-semibold tracking-wider text-highlight-foreground uppercase sm:inline">
          Demo
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <ThemeToggle
          variant="icon"
          className="size-10 [&_svg]:size-5 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 dark:hover:border-white/30"
        />
        <UserButton appearance={{ elements: { avatarBox: { width: '2.25rem', height: '2.25rem' } } }} />
      </div>
    </header>
  )
}