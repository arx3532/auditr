'use client'

import { CopyIcon, ExternalLinkIcon } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

export function CopyLinkButton({ token }: { token: string }) {
  const path = `/pay/${encodeURIComponent(token)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      toast.success('Public link copied')
    } catch {
      toast.error('Could not copy the link. Open the public page and copy its address instead.')
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => void copy()}>
        <CopyIcon data-icon="inline-start" />
        Copy public link
      </Button>
      <Button variant="ghost" render={<Link href={path} target="_blank" rel="noopener noreferrer" />}>
        <ExternalLinkIcon data-icon="inline-start" />
        Open public page
      </Button>
    </div>
  )
}
