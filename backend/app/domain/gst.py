"""GST calculation. Pure functions on Decimal, no I/O.

Rounding (DEMO POLICY, not a statutory rule): each tax component is rounded
per line item to 2 decimal places, half-up. Section 170 of the CGST Act, 2017
(in force from 1 July 2017) rounds sums payable or due under the Act, such as
amounts in returns and refunds, to the nearest rupee. This demo does not
compute those, so it does not round to whole rupees.

CGST and SGST are each computed on the same taxable value at half the rate,
so they are always equal on a line.

Place of supply is simplified to the customer's state (demo). Real rules vary
by type of supply, and export-of-services conditions are not checked.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from app.domain.money import ZERO, round_money, to_money


class SupplyType(StrEnum):
    INTRA_STATE = "intra_state"
    INTER_STATE = "inter_state"
    EXPORT_LUT = "export_lut"


def determine_supply_type(
    supplier_state: str, place_of_supply: str, *, export_with_lut: bool = False
) -> SupplyType:
    if export_with_lut:
        return SupplyType.EXPORT_LUT
    if supplier_state == place_of_supply:
        return SupplyType.INTRA_STATE
    return SupplyType.INTER_STATE


@dataclass(frozen=True)
class LineInput:
    taxable_value: Decimal
    gst_rate: Decimal


@dataclass(frozen=True)
class LineTax:
    taxable_value: Decimal
    gst_rate: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal


@dataclass(frozen=True)
class TaxResult:
    lines: tuple[LineTax, ...]
    subtotal: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal

    @property
    def total_tax(self) -> Decimal:
        return self.cgst + self.sgst + self.igst

    @property
    def total(self) -> Decimal:
        return self.subtotal + self.total_tax


def _line_tax(taxable: Decimal, rate: Decimal, supply_type: SupplyType) -> LineTax:
    if supply_type is SupplyType.EXPORT_LUT:
        return LineTax(taxable, rate, ZERO, ZERO, ZERO)
    if supply_type is SupplyType.INTRA_STATE:
        half = round_money(taxable * rate / Decimal(200))
        return LineTax(taxable, rate, half, half, ZERO)
    return LineTax(taxable, rate, ZERO, ZERO, round_money(taxable * rate / Decimal(100)))


def compute_tax(
    lines: Sequence[LineInput],
    supply_type: SupplyType,
    allowed_rates: frozenset[Decimal],
) -> TaxResult:
    if not lines:
        raise ValueError("An invoice needs at least one line")
    results: list[LineTax] = []
    for line in lines:
        taxable = to_money(line.taxable_value)
        if line.gst_rate not in allowed_rates:
            raise ValueError(f"GST rate {line.gst_rate} is not allowed")
        results.append(_line_tax(taxable, line.gst_rate, supply_type))
    return TaxResult(
        lines=tuple(results),
        subtotal=sum((r.taxable_value for r in results), ZERO),
        cgst=sum((r.cgst for r in results), ZERO),
        sgst=sum((r.sgst for r in results), ZERO),
        igst=sum((r.igst for r in results), ZERO),
    )
