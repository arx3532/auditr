import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, Unprocessable
from app.db import repositories as repo
from app.db.models import (
    Invoice,
    InvoiceItem,
    InvoiceNumberSequence,
    LedgerEntry,
    Payment,
    User,
)
from app.domain.gst import LineInput, LineTax, TaxResult, compute_tax, determine_supply_type
from app.domain.invoice_rules import (
    InvalidTransition,
    InvoiceStatus,
    ensure_transition,
    financial_year,
    format_invoice_number,
    status_after_payment,
)
from app.domain.ledger import Entry, post_invoice, post_payment
from app.domain.money import ZERO, to_money
from app.domain.rules_config import get_rule_set
from app.domain.tds import apply_payment


@dataclass(frozen=True)
class ItemInput:
    description: str
    hsn_sac: str | None
    taxable_value: str
    gst_rate: str


def tax_result_from(invoice: Invoice) -> TaxResult:
    """Rebuild the stored tax so issuing posts exactly what the user approved."""
    lines = tuple(
        LineTax(i.taxable_value, i.gst_rate, i.cgst, i.sgst, i.igst) for i in invoice.items
    )
    return TaxResult(
        lines=lines,
        subtotal=invoice.subtotal,
        cgst=invoice.cgst,
        sgst=invoice.sgst,
        igst=invoice.igst,
    )


def _save_entries(
    db: Session, user_id: uuid.UUID, source_type: str, source_id: uuid.UUID, entries: list[Entry]
) -> None:
    for e in entries:
        db.add(
            LedgerEntry(
                user_id=user_id,
                source_type=source_type,
                source_id=source_id,
                account=e.account.value,
                debit=e.debit,
                credit=e.credit,
            )
        )


def create_draft(
    db: Session,
    user: User,
    *,
    customer_id: uuid.UUID,
    due_date: date,
    items: list[ItemInput],
    lut_ref: str | None,
    today: date,
) -> Invoice:
    if user.state_code is None:
        raise Unprocessable("supplier_state_required", "Set your state first (PUT /me/profile)")
    customer = repo.get_customer(db, user.id, customer_id)
    if customer is None:
        raise NotFound("customer_not_found", "Customer not found")
    if due_date < today:
        raise Unprocessable("due_date_in_past", "Due date cannot be in the past")

    lines: list[LineInput] = []
    for item in items:
        if not item.description.strip():
            raise Unprocessable("invalid_item", "Item description is required")
        try:
            rate = Decimal(item.gst_rate)
            if not rate.is_finite():
                raise ValueError("GST rate must be a number")
            lines.append(LineInput(to_money(item.taxable_value), rate))
        except InvalidOperation:
            raise Unprocessable("invalid_item", "Invalid taxable value or GST rate") from None
        except ValueError as exc:
            raise Unprocessable("invalid_item", str(exc)) from None

    lut = (lut_ref or "").strip() or None
    supply = determine_supply_type(
        user.state_code, customer.state_code, export_with_lut=lut is not None
    )
    try:
        rules = get_rule_set(today)
        tax = compute_tax(lines, supply, rules.allowed_gst_rates)
    except LookupError:
        raise Unprocessable("no_tax_rules", "No tax rules are available for this date") from None
    except ValueError as exc:
        raise Unprocessable("invalid_invoice", str(exc)) from None
    if tax.subtotal <= ZERO:
        raise Unprocessable("zero_invoice", "Invoice value must be greater than zero")

    invoice = Invoice(
        user_id=user.id,
        customer=customer,
        status=InvoiceStatus.DRAFT.value,
        supply_type=supply.value,
        lut_ref=lut,
        due_date=due_date,
        subtotal=tax.subtotal,
        cgst=tax.cgst,
        sgst=tax.sgst,
        igst=tax.igst,
        total=tax.total,
        amount_due=tax.total,
    )
    invoice.items = [
        InvoiceItem(
            position=index,
            description=item.description.strip(),
            hsn_sac=(item.hsn_sac or "").strip() or None,
            taxable_value=line_tax.taxable_value,
            gst_rate=line_tax.gst_rate,
            cgst=line_tax.cgst,
            sgst=line_tax.sgst,
            igst=line_tax.igst,
        )
        for index, (item, line_tax) in enumerate(zip(items, tax.lines, strict=True))
    ]
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def _next_sequence(db: Session, user_id: uuid.UUID, fy: str) -> int:
    """Gapless numbering: the counter row is locked and incremented inside the same
    transaction as the issue, so a rollback also rolls the number back."""
    db.execute(
        pg_insert(InvoiceNumberSequence)
        .values(user_id=user_id, financial_year=fy, last_number=0)
        .on_conflict_do_nothing()
    )
    row = db.scalar(
        select(InvoiceNumberSequence)
        .where(
            InvoiceNumberSequence.user_id == user_id,
            InvoiceNumberSequence.financial_year == fy,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    assert row is not None
    row.last_number += 1
    db.flush()
    return row.last_number


def issue_invoice(db: Session, user_id: uuid.UUID, invoice_id: uuid.UUID, today: date) -> Invoice:
    """Does not commit: the caller owns the transaction (see run_idempotent)."""
    invoice = repo.get_invoice(db, user_id, invoice_id, for_update=True)
    if invoice is None:
        raise NotFound("invoice_not_found", "Invoice not found")
    try:
        ensure_transition(InvoiceStatus(invoice.status), InvoiceStatus.ISSUED)
    except InvalidTransition:
        raise Conflict("invalid_state", f"Invoice is already {invoice.status}") from None
    if invoice.due_date < today:
        raise Unprocessable("due_date_passed", "Due date has passed, create a new draft")

    fy = financial_year(today)
    try:
        invoice.number = format_invoice_number(fy, _next_sequence(db, user_id, fy))
    except ValueError:
        raise Unprocessable("invoice_number_limit", "Invoice number limit reached") from None
    invoice.status = InvoiceStatus.ISSUED.value
    invoice.issue_date = today

    _save_entries(db, user_id, "invoice", invoice.id, post_invoice(tax_result_from(invoice)))
    db.flush()
    return invoice


def record_payment(
    db: Session,
    user_id: uuid.UUID,
    invoice_id: uuid.UUID,
    *,
    cash_received: str,
    tds_deducted: str,
    paid_on: date | None,
    today: date,
) -> tuple[Invoice, Payment]:
    """Does not commit: the caller owns the transaction (see run_idempotent)."""
    invoice = repo.get_invoice(db, user_id, invoice_id, for_update=True)
    if invoice is None:
        raise NotFound("invoice_not_found", "Invoice not found")
    current = InvoiceStatus(invoice.status)
    if current not in (InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID):
        raise Conflict("invalid_state", f"Cannot record a payment on a {invoice.status} invoice")

    when = paid_on or today
    if when > today:
        raise Unprocessable("future_date", "Payment date cannot be in the future")
    if invoice.issue_date is not None and when < invoice.issue_date:
        raise Unprocessable("before_issue", "Payment date is before the invoice was issued")

    try:
        settlement = apply_payment(
            invoice.amount_due, to_money(cash_received), to_money(tds_deducted)
        )
    except ValueError as exc:
        raise Unprocessable("invalid_payment", str(exc)) from None

    new_status = status_after_payment(invoice.total, settlement.amount_due_after)
    if new_status != current:  # a second partial payment keeps the same status
        ensure_transition(current, new_status)
    invoice.amount_due = settlement.amount_due_after
    invoice.status = new_status.value

    payment = Payment(
        user_id=user_id,
        invoice_id=invoice.id,
        cash_received=settlement.cash_received,
        tds_deducted=settlement.tds_deducted,
        paid_on=when,
    )
    db.add(payment)
    # Persist the payment within the current transaction so its ID is available.
    db.flush()
    _save_entries(
        db,
        user_id,
        "payment",
        payment.id,
        post_payment(settlement.cash_received, settlement.tds_deducted),
    )
    db.flush()
    return invoice, payment
