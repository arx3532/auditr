'use client'

import { BanIcon, CopyIcon, ExternalLinkIcon, Link2Icon, Share2Icon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { isApiError } from '@/lib/api/client'
import { useCreatePublicLinkMutation, useRevokePublicLinkMutation } from '@/lib/api/queries'

interface CopyLinkButtonProps {
  invoiceId: string
  token?: string | null
}

export function CopyLinkButton({ invoiceId, token }: CopyLinkButtonProps) {
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const createMutation = useCreatePublicLinkMutation(invoiceId)
  const revokeMutation = useRevokePublicLinkMutation(invoiceId)

  const path = token ? `/pay/${encodeURIComponent(token)}` : ''

  async function copy() {
    if (!path) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      toast.success('Public link copied to clipboard')
    } catch {
      toast.error('Could not copy link. Open the page and copy its URL instead.')
    }
  }

  function handleGenerate() {
    createMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast.success('Public share link generated')
        void navigator.clipboard?.writeText?.(`${window.location.origin}${res.path}`).catch(() => {})
      },
      onError: (err) => {
        toast.error(isApiError(err) ? err.message : 'Could not generate share link.')
      },
    })
  }

  function handleRevoke() {
    revokeMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success('Public share link revoked')
        setConfirmRevoke(false)
      },
      onError: (err) => {
        toast.error(isApiError(err) ? err.message : 'Could not revoke share link.')
      },
    })
  }

  if (!token) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={createMutation.isPending}
        className="rounded-xl border-border font-medium"
      >
        {createMutation.isPending ? (
          <Spinner className="mr-1.5 size-4" />
        ) : (
          <Share2Icon className="mr-1.5 size-4" />
        )}
        Generate public link
      </Button>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void copy()}
          className="rounded-xl border-border font-medium"
        >
          <CopyIcon className="mr-1.5 size-4" />
          Copy public link
        </Button>

        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={path} target="_blank" rel="noopener noreferrer" />}
          className="rounded-xl font-medium"
        >
          <ExternalLinkIcon className="mr-1.5 size-4" />
          Open public page
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmRevoke(true)}
          disabled={revokeMutation.isPending}
          className="rounded-xl font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {revokeMutation.isPending ? (
            <Spinner className="mr-1.5 size-4" />
          ) : (
            <BanIcon className="mr-1.5 size-4" />
          )}
          Revoke link
        </Button>
      </div>

      <Dialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Link2Icon className="size-5" />
              Revoke public share link?
            </DialogTitle>
            <DialogDescription>
              Anyone with this link will no longer be able to view or pay this invoice. You can
              generate a new link later if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRevoke(false)}
              disabled={revokeMutation.isPending}
            >
              Keep link
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevoke}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              Revoke access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
