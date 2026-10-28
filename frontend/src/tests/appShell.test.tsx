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
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Chat' })).not.toHaveAttribute('aria-current')
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

  it('floats open while a collapsed rail is hovered, then collapses again', () => {
    const { container } = renderShell(false)
    const el = rail(container)
    expect(el).toHaveAttribute('data-state', 'collapsed')

    fireEvent.mouseEnter(el)
    expect(el).toHaveAttribute('data-state', 'expanded')
    // The page layout does not move: the hamburger still reports the rail as collapsed.
    expect(screen.getByRole('button', { name: 'Main menu' })).toHaveAttribute('aria-expanded', 'false')

    fireEvent.mouseLeave(el)
    expect(el).toHaveAttribute('data-state', 'collapsed')
  })

  it('toggles with Ctrl+B', () => {
    const { container } = renderShell(true)
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(rail(container)).toHaveAttribute('data-state', 'collapsed')
  })
})
