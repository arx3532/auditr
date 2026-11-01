import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { AppShell } from '@/components/layout/AppShell'

vi.mock('next/navigation', () => ({ usePathname: () => '/invoices/inv-1' }))
vi.mock('@clerk/nextjs', () => ({ UserButton: () => <div data-testid="user-button" /> }))

beforeAll(() => {
  // jsdom has no matchMedia; a desktop-width window is what these tests assume.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
  })
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 })
})

function renderShell(defaultOpen = true) {
  return render(
    <AppShell defaultOpen={defaultOpen}>
      <p>page body</p>
    </AppShell>,
  )
}

function rail(container: HTMLElement) {
  const el = container.querySelector('#primary-navigation')
  if (!el) throw new Error('rail not found')
  return el
}

afterEach(() => {
  document.cookie = 'sidebar_state=; path=/; max-age=0'
})

describe('AppShell', () => {
  it('renders the page and the persistent disclaimer', () => {
    renderShell()
    expect(screen.getByText('page body')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Demo only.')
  })

  it('marks the current section, including nested routes', () => {
    renderShell()
    // AppShell renders two <SidebarNav> trees (desktop rail + mobile drawer).
    // Scope to the desktop aside so we match exactly one link per nav item.
    const desktopAside = document.querySelector('#primary-navigation')
    if (!desktopAside) throw new Error('desktop nav not found')
    const links = Array.from(desktopAside.querySelectorAll('a[href]'))
    const invoicesLink = links.find((a) => a.textContent?.includes('Invoices'))
    const chatLink = links.find((a) => a.textContent?.includes('Chat'))
    expect(invoicesLink).toHaveAttribute('aria-current', 'page')
    expect(chatLink).not.toHaveAttribute('aria-current')
  })

  it('collapses to a rail with the hamburger and remembers the choice', async () => {
    const { container } = renderShell(true)
    const menu = screen.getByRole('button', { name: 'Main menu' })
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(rail(container)).toHaveAttribute('data-state', 'expanded')

    await userEvent.click(menu)

    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(rail(container)).toHaveAttribute('data-state', 'collapsed')
    expect(document.cookie).toContain('sidebar_state=false')
  })

  it('floats open while a collapsed rail is hovered — CSS-driven, data-state unchanged', () => {
    // The visual hover-expansion is implemented entirely with Tailwind's `hover:` and
    // `group-hover:` utilities (no JS state change). jsdom does not apply CSS, so
    // data-state will remain 'collapsed' on mouseEnter. We verify:
    //   1. data-state starts collapsed and does NOT change on mouseEnter (correct behaviour).
    //   2. The aside carries the Tailwind class that drives the CSS expansion.
    //   3. The hamburger click — which IS JS-driven — does correctly flip data-state.
    const { container } = renderShell(false)
    const el = rail(container)

    expect(el).toHaveAttribute('data-state', 'collapsed')

    fireEvent.mouseEnter(el)
    // data-state must NOT change — expansion is purely CSS, not JS state.
    expect(el).toHaveAttribute('data-state', 'collapsed')
    // The class driving the CSS hover expansion must be present.
    expect(el.className).toMatch(/hover:w-64/)

    fireEvent.mouseLeave(el)
    expect(el).toHaveAttribute('data-state', 'collapsed')

    // Confirm the hamburger (JS-driven) still correctly flips to expanded.
    fireEvent.click(screen.getByRole('button', { name: 'Main menu' }))
    expect(el).toHaveAttribute('data-state', 'expanded')
    // The hamburger must also report the new state.
    expect(screen.getByRole('button', { name: 'Main menu' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles with Ctrl+B', () => {
    const { container } = renderShell(true)
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(rail(container)).toHaveAttribute('data-state', 'collapsed')
  })
})
