"""TDS arithmetic. The rate and the base are INPUTS: deciding which section,
rate and base apply is a tax judgement and is deliberately not made here.

compute_tds returns a SUGGESTED amount, rounded to a multiple of 10 rupees
(demo policy based on the Income Tax Department's TDS reckoner; see Income-tax
Act 2025 s.516 and s.288B of the 1961 Act). apply_payment records the amount
that was actually deducted and does not round it.
Not modelled: grossing up, lower/nil deduction certificates, thresholds.
"""

from dataclasses import dataclass
from decimal import Decimal

from app.domain.money import ZERO, round_to_ten, to_money


def compute_tds(base: Decimal, rate: Decimal) -> Decimal:
    base_amount = to_money(base)
    if rate < 0 or rate > 100:
        raise ValueError("Rate must be between 0 and 100")
    return round_to_ten(base_amount * rate / Decimal(100))


@dataclass(frozen=True)
class Settlement:
    cash_received: Decimal
    tds_deducted: Decimal
    amount_due_after: Decimal

    @property
    def fully_settled(self) -> bool:
        return self.amount_due_after == ZERO


def apply_payment(amount_due: Decimal, cash_received: Decimal, tds_deducted: Decimal) -> Settlement:
    due = to_money(amount_due)
    cash = to_money(cash_received)
    tds = to_money(tds_deducted)
    settled = cash + tds
    if settled <= ZERO:
        raise ValueError("Payment must be greater than zero")
    if settled > due:
        raise ValueError("Payment exceeds the amount due")
    return Settlement(cash, tds, due - settled)
