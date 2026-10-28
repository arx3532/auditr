from decimal import Decimal

import pytest

from app.domain.tds import apply_payment, compute_tds


def d(value: str) -> Decimal:
    return Decimal(value)


def test_compute_tds_rounds_to_multiple_of_ten() -> None:
    assert compute_tds(d("50000.00"), d("10")) == d("5000.00")
    assert compute_tds(d("333.33"), d("10")) == d("30.00")  # 33.333 -> 33 -> 30
    assert compute_tds(d("350.00"), d("10")) == d("40.00")  # 35 -> 40
    assert compute_tds(d("349.99"), d("10")) == d("30.00")  # 34.999 -> 34 -> 30


def test_invalid_rate_rejected() -> None:
    with pytest.raises(ValueError):
        compute_tds(d("100.00"), d("101"))


def test_payment_with_tds_settles_fully() -> None:
    result = apply_payment(d("59000.00"), d("53100.00"), d("5900.00"))
    assert result.amount_due_after == d("0.00")
    assert result.fully_settled


def test_partial_payment() -> None:
    result = apply_payment(d("59000.00"), d("20000.00"), d("0.00"))
    assert result.amount_due_after == d("39000.00")
    assert not result.fully_settled


def test_recorded_tds_is_not_rounded() -> None:
    # apply_payment records what the client actually deducted.
    result = apply_payment(d("100.00"), d("90.00"), d("5.55"))
    assert result.tds_deducted == d("5.55")
    assert result.amount_due_after == d("4.45")


def test_overpayment_rejected() -> None:
    with pytest.raises(ValueError):
        apply_payment(d("100.00"), d("90.00"), d("20.00"))


def test_zero_payment_rejected() -> None:
    with pytest.raises(ValueError):
        apply_payment(d("100.00"), d("0.00"), d("0.00"))
