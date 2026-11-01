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
   * When true, a 404 Not Found shows a plain "No data available" empty state instead of a
   * destructive alert. Every other failure (network, 4xx, 5xx, unexpected) always shows its
   * real message, with Retry where retrying can help, so a server fault is never disguised
   * as an empty section.
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

  // Only "not found" means there is legitimately nothing to show.
  if (noDataFallback && apiErr?.kind === 'not_found') {
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

  // Everything else: show the real error.
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