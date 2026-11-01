import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ReportsView } from '@/components/reports/ReportsView'
import { SettingsView } from '@/components/settings/SettingsView'
import { downloadCsvBlob } from '@/lib/api/queries'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => 'test-token' }),
}))

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ReportsView and subviews', () => {
  it('renders reports tabs and exports buttons', async () => {
    renderWithQuery(<ReportsView />)
    expect(await screen.findByText('Financial Reports')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export invoices csv/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export payments csv/i })).toBeInTheDocument()

    // Default tab is GST Summary
    expect(await screen.findByText('Monthly Breakdown')).toBeInTheDocument()
    expect(screen.getByText('Supply Type Breakdown')).toBeInTheDocument()
  })

  it('switches between report tabs smoothly', async () => {
    renderWithQuery(<ReportsView />)

    // Switch to HSN tab
    fireEvent.click(screen.getByRole('button', { name: /hsn \/ sac codes/i }))
    expect(await screen.findByText('HSN / SAC Code Summary')).toBeInTheDocument()
    expect(await screen.findByText('998311')).toBeInTheDocument()

    // Switch to TDS tab
    fireEvent.click(screen.getByRole('button', { name: /tds withholding/i }))
    expect(await screen.findByText('Customer Withholding Summary')).toBeInTheDocument()
    expect(await screen.findByText('AdTech Solutions Pvt Ltd')).toBeInTheDocument()

    // Switch to Aging tab
    fireEvent.click(screen.getByRole('button', { name: /receivables aging/i }))
    expect(await screen.findByText('Total Outstanding Receivables')).toBeInTheDocument()
    expect(screen.getByText('0 - 30 Days')).toBeInTheDocument()
  })
})

describe('downloadCsvBlob utility', () => {
  it('creates an object URL, clicks invisible anchor, and revokes URL', () => {
    const createObjectUrlMock = vi.fn().mockReturnValue('blob:http://localhost/test-uuid')
    const revokeObjectUrlMock = vi.fn()
    window.URL.createObjectURL = createObjectUrlMock
    window.URL.revokeObjectURL = revokeObjectUrlMock

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const sampleBlob = new Blob(['col1,col2\nval1,val2'], { type: 'text/csv' })
    downloadCsvBlob(sampleBlob, 'test_export.csv')

    expect(createObjectUrlMock).toHaveBeenCalledWith(sampleBlob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:http://localhost/test-uuid')

    clickSpy.mockRestore()
  })
})

describe('SettingsView', () => {
  it('renders business settings form', () => {
    renderWithQuery(<SettingsView initialBusinessName="My Tech Corp" initialStateCode="29" />)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByLabelText(/business \/ trade name/i)).toHaveValue('My Tech Corp')
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })
})

