import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ErrorState } from '@/components/common/ErrorState'
import { ApiError, type ApiErrorKind } from '@/lib/api/client'

function apiError(kind: ApiErrorKind, status: number, message: string): ApiError {
  return new ApiError({ kind, code: `http_${status}`, message, status })
}

describe('ErrorState with noDataFallback', () => {
  it('shows the empty state only for a 404', () => {
    render(
      <ErrorState
        title="Could not load things"
        error={apiError('not_found', 404, 'Nothing here')}
        noDataFallback
      />,
    )
    expect(screen.getByText('No data available')).toBeInTheDocument()
    expect(screen.queryByText('Could not load things')).not.toBeInTheDocument()
  })

  it('shows the real message and Retry for a 500', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(
      <ErrorState
        title="Could not load things"
        error={apiError('server', 500, 'Database exploded')}
        onRetry={onRetry}
        noDataFallback
      />,
    )
    expect(screen.queryByText('No data available')).not.toBeInTheDocument()
    expect(screen.getByText('Could not load things')).toBeInTheDocument()
    expect(screen.getByText('Database exploded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the real message for a network failure', () => {
    render(
      <ErrorState
        error={apiError('network', 0, 'Could not reach the server.')}
        onRetry={vi.fn()}
        noDataFallback
      />,
    )
    expect(screen.getByText('Could not reach the server.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it.each([
    ['client', 422, 'Unprocessable'],
    ['unauthorized', 401, 'Please sign in'],
  ] as const)('shows the %s error instead of hiding it', (kind, status, message) => {
    render(<ErrorState error={apiError(kind, status, message)} onRetry={vi.fn()} noDataFallback />)
    expect(screen.queryByText('No data available')).not.toBeInTheDocument()
    expect(screen.getByText(message)).toBeInTheDocument()
  })

  it('shows a generic alert, not an empty state, for an unexpected non-API error', () => {
    render(<ErrorState error={new Error('boom')} noDataFallback />)
    expect(screen.queryByText('No data available')).not.toBeInTheDocument()
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()
  })
})