import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { PublicInvoiceView } from '@/components/public/PublicInvoiceView'
import type { Invoice } from '@/lib/api/types'
import { REVOKED_PUBLIC_TOKEN } from '@/mocks/fixtures'
import { server } from '@/mocks/server'

const getToken = vi.fn(async () => 'should-never-be-used')

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken }),
}))

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function invoiceWith(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'inv_public',
    number: 'INV-0100',
    customer: { id: 'cust_1', name: 'Public Test Customer' },
    status: 'issued',
    items: [{ description: 'Brand identity design', taxableValue: '50000.00', gstRate: '18' }],
    tax: { cgst: '4500.00', sgst: '4500.00' },
    subtotal: '50000.00',
    total: '59000.00',
    amountDue: '59000.00',
    issueDate: '2026-10-01',
    dueDate: '2026-10-15',
    publicToken: 'tok_public',
    ...overrides,
  }
}

describe('PublicInvoiceView', () => {
  it('renders an invoice from the mock API with the amount, due date and UPI placeholder', async () => {
    renderWithQuery(<PublicInvoiceView token="pubtok-inv-0005" />)

    expect(await screen.findByRole('heading', { level: 1, name: /INV-0005/ })).toBeInTheDocument()
    expect(screen.getByText('Amount due')).toBeInTheDocument()
    expect(screen.getByText('Due date')).toBeInTheDocument()
    expect(screen.getByText('Pay with UPI')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open UPI app' })).toBeDisabled()
  })

  it('shows money exactly as the server sent it, with Indian grouping and no recalculation', async () => {
    server.use(
      http.get('http://api.test/public/invoices/tok_public', () =>
        HttpResponse.json(invoiceWith({ total: '125000.50', amountDue: '125000.50', subtotal: '106000.00' })),
      ),
    )
    renderWithQuery(<PublicInvoiceView token="tok_public" />)

    expect((await screen.findAllByText('₹1,25,000.50')).length).toBeGreaterThan(0)
    expect(screen.getByText('CGST')).toBeInTheDocument()
    expect(screen.getByText('SGST')).toBeInTheDocument()
  })

  it('does not show a GSTIN or internal ids for the customer', async () => {
    server.use(
      http.get('http://api.test/public/invoices/tok_public', () =>
        HttpResponse.json(
          invoiceWith({ customer: { id: 'cust_1', name: 'Public Test Customer', gstin: '29AAAAA0000A1Z5' } }),
        ),
      ),
    )
    renderWithQuery(<PublicInvoiceView token="tok_public" />)

    expect(await screen.findByText('Billed to Public Test Customer')).toBeInTheDocument()
    expect(screen.queryByText(/29AAAAA0000A1Z5/)).not.toBeInTheDocument()
    expect(screen.queryByText(/cust_1/)).not.toBeInTheDocument()
  })

  it('shows a paid notice and hides the UPI block for a paid invoice', async () => {
    server.use(
      http.get('http://api.test/public/invoices/tok_public', () =>
        HttpResponse.json(invoiceWith({ status: 'paid', amountDue: '0.00' })),
      ),
    )
    renderWithQuery(<PublicInvoiceView token="tok_public" />)

    expect(await screen.findByText('This invoice has been paid')).toBeInTheDocument()
    expect(screen.queryByText('Pay with UPI')).not.toBeInTheDocument()
  })

  it('warns against paying a cancelled invoice and hides the UPI block', async () => {
    server.use(
      http.get('http://api.test/public/invoices/tok_public', () =>
        HttpResponse.json(invoiceWith({ status: 'cancelled' })),
      ),
    )
    renderWithQuery(<PublicInvoiceView token="tok_public" />)

    expect(await screen.findByText('This invoice was cancelled')).toBeInTheDocument()
    expect(screen.queryByText('Pay with UPI')).not.toBeInTheDocument()
  })

  it('renders server text as plain text, never as HTML', async () => {
    server.use(
      http.get('http://api.test/public/invoices/tok_public', () =>
        HttpResponse.json(
          invoiceWith({
            items: [
              {
                description: '<img src=x onerror=alert(1)> Logo work',
                taxableValue: '1000.00',
                gstRate: '18',
              },
            ],
          }),
        ),
      ),
    )
    const { container } = renderWithQuery(<PublicInvoiceView token="tok_public" />)

    expect(await screen.findByText(/<img src=x onerror=alert\(1\)> Logo work/)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('explains an unknown link', async () => {
    renderWithQuery(<PublicInvoiceView token="no-such-token" />)
    expect(await screen.findByText('This invoice link is not valid')).toBeInTheDocument()
  })

  it('explains a revoked link differently from an unknown one', async () => {
    renderWithQuery(<PublicInvoiceView token={REVOKED_PUBLIC_TOKEN} />)
    expect(await screen.findByText('This invoice link was revoked')).toBeInTheDocument()
  })

  it('offers a retry after a network failure and recovers', async () => {
    let calls = 0
    server.use(
      http.get('http://api.test/public/invoices/tok_public', () => {
        calls += 1
        if (calls === 1) return HttpResponse.error()
        return HttpResponse.json(invoiceWith({}))
      }),
    )
    renderWithQuery(<PublicInvoiceView token="tok_public" />)

    expect(await screen.findByText('Could not load this invoice')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { level: 1, name: /INV-0100/ })).toBeInTheDocument()
  })

  it('never sends an Authorization header or asks Clerk for a token', async () => {
    let authorization: string | null = 'unset'
    server.use(
      http.get('http://api.test/public/invoices/tok_public', ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json(invoiceWith({}))
      }),
    )
    renderWithQuery(<PublicInvoiceView token="tok_public" />)

    await screen.findByRole('heading', { level: 1, name: /INV-0100/ })
    expect(authorization).toBeNull()
    expect(getToken).not.toHaveBeenCalled()
  })
})
