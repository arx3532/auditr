import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import Unprocessable
from app.db.models import Customer, Invoice, InvoiceItem, Payment
from app.domain.invoice_rules import (
    AGING_BUCKETS,
    InvoiceStatus,
    aging_bucket,
    financial_year,
    financial_year_bounds,
)
from app.domain.money import ZERO

# Statuses that count as "issued" for reporting (drafts and cancelled are excluded).
BILLED = [
    InvoiceStatus.ISSUED.value,
    InvoiceStatus.PARTIALLY_PAID.value,
    InvoiceStatus.PAID.value,
]
OPEN = [InvoiceStatus.ISSUED.value, InvoiceStatus.PARTIALLY_PAID.value]
MAX_RANGE_DAYS = 400


def _dec(value: object) -> Decimal:
    return ZERO if value is None else Decimal(str(value))


def resolve_range(start: date | None, end: date | None, today: date) -> tuple[date, date]:
    """Default: start of the current financial year up to today."""
    default_start, _ = financial_year_bounds(financial_year(today))
    start = start or default_start
    end = end or today
    if start > end:
        raise Unprocessable("invalid_range", "'from' must not be after 'to'")
    if (end - start).days > MAX_RANGE_DAYS:
        raise Unprocessable("range_too_large", f"Choose a range of {MAX_RANGE_DAYS} days or less")
    return start, end


@dataclass
class Amounts:
    count: int = 0
    taxable: Decimal = ZERO
    cgst: Decimal = ZERO
    sgst: Decimal = ZERO
    igst: Decimal = ZERO

    def add(
        self, count: int, taxable: Decimal, cgst: Decimal, sgst: Decimal, igst: Decimal
    ) -> None:
        self.count += count
        self.taxable += taxable
        self.cgst += cgst
        self.sgst += sgst
        self.igst += igst

    @property
    def total_tax(self) -> Decimal:
        return self.cgst + self.sgst + self.igst


@dataclass(frozen=True)
class Summary:
    revenue_this_month: Decimal
    overdue_count: int
    overdue_total: Decimal


def summary(db: Session, user_id: uuid.UUID, today: date) -> Summary:
    month_start = today.replace(day=1)
    revenue = db.scalar(
        select(func.sum(Invoice.subtotal)).where(
            Invoice.user_id == user_id,
            Invoice.status.in_(BILLED),
            Invoice.issue_date >= month_start,
            Invoice.issue_date <= today,
        )
    )
    count, due = db.execute(
        select(func.count(Invoice.id), func.sum(Invoice.amount_due)).where(
            Invoice.user_id == user_id,
            Invoice.status.in_(OPEN),
            Invoice.due_date < today,
        )
    ).one()
    return Summary(_dec(revenue), int(count), _dec(due))


def gst_summary(
    db: Session, user_id: uuid.UUID, start: date, end: date
) -> tuple[dict[str, Amounts], dict[str, Amounts], Amounts]:
    stmt = (
        select(
            Invoice.issue_date,
            Invoice.supply_type,
            func.count(Invoice.id),
            func.sum(Invoice.subtotal),
            func.sum(Invoice.cgst),
            func.sum(Invoice.sgst),
            func.sum(Invoice.igst),
        )
        .where(
            Invoice.user_id == user_id,
            Invoice.status.in_(BILLED),
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
        )
        .group_by(Invoice.issue_date, Invoice.supply_type)
    )
    months: dict[str, Amounts] = defaultdict(Amounts)
    by_supply: dict[str, Amounts] = defaultdict(Amounts)
    totals = Amounts()
    for issue_date, supply_type, count, taxable, cgst, sgst, igst in db.execute(stmt).all():
        if issue_date is None:  # cannot happen: the query only returns issued invoices
            continue
        key = f"{issue_date.year}-{issue_date.month:02d}"
        for bucket in (months[key], by_supply[supply_type], totals):
            bucket.add(int(count), _dec(taxable), _dec(cgst), _dec(sgst), _dec(igst))
    return dict(sorted(months.items())), dict(sorted(by_supply.items())), totals


def hsn_summary(
    db: Session, user_id: uuid.UUID, start: date, end: date
) -> list[tuple[str, Amounts]]:
    stmt = (
        select(
            InvoiceItem.hsn_sac,
            func.count(InvoiceItem.id),
            func.sum(InvoiceItem.taxable_value),
            func.sum(InvoiceItem.cgst),
            func.sum(InvoiceItem.sgst),
            func.sum(InvoiceItem.igst),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .where(
            Invoice.user_id == user_id,
            Invoice.status.in_(BILLED),
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
        )
        .group_by(InvoiceItem.hsn_sac)
        .order_by(InvoiceItem.hsn_sac)
    )
    result: list[tuple[str, Amounts]] = []
    for hsn, count, taxable, cgst, sgst, igst in db.execute(stmt).all():
        amounts = Amounts()
        amounts.add(int(count), _dec(taxable), _dec(cgst), _dec(sgst), _dec(igst))
        result.append((hsn or "UNSPECIFIED", amounts))
    return result


@dataclass(frozen=True)
class TdsRow:
    customer_id: uuid.UUID
    customer_name: str
    payment_count: int
    cash_received: Decimal
    tds_deducted: Decimal


def tds_report(db: Session, user_id: uuid.UUID, start: date, end: date) -> list[TdsRow]:
    stmt = (
        select(
            Customer.id,
            Customer.name,
            func.count(Payment.id),
            func.sum(Payment.cash_received),
            func.sum(Payment.tds_deducted),
        )
        .select_from(Payment)
        .join(Invoice, Invoice.id == Payment.invoice_id)
        .join(Customer, Customer.id == Invoice.customer_id)
        .where(
            Payment.user_id == user_id,
            Payment.paid_on >= start,
            Payment.paid_on <= end,
        )
        .group_by(Customer.id, Customer.name)
        .order_by(Customer.name)
    )
    return [
        TdsRow(cid, name, int(count), _dec(cash), _dec(tds))
        for cid, name, count, cash, tds in db.execute(stmt).all()
    ]


def receivables_aging(
    db: Session, user_id: uuid.UUID, today: date
) -> dict[str, tuple[int, Decimal]]:
    buckets: dict[str, tuple[int, Decimal]] = {b: (0, ZERO) for b in AGING_BUCKETS}
    rows = db.execute(
        select(Invoice.due_date, Invoice.amount_due).where(
            Invoice.user_id == user_id, Invoice.status.in_(OPEN)
        )
    ).all()
    for due_date, amount_due in rows:
        name = aging_bucket(due_date, today)
        count, total = buckets[name]
        buckets[name] = (count + 1, total + _dec(amount_due))
    return buckets
