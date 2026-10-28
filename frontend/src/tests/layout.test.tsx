import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SiteDisclaimer } from '@/components/layout/SiteDisclaimer'
import { isActivePath, navItems } from '@/components/layout/nav-items'

describe('SiteDisclaimer', () => {
  it('shows the persistent demo disclaimer', () => {
    render(<SiteDisclaimer />)
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Demo only. Not tax, legal or accounting advice.',
    )
  })
})

describe('isActivePath', () => {
  it('matches the dashboard on its own path only', () => {
    expect(isActivePath('/dashboard', '/dashboard')).toBe(true)
    expect(isActivePath('/invoices', '/dashboard')).toBe(false)
  })

  it('matches nested routes under a section', () => {
    expect(isActivePath('/invoices/abc', '/invoices')).toBe(true)
    expect(isActivePath('/invoices-old', '/invoices')).toBe(false)
  })

  it('exposes every primary section', () => {
    expect(navItems.map((item) => item.href)).toEqual(['/dashboard', '/chat', '/invoices', '/customers'])
  })
})
