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
          wide ? 'w-40' : 'w-14',
        )}
      >
        <span className="flex size-14 shrink-0 items-center justify-center">
          <SquarePenIcon className="size-6" aria-hidden="true" />
        </span>
        <span
          className={cn(
            'pr-5 text-sm font-medium transition-opacity duration-150',
            wide ? 'opacity-100 delay-75' : 'opacity-0',
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
                  wide
                    ? 'ml-0 w-[calc(100%-0.5rem)] rounded-r-full pl-[26px]'
                    : 'ml-[18px] w-9 rounded-full pl-2',
                  active
                    ? 'bg-secondary font-bold text-secondary-foreground'
                    : 'text-foreground hover:bg-foreground/[0.07]',
                )}
              >
                <item.icon className="size-5 shrink-0" aria-hidden="true" />
                <span
                  className={cn(
                    'ml-[18px] transition-opacity duration-150',
                    wide ? 'opacity-100 delay-75' : 'opacity-0',
                  )}
                >
                  {item.title}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
