import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, Unprocessable
from app.db import repositories as repo
from app.db.models import ChatThread, Invoice, Payment, User
from app.domain.invoice_rules import InvoiceStatus
from app.domain.money import money_str
from app.services import invoicing

APPROVAL_TTL = timedelta(minutes=30)
ISSUE_INVOICE = "issue_invoice"
RECORD_PAYMENT = "record_payment"


@dataclass(frozen=True)
class InvoiceEdit:
    customer_id: uuid.UUID | None
    due_date: date | None
    items: list[invoicing.ItemInput] | None
    lut_ref: str | None
    lut_ref_given: bool


@dataclass(frozen=True)
class PaymentEdit:
    cash_received: str | None
    tds_deducted: str | None
    paid_on: date | None
    paid_on_given: bool


@dataclass(frozen=True)
class Outcome:
    kind: str  # "approved", "rejected" or "expired"
    message: str  # what the model is told
    invoice: Invoice | None = None
    payment: Payment | None = None


def _open(
    db: Session,
    thread: ChatThread,
    kind: str,
    invoice_id: uuid.UUID,
    args: dict[str, Any] | None,
    now: datetime,
) -> None:
    thread.pending_approval_id = uuid.uuid4()
    thread.pending_kind = kind
    thread.pending_invoice_id = invoice_id
    thread.pending_args = args
    thread.pending_expires_at = now + APPROVAL_TTL
    db.commit()


def open_issue_approval(
    db: Session, thread: ChatThread, invoice_id: uuid.UUID, now: datetime
) -> None:
    _open(db, thread, ISSUE_INVOICE, invoice_id, None, now)


def open_payment_approval(
    db: Session,
    thread: ChatThread,
    invoice_id: uuid.UUID,
    args: dict[str, Any],
    now: datetime,
) -> None:
    _open(db, thread, RECORD_PAYMENT, invoice_id, args, now)


def _clear(thread: ChatThread) -> None:
    thread.pending_approval_id = None
    thread.pending_kind = None
    thread.pending_invoice_id = None
    thread.pending_args = None
    thread.pending_expires_at = None


def _lock_pending(
    db: Session, user_id: uuid.UUID, thread_id: uuid.UUID, approval_id: uuid.UUID
) -> ChatThread:
    """Lock the conversation row. A second request for the same approval waits here,
    then finds the approval gone and gets a 409."""
    thread = repo.get_thread(db, user_id, thread_id, for_update=True)
    if thread is None:
        raise NotFound("thread_not_found", "Conversation not found")
    if thread.pending_approval_id is None or thread.pending_approval_id != approval_id:
        raise Conflict("approval_not_pending", "This approval is no longer pending")
    return thread


def _is_expired(thread: ChatThread, now: datetime) -> bool:
    return thread.pending_expires_at is not None and thread.pending_expires_at <= now


def edit_pending(
    db: Session,
    user: User,
    thread_id: uuid.UUID,
    approval_id: uuid.UUID,
    edit: InvoiceEdit | PaymentEdit,
    *,
    today: date,
    now: datetime,
) -> None:
    """Change what is being proposed and rotate the approval id, so the user must
    approve the NEW numbers. Everything happens in one transaction."""
    thread = _lock_pending(db, user.id, thread_id, approval_id)
    if _is_expired(thread, now):
        raise Conflict("approval_expired", "This approval has expired. Reject it and ask again")
    invoice_id = thread.pending_invoice_id
    if invoice_id is None:
        raise Conflict("approval_not_pending", "This approval is no longer pending")

    if thread.pending_kind == ISSUE_INVOICE:
        if not isinstance(edit, InvoiceEdit):
            raise Unprocessable("invalid_edit", "These changes do not apply to an invoice draft")
        thread.pending_approval_id = uuid.uuid4()
        thread.pending_expires_at = now + APPROVAL_TTL
        # update_draft validates first and commits the draft and the new approval together
        invoicing.update_draft(
            db,
            user,
            invoice_id,
            customer_id=edit.customer_id,
            due_date=edit.due_date,
            items=edit.items,
            lut_ref=edit.lut_ref,
            lut_ref_given=edit.lut_ref_given,
            today=today,
        )
        return

    if not isinstance(edit, PaymentEdit):
        raise Unprocessable("invalid_edit", "These changes do not apply to a payment")
    args = dict(thread.pending_args or {})
    cash = edit.cash_received or args["cash_received"]
    tds = edit.tds_deducted if edit.tds_deducted is not None else args["tds_deducted"]
    if edit.paid_on_given:
        paid_on = edit.paid_on
    else:
        paid_on = date.fromisoformat(args["paid_on"]) if args.get("paid_on") else None
    plan = invoicing.preview_payment(
        db, user.id, invoice_id, cash_received=cash, tds_deducted=tds, paid_on=paid_on, today=today
    )
    thread.pending_args = {
        "cash_received": money_str(plan.cash_received),
        "tds_deducted": money_str(plan.tds_deducted),
        "paid_on": plan.paid_on.isoformat(),
    }
    thread.pending_approval_id = uuid.uuid4()
    thread.pending_expires_at = now + APPROVAL_TTL
    db.commit()


def resolve_decision(
    db: Session,
    user: User,
    thread_id: uuid.UUID,
    approval_id: uuid.UUID,
    decision: str,
    *,
    today: date,
    now: datetime,
) -> Outcome:
    """Approve or reject. The approval is claimed, the action runs, and the result is
    committed in ONE transaction. If the action fails, everything rolls back and the
    approval stays pending."""
    thread = _lock_pending(db, user.id, thread_id, approval_id)
    kind, invoice_id, args = thread.pending_kind, thread.pending_invoice_id, thread.pending_args
    expired = _is_expired(thread, now)
    if kind is None or invoice_id is None:
        raise Conflict("approval_not_pending", "This approval is no longer pending")
    _clear(thread)

    if decision == "reject" or expired:
        outcome = _reject(db, user.id, kind, invoice_id, expired)
    else:
        outcome = _approve(db, user.id, kind, invoice_id, args or {}, today)
    db.commit()
    return outcome


def _approve(
    db: Session,
    user_id: uuid.UUID,
    kind: str,
    invoice_id: uuid.UUID,
    args: dict[str, Any],
    today: date,
) -> Outcome:
    if kind == ISSUE_INVOICE:
        invoice = invoicing.issue_invoice(db, user_id, invoice_id, today)
        return Outcome(
            "approved",
            f"The user approved the draft. Invoice {invoice.number} was issued to "
            f"{invoice.customer.name}: total {money_str(invoice.total)} INR, "
            f"due {invoice.due_date.isoformat()}.",
            invoice=invoice,
        )
    paid_on = date.fromisoformat(args["paid_on"]) if args.get("paid_on") else None
    invoice, payment = invoicing.record_payment(
        db,
        user_id,
        invoice_id,
        cash_received=args["cash_received"],
        tds_deducted=args["tds_deducted"],
        paid_on=paid_on,
        today=today,
    )
    return Outcome(
        "approved",
        f"The user approved the payment. Recorded {money_str(payment.cash_received)} INR cash "
        f"and {money_str(payment.tds_deducted)} INR TDS against invoice {invoice.number}. "
        f"Amount due is now {money_str(invoice.amount_due)} INR (status: {invoice.status}).",
        invoice=invoice,
        payment=payment,
    )


def _reject(
    db: Session, user_id: uuid.UUID, kind: str, invoice_id: uuid.UUID, expired: bool
) -> Outcome:
    cancelled = False
    if kind == ISSUE_INVOICE:
        invoice = repo.get_invoice(db, user_id, invoice_id, for_update=True)
        if invoice is not None and invoice.status == InvoiceStatus.DRAFT.value:
            invoice.status = InvoiceStatus.CANCELLED.value
            cancelled = True
    note = " The draft was cancelled." if cancelled else ""
    if expired:
        text = "The approval expired before the user confirmed it, so nothing was done." + note
        return Outcome("expired", text)
    return Outcome("rejected", "The user rejected the action. Nothing was changed." + note)
