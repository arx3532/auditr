from decimal import Decimal

import pytest

from app.domain.gst import LineInput, SupplyType, compute_tax, determine_supply_type

# Test values only. They exercise the logic and are not tax advice.
ALLOWED = frozenset({Decimal("0"), Decimal("5"), Decimal("18")})


def line(value: str, rate: str = "18") -> LineInput:
    return LineInput(Decimal(value), Decimal(rate))


def test_intra_state_splits_equally() -> None:
    result = compute_tax([line("50000.00")], SupplyType.INTRA_STATE, ALLOWED)
    assert result.cgst == Decimal("4500.00")
    assert result.sgst == Decimal("4500.00")
    assert result.igst == Decimal("0.00")
    assert result.total == Decimal("59000.00")


def test_inter_state_uses_igst() -> None:
    result = compute_tax([line("50000.00")], SupplyType.INTER_STATE, ALLOWED)
    assert result.igst == Decimal("9000.00")
    assert result.cgst == result.sgst == Decimal("0.00")
    assert result.total == Decimal("59000.00")


def test_export_with_lut_is_zero_rated() -> None:
    result = compute_tax([line("50000.00")], SupplyType.EXPORT_LUT, ALLOWED)
    assert result.total_tax == Decimal("0.00")
    assert result.total == Decimal("50000.00")


def test_rounding_is_per_line_half_up() -> None:
    # 0.50 * 5 / 200 = 0.0125 -> 0.01 each for CGST and SGST
    result = compute_tax([line("0.50", "5")], SupplyType.INTRA_STATE, ALLOWED)
    assert result.cgst == result.sgst == Decimal("0.01")
    assert result.total_tax == Decimal("0.02")


def test_multiple_lines_sum() -> None:
    result = compute_tax(
        [line("100.00", "5"), line("200.00", "18")], SupplyType.INTER_STATE, ALLOWED
    )
    assert result.subtotal == Decimal("300.00")
    assert result.igst == Decimal("41.00")  # 5.00 + 36.00


def test_disallowed_rate_rejected() -> None:
    with pytest.raises(ValueError):
        compute_tax([line("100.00", "12")], SupplyType.INTRA_STATE, ALLOWED)


def test_negative_amount_rejected() -> None:
    with pytest.raises(ValueError):
        compute_tax([line("-1.00")], SupplyType.INTRA_STATE, ALLOWED)


def test_too_many_decimal_places_rejected() -> None:
    with pytest.raises(ValueError):
        compute_tax([line("1.005")], SupplyType.INTRA_STATE, ALLOWED)


def test_no_lines_rejected() -> None:
    with pytest.raises(ValueError):
        compute_tax([], SupplyType.INTRA_STATE, ALLOWED)


def test_determine_supply_type() -> None:
    assert determine_supply_type("32", "32") is SupplyType.INTRA_STATE
    assert determine_supply_type("32", "29") is SupplyType.INTER_STATE
    assert determine_supply_type("32", "29", export_with_lut=True) is SupplyType.EXPORT_LUT
