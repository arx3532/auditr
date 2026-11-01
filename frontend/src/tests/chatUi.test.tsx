import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DraftInvoiceCard } from '@/components/approval/DraftInvoiceCard'
import { PaymentApprovalCard } from '@/components/approval/PaymentApprovalCard'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { Composer } from '@/components/chat/Composer'
import type { Invoice, PaymentApproval } from '@/lib/api/types'
import type {
  ApprovalDecisionState,
  InvoiceApprovalMessage,
  PaymentApprovalMessage,
} from '@/lib/stream/chatState'
import { formatMoney } from '@/lib/format/money'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => 'test-token' }),
}))

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const DRAFT: Invoice = {
  id: 'inv_draft_1',
  customer: {
    id: 'cus_adtech',
    name: 'AdTech Solutions Pvt Ltd',
    gstin: '29ABCDE1234F1Z5',
  } as Invoice['customer'],
  status: 'draft',
  items: [{ description: 'Design services', hsnSac: '998391', taxableValue: '50000.00', gstRate: '18' }],
  tax: { igst: '9000.00' },
  subtotal: '50000.00',
  total: '59000.00',
  amountDue: '59000.00',
  dueDate: '2026-11-15',
}

function approval(decision: ApprovalDecisionState, draft: Invoice = DRAFT): InvoiceApprovalMessage {
  return {
    id: 'm1',
    role: 'approval',
    kind: 'invoice',
    approvalId: 'apr_1',
    expiresAt: '2026-10-25T10:00:00.000Z',
    draft,
    decision,
  }
}

const ISSUED: Invoice = {
  ...DRAFT,
  id: 'inv_0005',
  number: 'INV-0005',
  status: 'issued',
  amountDue: '59000.00',
}

const PAYMENT: PaymentApproval = {
  invoice: ISSUED,
  cashReceived: '53100.00',
  tdsDeducted: '5900.00',
  date: '2026-11-01',
  amountDueAfter: '0.00',
  statusAfter: 'paid',
}

function paymentApproval(decision: ApprovalDecisionState): PaymentApprovalMessage {
  return {
    id: 'm2',
    role: 'approval',
    kind: 'payment',
    approvalId: 'apr_pay',
    expiresAt: '2026-10-25T10:00:00.000Z',
    payment: PAYMENT,
    decision,
  }
}

describe('PaymentApprovalCard', () => {
  it('shows the payment exactly as the server previewed it', () => {
    renderWithQuery(
      <PaymentApprovalCard approval={paymentApproval({ kind: 'pending' })} canDecide onDecide={vi.fn()} />,
    )

    expect(screen.getByRole('region', { name: 'Record Payment' })).toBeInTheDocument()
    expect(screen.getByText('INV-0005')).toBeInTheDocument()
    expect(screen.getByText('AdTech Solutions Pvt Ltd')).toBeInTheDocument()
    expect(screen.getByText(formatMoney('53100.00'))).toBeInTheDocument()
    expect(screen.getByText(formatMoney('5900.00'))).toBeInTheDocument()
    expect(screen.getByText(formatMoney('0.00'))).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('offers confirm and reject, but no draft editing', async () => {
    const onDecide = vi.fn()
    const user = userEvent.setup()
    renderWithQuery(
      <PaymentApprovalCard approval={paymentApproval({ kind: 'pending' })} canDecide onDecide={onDecide} />,
    )

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /confirm & record/i }))
    expect(onDecide).toHaveBeenLastCalledWith('approve')
    await user.click(screen.getByRole('button', { name: /reject/i }))
    expect(onDecide).toHaveBeenLastCalledWith('reject')
  })

  it('locks every button while a decision is being sent', () => {
    renderWithQuery(
      <PaymentApprovalCard
        approval={paymentApproval({ kind: 'submitting', decision: 'approve' })}
        canDecide
        onDecide={vi.fn()}
      />,
    )
    for (const name of [/confirm/i, /reject/i]) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('links to the invoice the server returned once approved', () => {
    renderWithQuery(
      <PaymentApprovalCard
        approval={paymentApproval({
          kind: 'approved',
          invoice: { ...ISSUED, status: 'paid', amountDue: '0.00' },
        })}
        canDecide
        onDecide={vi.fn()}
      />,
    )
    expect(screen.getByText(/payment recorded against invoice #INV-0005/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view invoice/i })).toHaveAttribute('href', '/invoices/inv_0005')
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  })

  it('says nothing was recorded after a rejection', () => {
    renderWithQuery(
      <PaymentApprovalCard approval={paymentApproval({ kind: 'rejected' })} canDecide onDecide={vi.fn()} />,
    )
    expect(screen.getAllByText(/nothing was recorded/i).length).toBeGreaterThan(0)
  })

  it('offers Ask again when the approval has expired', async () => {
    const onAskAgain = vi.fn()
    const user = userEvent.setup()
    renderWithQuery(
      <PaymentApprovalCard
        approval={paymentApproval({ kind: 'expired' })}
        canDecide
        onDecide={vi.fn()}
        onAskAgain={onAskAgain}
      />,
    )
    await user.click(screen.getByRole('button', { name: /ask again/i }))
    expect(onAskAgain).toHaveBeenCalledTimes(1)
  })
})

describe('DraftInvoiceCard', () => {
  it('shows the draft exactly as the server sent it', () => {
    renderWithQuery(
      <DraftInvoiceCard approval={approval({ kind: 'pending' })} canDecide onDecide={vi.fn()} />,
    )

    expect(screen.getByRole('region', { name: 'Draft Tax Invoice' })).toBeInTheDocument()
    expect(screen.getAllByText(/AdTech Solutions Pvt Ltd/).length).toBeGreaterThan(0)
    expect(screen.getByText('Design services')).toBeInTheDocument()
    expect(screen.getByText(formatMoney('59000.00'))).toBeInTheDocument()
  })

  it('focuses the primary action when the card appears', () => {
    renderWithQuery(
      <DraftInvoiceCard approval={approval({ kind: 'pending' })} canDecide onDecide={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /confirm/i })).toHaveFocus()
  })

  it('sends approve and reject decisions', async () => {
    const onDecide = vi.fn()
    const user = userEvent.setup()
    renderWithQuery(
      <DraftInvoiceCard approval={approval({ kind: 'pending' })} canDecide onDecide={onDecide} />,
    )

    await user.click(screen.getByRole('button', { name: /confirm/i }))
    await user.click(screen.getByRole('button', { name: /reject/i }))

    expect(onDecide).toHaveBeenNthCalledWith(1, 'approve')
    expect(onDecide).toHaveBeenNthCalledWith(2, 'reject')
  })

  it('disables every action while a decision is being sent', () => {
    renderWithQuery(
      <DraftInvoiceCard
        approval={approval({ kind: 'submitting', decision: 'approve' })}
        canDecide
        onDecide={vi.fn()}
      />,
    )
    for (const name of [/confirm/i, /edit/i, /reject/i]) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('links to the issued invoice once approved', () => {
    renderWithQuery(
      <DraftInvoiceCard
        approval={approval({
          kind: 'approved',
          invoice: { ...DRAFT, id: 'inv_0010', number: 'INV-0010', status: 'issued' },
        })}
        canDecide
        onDecide={vi.fn()}
      />,
    )
    expect(screen.getByRole('link', { name: /view invoice/i })).toHaveAttribute('href', '/invoices/inv_0010')
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  })

  it('says nothing was issued after a rejection', () => {
    renderWithQuery(
      <DraftInvoiceCard approval={approval({ kind: 'rejected' })} canDecide onDecide={vi.fn()} />,
    )
    expect(screen.getAllByText(/nothing was issued/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  })

  it('offers Ask again when the draft has expired', async () => {
    const onAskAgain = vi.fn()
    const user = userEvent.setup()
    renderWithQuery(
      <DraftInvoiceCard
        approval={approval({ kind: 'expired' })}
        canDecide
        onDecide={vi.fn()}
        onAskAgain={onAskAgain}
      />,
    )

    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ask again/i }))
    expect(onAskAgain).toHaveBeenCalledTimes(1)
  })

  it('does not allow editing a draft with several line items', () => {
    const multi: Invoice = {
      ...DRAFT,
      items: [...DRAFT.items, { description: 'Hosting', taxableValue: '1000.00', gstRate: '18' }],
    }
    renderWithQuery(
      <DraftInvoiceCard approval={approval({ kind: 'pending' }, multi)} canDecide onDecide={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled()
  })

  it('sends only the changed fields from the edit dialog', async () => {
    const onDecide = vi.fn()
    const user = userEvent.setup()
    renderWithQuery(
      <DraftInvoiceCard approval={approval({ kind: 'pending' })} canDecide onDecide={onDecide} />,
    )

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const save = await screen.findByRole('button', { name: /save changes/i })
    expect(save).toBeDisabled()

    // The field is labelled "Amount (INR, before tax)" — match by the label text.
    const amount = screen.getByLabelText(/amount \(inr/i)
    await user.clear(amount)
    await user.type(amount, '60000')
    await user.click(save)

    // toDraftEdits sends the full items replacement array (backend requires all fields).
    // Only the taxableValue changed, so customerId and dueDate are omitted.
    await waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith('edit', {
        items: [
          {
            description: DRAFT.items[0].description,
            hsnSac: DRAFT.items[0].hsnSac,
            taxableValue: '60000',
            gstRate: DRAFT.items[0].gstRate,
          },
        ],
      }),
    )
  })

  it('rejects an invalid amount without sending anything', async () => {
    const onDecide = vi.fn()
    const user = userEvent.setup()
    renderWithQuery(
      <DraftInvoiceCard approval={approval({ kind: 'pending' })} canDecide onDecide={onDecide} />,
    )

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const amount = await screen.findByLabelText(/amount \(inr/i)
    await user.clear(amount)
    await user.type(amount, '12.345')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/enter an amount such as/i)).toBeInTheDocument()
    expect(onDecide).not.toHaveBeenCalled()
  })
})

describe('Composer', () => {
  function setup(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
    const onSend = vi.fn()
    const onStop = vi.fn()
    render(<Composer onSend={onSend} onStop={onStop} busy={false} disabled={false} {...props} />)
    return { onSend, onStop, field: screen.getByRole('textbox', { name: 'Message' }) }
  }

  it('sends on Enter and clears the field', async () => {
    const user = userEvent.setup()
    const { onSend, field } = setup()
    await user.type(field, 'Invoice AdTech{Enter}')
    expect(onSend).toHaveBeenCalledWith('Invoice AdTech')
    expect(field).toHaveValue('')
  })

  it('keeps Shift+Enter for a new line', async () => {
    const user = userEvent.setup()
    const { onSend, field } = setup()
    await user.type(field, 'one{Shift>}{Enter}{/Shift}two')
    expect(onSend).not.toHaveBeenCalled()
    expect(field).toHaveValue('one\ntwo')
  })

  it('does not send while an IME composition is confirmed with Enter', async () => {
    const user = userEvent.setup()
    const { onSend, field } = setup()
    await user.type(field, 'こんにちは')
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('ignores blank messages', async () => {
    const user = userEvent.setup()
    const { onSend, field } = setup()
    await user.type(field, '   {Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows Stop while a reply is streaming', async () => {
    const user = userEvent.setup()
    const { onStop } = setup({ busy: true, disabled: true })
    await user.click(screen.getByRole('button', { name: /stop/i }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('explains why it is disabled', () => {
    const { field } = setup({ disabled: true, hint: 'Confirm, edit or reject the draft above to continue.' })
    expect(field).toBeDisabled()
    expect(screen.getByText(/confirm, edit or reject/i)).toBeInTheDocument()
  })
})

describe('ChatPanel against the mock API', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  async function draftAnInvoice(user: ReturnType<typeof userEvent.setup>) {
    renderWithQuery(<ChatPanel />)
    await user.click(await screen.findByRole('button', { name: /invoice adtech/i }))
    return screen.findByRole('region', { name: 'Draft Tax Invoice' })
  }

  it('streams a reply into a draft card and locks the composer until it is decided', async () => {
    const user = userEvent.setup()
    await draftAnInvoice(user)

    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled()
    expect(screen.getByText(/confirm, edit or reject the draft above/i)).toBeInTheDocument()
  })

  it('issues the invoice after Confirm and unlocks the composer', async () => {
    const user = userEvent.setup()
    await draftAnInvoice(user)

    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(await screen.findByRole('link', { name: /view invoice/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled())
  })

  it('shows the rejection and unlocks the composer after Reject', async () => {
    const user = userEvent.setup()
    await draftAnInvoice(user)

    await user.click(screen.getByRole('button', { name: /reject/i }))

    expect(await screen.findByText(/draft rejected/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled())
  })
})