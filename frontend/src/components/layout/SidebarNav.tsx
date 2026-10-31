'use client'

import { SquarePenIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { isActivePath, navItems } from '@/components/layout/nav-items'
import { cn } from '@/lib/utils'

/** Material "standard" easing, the same curve Gmail uses for its rail. */
const MOTION = 'ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none'
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'

interface SidebarNavProps {
  /** Show labels. When false the nav is the 72px icon rail. */
  wide: boolean
  /** Called when a link is followed, so a mobile drawer can close itself. */
  onNavigate?: () => void
}

/**
 * Gmail-style navigation: a pill "compose" button, then full-height rows that are flat on
 * the left and fully rounded on the right. Icons stay at a fixed x position in both states,
 * so collapsing only clips labels and reshapes the active pill instead of moving anything.
 */
export function SidebarNav({ wide, onNavigate }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="flex w-64 flex-col py-2">
      <Link
        href="/invoices/new"
        onClick={onNavigate}
        className={cn(
          'mt-1 mb-4 ml-2 flex h-14 items-center overflow-hidden rounded-2xl bg-secondary whitespace-nowrap text-secondary-foreground shadow-sm transition-[width,box-shadow] duration-200 hover:shadow-md',
          MOTION,
          FOCUS,
          // Show full button when wide prop is true OR parent group is hovered
          wide ? 'w-40' : 'w-14 group-hover:w-40',
        )}
      >
        <span className="flex size-14 shrink-0 items-center justify-center">
          <SquarePenIcon className="size-6" aria-hidden="true" />
        </span>
        <span
          className={cn(
            'pr-5 text-sm font-medium transition-opacity duration-150',
            // Show label when wide OR when parent aside is hovered
            wide ? 'opacity-100 delay-75' : 'opacity-0 group-hover:opacity-100 group-hover:delay-75',
          )}
        >
          New invoice
        </span>
      </Link>

      <ul className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center overflow-hidden text-sm whitespace-nowrap transition-[margin,width,padding,border-radius,background-color] duration-200',
                  MOTION,
                  FOCUS,
                  // Width and margin respond to wide prop OR parent group hover
                  wide
                    ? 'ml-0 w-[calc(100%-0.5rem)] rounded-r-full pl-[26px]'
                    : 'ml-[18px] w-9 rounded-full pl-2 group-hover:ml-0 group-hover:w-[calc(100%-0.5rem)] group-hover:rounded-r-full group-hover:pl-[26px]',
                  active
                    ? 'bg-primary/10 font-bold text-primary dark:bg-primary/15'
                    : 'text-foreground hover:bg-foreground/[0.07]',
                )}
              >
                <item.icon className="size-5 shrink-0" aria-hidden="true" />
                <span
                  className={cn(
                    'ml-[18px] transition-opacity duration-150',
                    // Show label when wide OR when parent aside is hovered
                    wide ? 'opacity-100 delay-75' : 'opacity-0 group-hover:opacity-100 group-hover:delay-75',
                  )}
                >
                  {item.title}
                </span>
                {active ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mr-4 ml-auto size-2 shrink-0 rounded-full bg-highlight transition-opacity duration-150',
                      // Show dot when wide OR when parent aside is hovered
                      wide ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                  />
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
