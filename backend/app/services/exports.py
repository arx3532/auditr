import csv
import io
import uuid
from collections.abc import Iterable
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Unprocessable
from app.db.models import Customer, Invoice, Payment
from app.domain.money import money_str
from app.services.reports import BILLED

MAX_EXPORT_ROWS = 5000
BOM = "\ufeff"  # lets Excel open UTF-8 correctly (names, the rupee sign)


def _build_csv(header: list[str], rows: Iterable[list[str]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    return BOM + buffer.getvalue()


def invoices_csv(db: Session, user_id: uuid.UUID, start: date, end: date) -> str:
    stmt = (
        select(Invoice)
        .where(
            Invoice.user_id == user_id,
            Invoice.status.in_(BILLED),
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
        )
        .order_by(Invoice.issue_date, Invoice.number)
        .limit(MAX_EXPORT_ROWS + 1)
    )
    invoices = list(db.scalars(stmt))
    if len(invoices) > MAX_EXPORT_ROWS:
        raise Unprocessable("too_many_rows", "Too many rows, choose a shorter date range")
    header = [
        "Invoice number", "Issue date", "Due date", "Customer", "Customer GSTIN",
        "Customer state code", "Supply type", "Taxable value", "CGST", "SGST", "IGST",
        "Total", "Amount due", "Status",
    ]  # fmt: skip
    rows = [
        [
            csv_safe(inv.number or ""),
            inv.issue_date.isoformat() if inv.issue_date else "",
            inv.due_date.isoformat(),
            csv_safe(inv.customer.name),
            inv.customer.gstin or "",
            inv.customer.state_code,
            inv.supply_type,
            money_str(inv.subtotal),
            money_str(inv.cgst),
            money_str(inv.sgst),
            money_str(inv.igst),
            money_str(inv.total),
            money_str(inv.amount_due),
            inv.status,
        ]
        for inv in invoices
    ]
    return _build_csv(header, rows)


def payments_csv(db: Session, user_id: uuid.UUID, start: date, end: date) -> str:
    stmt = (
        select(Payment, Invoice.number, Customer.name)
        .join(Invoice, Invoice.id == Payment.invoice_id)
        .join(Customer, Customer.id == Invoice.customer_id)
        .where(
            Payment.user_id == user_id,
            Payment.paid_on >= start,
            Payment.paid_on <= end,
        )
        .order_by(Payment.paid_on, Payment.created_at)
        .limit(MAX_EXPORT_ROWS + 1)
    )
    found = db.execute(stmt).all()
    if len(found) > MAX_EXPORT_ROWS:
        raise Unprocessable("too_many_rows", "Too many rows, choose a shorter date range")
    header = ["Payment date", "Invoice number", "Customer", "Cash received", "TDS deducted"]
    rows = [
        [
            payment.paid_on.isoformat(),
            csv_safe(number or ""),
            csv_safe(name),
            money_str(payment.cash_received),
            money_str(payment.tds_deducted),
        ]
        for payment, number, name in found
    ]
    return _build_csv(header, rows)


def csv_safe(value: str) -> str:
    """Stop spreadsheets from running text as a formula (CSV injection).
    Applies to free text only, never to amounts."""
    if value and value[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value
