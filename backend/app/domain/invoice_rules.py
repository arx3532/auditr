from datetime import date
from decimal import Decimal
from enum import StrEnum

from app.domain.money import ZERO, to_money
import re

class InvoiceStatus(StrEnum):
    DRAFT = "draft"
    ISSUED = "issued"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    CANCELLED = "cancelled"


class InvalidTransition(ValueError):
    pass


_ALLOWED: dict[InvoiceStatus, frozenset[InvoiceStatus]] = {
    InvoiceStatus.DRAFT: frozenset({InvoiceStatus.ISSUED, InvoiceStatus.CANCELLED}),
    InvoiceStatus.ISSUED: frozenset(
        {InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.CANCELLED}
    ),
    InvoiceStatus.PARTIALLY_PAID: frozenset({InvoiceStatus.PAID}),
    InvoiceStatus.PAID: frozenset(),
    InvoiceStatus.CANCELLED: frozenset(),
}


def can_transition(current: InvoiceStatus, new: InvoiceStatus) -> bool:
    return new in _ALLOWED[current]


def ensure_transition(current: InvoiceStatus, new: InvoiceStatus) -> None:
    if not can_transition(current, new):
        raise InvalidTransition(f"Cannot move from {current} to {new}")


def can_cancel(status: InvoiceStatus, amount_paid: Decimal) -> bool:
    """Cancelling is only allowed before any payment has been recorded."""
    return status in {InvoiceStatus.DRAFT, InvoiceStatus.ISSUED} and to_money(amount_paid) == ZERO


def status_after_payment(total: Decimal, amount_due_after: Decimal) -> InvoiceStatus:
    due = to_money(amount_due_after)
    if due == ZERO:
        return InvoiceStatus.PAID
    if due < to_money(total):
        return InvoiceStatus.PARTIALLY_PAID
    raise ValueError("No payment has been applied")


def is_overdue(status: InvoiceStatus, due_date: date, today: date) -> bool:
    return status in {InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID} and today > due_date


def financial_year(on: date) -> str:
    """Financial year runs April to March, e.g. 2026-27."""
    start = on.year if on.month >= 4 else on.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def format_invoice_number(fy: str, sequence: int, prefix: str = "INV") -> str:
    if sequence < 1:
        raise ValueError("Sequence starts at 1")
    number = f"{prefix}/{fy}/{sequence:04d}"
    if len(number) > 16:
        raise ValueError("Invoice number would be longer than 16 characters")
    return number


def validate_credit_note(
    amount: Decimal, invoice_total: Decimal, already_credited: Decimal
) -> None:
    credit = to_money(amount)
    remaining = to_money(invoice_total) - to_money(already_credited)
    if credit <= ZERO:
        raise ValueError("Credit note must be greater than zero")
    if credit > remaining:
        raise ValueError("Credit note exceeds the amount still creditable")

_FY_PATTERN = re.compile(r"(\d{4})-(\d{2})")


def financial_year_bounds(fy: str) -> tuple[date, date]:
    """First and last day of a financial year like '2026-27' (April to March)."""
    match = _FY_PATTERN.fullmatch(fy)
    if match is None:
        raise ValueError("Financial year must look like 2026-27")
    start = int(match.group(1))
    if (start + 1) % 100 != int(match.group(2)):
        raise ValueError("Financial year must span consecutive years, like 2026-27")
    return date(start, 4, 1), date(start + 1, 3, 31)


AGING_BUCKETS = ("not_due", "1_30", "31_60", "61_90", "90_plus")


def aging_bucket(due_date: date, today: date) -> str:
    """Days past the due date. An invoice due today is not overdue yet."""
    days = (today - due_date).days
    if days <= 0:
        return "not_due"
    if days <= 30:
        return "1_30"
    if days <= 60:
        return "31_60"
    if days <= 90:
        return "61_90"
    return "90_plus"