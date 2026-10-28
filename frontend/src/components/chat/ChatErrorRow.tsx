import { RotateCcwIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { ChatError } from '@/lib/stream/chatState'

interface ChatErrorRowProps {
  error: ChatError
  onRetry: () => void
}

export function ChatErrorRow({ error, onRetry }: ChatErrorRowProps) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        {error.retryable ? (
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            <RotateCcwIcon data-icon="inline-start" />
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
