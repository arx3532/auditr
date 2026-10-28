from datetime import date
from decimal import Decimal

import pytest

from app.domain.invoice_rules import (
    InvalidTransition,
    InvoiceStatus,
    can_cancel,
    can_transition,
    ensure_transition,
    financial_year,
    format_invoice_number,
    is_overdue,
    status_after_payment,
    validate_credit_note,
)

S = InvoiceStatus


def test_valid_and_invalid_transitions() -> None:
    assert can_transition(S.DRAFT, S.ISSUED)
    assert can_transition(S.ISSUED, S.PARTIALLY_PAID)
    assert can_transition(S.PARTIALLY_PAID, S.PAID)
    assert not can_transition(S.PAID, S.ISSUED)
    assert not can_transition(S.CANCELLED, S.ISSUED)
    assert not can_transition(S.DRAFT, S.PAID)


def test_ensure_transition_raises() -> None:
    with pytest.raises(InvalidTransition):
        ensure_transition(S.PAID, S.DRAFT)


def test_cancel_only_before_payment() -> None:
    assert can_cancel(S.ISSUED, Decimal("0.00"))
    assert not can_cancel(S.ISSUED, Decimal("10.00"))
    assert not can_cancel(S.PAID, Decimal("0.00"))


def test_status_after_payment() -> None:
    total = Decimal("100.00")
    assert status_after_payment(total, Decimal("0.00")) is S.PAID
    assert status_after_payment(total, Decimal("40.00")) is S.PARTIALLY_PAID
    with pytest.raises(ValueError):
        status_after_payment(total, Decimal("100.00"))


def test_overdue() -> None:
    due = date(2026, 5, 15)
    assert is_overdue(S.ISSUED, due, date(2026, 5, 16))
    assert not is_overdue(S.ISSUED, due, date(2026, 5, 15))
    assert not is_overdue(S.PAID, due, date(2026, 6, 1))
    assert not is_overdue(S.DRAFT, due, date(2026, 6, 1))


def test_financial_year_boundaries() -> None:
    assert financial_year(date(2027, 3, 31)) == "2026-27"
    assert financial_year(date(2027, 4, 1)) == "2027-28"
    assert financial_year(date(2026, 1, 15)) == "2025-26"


def test_invoice_number_format() -> None:
    assert format_invoice_number("2026-27", 1) == "INV/2026-27/0001"
    assert len(format_invoice_number("2026-27", 9999)) == 16


def test_invoice_number_too_long_or_invalid() -> None:
    with pytest.raises(ValueError):
        format_invoice_number("2026-27", 10000)
    with pytest.raises(ValueError):
        format_invoice_number("2026-27", 0)


def test_credit_note_limits() -> None:
    total, credited = Decimal("1000.00"), Decimal("300.00")
    validate_credit_note(Decimal("700.00"), total, credited)  # exactly the remainder
    with pytest.raises(ValueError):
        validate_credit_note(Decimal("700.01"), total, credited)
    with pytest.raises(ValueError):
        validate_credit_note(Decimal("0.00"), total, credited)
