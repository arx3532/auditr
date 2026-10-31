import type { Metadata } from 'next'

import { ChatPanel } from '@/components/chat/ChatPanel'

export const metadata: Metadata = { title: 'Chat' }

export default function ChatPage() {
  return (
    <>
      {/* The greeting is the visible title; the heading stays for screen readers. */}
      <h1 className="sr-only">Chat</h1>
      <ChatPanel />
    </>
  )
}