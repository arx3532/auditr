import { QrCodeIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Placeholder only. The API contract has no UPI payee field, so there is nothing real to link or encode.
 * A real implementation needs the server to return a payee address or a ready-made UPI link.
 */
export function UpiPlaceholder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pay with UPI</CardTitle>
        <CardDescription>UPI payment is not available in this demo.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div
          role="img"
          aria-label="Placeholder where a UPI QR code would appear"
          className="flex size-32 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground"
        >
          <QrCodeIcon className="size-8" aria-hidden="true" />
          <span className="text-xs">QR placeholder</span>
        </div>
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <p className="text-sm text-muted-foreground text-pretty">
            In a live setup this would show a QR code and a link that opens your UPI app with the amount
            filled in.
          </p>
          <Button disabled>Open UPI app</Button>
        </div>
      </CardContent>
    </Card>
  )
}
