import {
  BarChart3Icon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  ReceiptIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

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
  { title: 'Reports', href: '/reports', icon: BarChart3Icon },
  { title: 'Settings', href: '/settings', icon: SettingsIcon },
]

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
