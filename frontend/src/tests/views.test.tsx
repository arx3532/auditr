import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { CustomersView } from '@/components/customers/CustomersView'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { InvoiceDetailView } from '@/components/invoices/InvoiceDetailView'
import { InvoicesView } from '@/components/invoices/InvoicesView'
import { server } from '@/mocks/server'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => 'test-token' }),
}))

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('InvoicesView', () => {
  it('lists invoices from the API', async () => {
    renderWithQuery(<InvoicesView />)
    const table = await screen.findByRole('table')
    expect(within(table).getByText('INV-0009')).toBeInTheDocument()
    expect(within(table).getByText('AdTech Solutions Pvt Ltd')).toBeInTheDocument()
  })

  it('applies the initial status filter', async () => {
    renderWithQuery(<InvoicesView initialStatus="cancelled" />)
    const table = await screen.findByRole('table')
    expect(within(table).getByText('INV-0006')).toBeInTheDocument()
    expect(within(table).queryByText('INV-0009')).not.toBeInTheDocument()
  })

  it('shows an error state with retry when the request fails', async () => {
    server.use(
      http.get('http://api.test/invoices', () =>
        HttpResponse.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    )
    renderWithQuery(<InvoicesView />)
    expect(await screen.findByText('Could not load invoices')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeInTheDocument()
  })

  it('shows an empty state when there are no invoices', async () => {
    server.use(http.get('http://api.test/invoices', () => HttpResponse.json({ items: [] })))
    renderWithQuery(<InvoicesView />)
    expect(await screen.findByText('No invoices yet')).toBeInTheDocument()
  })
})

describe('InvoiceDetailView', () => {
  it('renders the invoice with its number and customer', async () => {
    renderWithQuery(<InvoiceDetailView id="inv_0005" />)
    expect((await screen.findAllByText(/INV-0005/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/AdTech Solutions Pvt Ltd/).length).toBeGreaterThan(0)
  })

  it('renders record payment and share link actions on an issued invoice', async () => {
    renderWithQuery(<InvoiceDetailView id="inv_0005" />)
    expect((await screen.findAllByRole('button', { name: /record payment/i })).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /copy public link/i })).toBeInTheDocument()
  })

  it('renders draft review bar and draft actions on a draft invoice', async () => {
    renderWithQuery(<InvoiceDetailView id="inv_0010" />)
    expect(await screen.findByText('This invoice is a draft')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm & issue/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /edit draft/i }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /cancel draft/i })).toBeInTheDocument()
  })

  it('shows not found for an unknown invoice', async () => {
    renderWithQuery(<InvoiceDetailView id="inv_missing" />)
    expect(await screen.findByText('Invoice not found')).toBeInTheDocument()
  })
})

describe('CustomersView', () => {
  it('lists customers', async () => {
    renderWithQuery(<CustomersView />)
    expect(await screen.findByText('Bluepeak Studios LLP')).toBeInTheDocument()
    expect(screen.getByText('Chai & Co Cafes')).toBeInTheDocument()
  })
})

describe('DashboardView', () => {
  it('shows recent invoices and no error states', async () => {
    renderWithQuery(<DashboardView />)
    const table = await screen.findByRole('table')
    expect(within(table).getByText('INV-0009')).toBeInTheDocument()
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument()
  })
})
