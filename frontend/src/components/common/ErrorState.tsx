import { CircleAlertIcon } from 'lucide-react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { isApiError } from '@/lib/api/client'

import { EmptyState } from './EmptyState'

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  title?: string
  className?: string
  /**
   * When true, non-network errors show a plain "No data available" empty state
   * instead of a destructive alert. Network errors always show the alert so the
   * user knows to check their connection.
   */
  noDataFallback?: boolean
}

const FALLBACK_MESSAGE = 'An unexpected error occurred. Please try again.'

export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
  className,
  noDataFallback = false,
}: ErrorStateProps) {
  const apiErr = isApiError(error) ? error : null
  const isNetworkError = apiErr?.kind === 'network'

  // Non-network errors (4xx, 5xx, unexpected): show a neutral empty state.
  if (noDataFallback && !isNetworkError) {
    return (
      <EmptyState
        title="No data available"
        description="There is no data to display for this section right now."
      >
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </EmptyState>
    )
  }

  // Network errors (or noDataFallback=false): show the destructive alert.
  const message = apiErr ? apiErr.message : FALLBACK_MESSAGE
  const canRetry = onRetry !== undefined && (!apiErr || apiErr.retryable)

  return (
    <Alert variant="destructive" className={className}>
      <CircleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {canRetry ? (
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  )
}
