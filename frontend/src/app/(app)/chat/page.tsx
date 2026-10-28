import type { Metadata } from 'next'

import { ChatPanel } from '@/components/chat/ChatPanel'
import { PageHeader } from '@/components/common/PageHeader'

export const metadata: Metadata = { title: 'Chat' }

export default function ChatPage() {
  return (
    <>
      <PageHeader title="Chat" description="Describe an invoice and review the draft before it is issued." />
      <ChatPanel />
    </>
  )
}
