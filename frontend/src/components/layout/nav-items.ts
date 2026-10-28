import { LayoutDashboardIcon, MessageSquareIcon, ReceiptIcon, UsersIcon, type LucideIcon } from 'lucide-react'

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

export const navItems: readonly NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboardIcon },
  { title: 'Chat', href: '/chat', icon: MessageSquareIcon },
  { title: 'Invoices', href: '/invoices', icon: ReceiptIcon },
  { title: 'Customers', href: '/customers', icon: UsersIcon },
]

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
