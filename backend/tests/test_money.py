from decimal import Decimal

import pytest

from app.domain.money import money_str, round_money, round_to_ten, to_money


def test_to_money_has_two_places() -> None:
    assert to_money("100") == Decimal("100.00")
    assert str(to_money("100")) == "100.00"
    assert str(to_money(5)) == "5.00"


@pytest.mark.parametrize("bad", ["abc", "NaN", "Infinity", "-5", "10.505", "1000000000000.00", ""])
def test_invalid_amounts_rejected(bad: str) -> None:
    with pytest.raises(ValueError):
        to_money(bad)


def test_float_rejected() -> None:
    with pytest.raises(TypeError):
        to_money(10.5)  # type: ignore[arg-type]


def test_bool_rejected() -> None:
    with pytest.raises(TypeError):
        to_money(True)


def test_negative_allowed_only_when_asked() -> None:
    assert to_money("-5", allow_negative=True) == Decimal("-5.00")


def test_round_half_up() -> None:
    # float arithmetic gets this one wrong (round(2.675, 2) == 2.67)
    assert round_money(Decimal("2.675")) == Decimal("2.68")
    assert round_money(Decimal("0.0125")) == Decimal("0.01")


def test_money_str() -> None:
    assert money_str(Decimal("50000")) == "50000.00"
    assert money_str(Decimal("1234.5")) == "1234.50"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("0.99", "0.00"),
        ("4.99", "0.00"),
        ("5.00", "10.00"),
        ("5.50", "10.00"),
        ("14.99", "10.00"),
        ("15", "20.00"),
        ("5000", "5000.00"),
    ],
)
def test_round_to_ten(value: str, expected: str) -> None:
    assert round_to_ten(Decimal(value)) == Decimal(expected)


def test_round_to_ten_rejects_negative() -> None:
    with pytest.raises(ValueError):
        round_to_ten(Decimal("-1"))
