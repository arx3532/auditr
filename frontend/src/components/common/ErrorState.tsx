import { CircleAlertIcon } from 'lucide-react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { isApiError } from '@/lib/api/client'

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  title?: string
  className?: string
}

const FALLBACK_MESSAGE = 'An unexpected error occurred. Please try again.'

export function ErrorState({ error, onRetry, title = 'Something went wrong', className }: ErrorStateProps) {
  const message = isApiError(error) ? error.message : FALLBACK_MESSAGE
  const canRetry = onRetry !== undefined && (!isApiError(error) || error.retryable)

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
