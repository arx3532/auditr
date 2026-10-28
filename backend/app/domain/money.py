"""Money handling. Decimal only, never float.

Rounding policy (demo): computed amounts are rounded to 2 decimal places,
half-up, where each amount is calculated (see gst.py). User input is never
rounded: more than 2 decimal places is rejected.
"""

from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal, InvalidOperation

CENT = Decimal("0.01")
ZERO = Decimal("0.00")
MAX_AMOUNT = Decimal("999999999999.99")  # largest value NUMERIC(14,2) can hold
TEN = Decimal("10")


def to_decimal(value: str | int | Decimal) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, str | int | Decimal):
        raise TypeError("Money must be a str, int or Decimal, never float")
    try:
        result = value if isinstance(value, Decimal) else Decimal(value)
    except InvalidOperation:
        raise ValueError("Not a valid amount") from None
    if not result.is_finite():
        raise ValueError("Amount must be finite")
    return result


def to_money(value: str | int | Decimal, *, allow_negative: bool = False) -> Decimal:
    """Validate an amount and return it with exactly 2 decimal places."""
    amount = to_decimal(value)
    if abs(amount) > MAX_AMOUNT:
        raise ValueError("Amount is too large")
    if amount != amount.quantize(CENT):
        raise ValueError("Amount has more than 2 decimal places")
    if amount < 0 and not allow_negative:
        raise ValueError("Amount cannot be negative")
    return amount.quantize(CENT)


def round_money(value: Decimal) -> Decimal:
    """Round a COMPUTED amount to 2 decimal places, half-up."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def money_str(value: Decimal) -> str:
    """Format for the API: always a plain decimal string like '50000.00'."""
    return format(value.quantize(CENT), "f")


def round_to_ten(value: Decimal) -> Decimal:
    """Round a computed amount to a multiple of 10 rupees.

    Paise are ignored first. Then, if the last figure of the whole-rupee amount
    is 5 or more, the amount goes up to the next multiple of 10, otherwise down.
    (Income-tax Act 2025 s.516; s.288B of the 1961 Act.)
    """
    if value < 0:
        raise ValueError("Amount cannot be negative")
    whole = value.to_integral_value(rounding=ROUND_DOWN)
    remainder = whole % TEN
    rounded = whole + (TEN - remainder) if remainder >= 5 else whole - remainder
    return rounded.quantize(CENT)
