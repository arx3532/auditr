"""Double-entry posting rules. Pure functions: they return entries and never
touch the database. The service layer will save them in the same transaction
as the business event."""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from app.domain.gst import TaxResult
from app.domain.money import ZERO, to_money


class Account(StrEnum):
    RECEIVABLE = "receivable"
    SALES = "sales"
    CGST_PAYABLE = "cgst_payable"
    SGST_PAYABLE = "sgst_payable"
    IGST_PAYABLE = "igst_payable"
    CASH = "cash"
    TDS_RECEIVABLE = "tds_receivable"


class UnbalancedEntries(ValueError):
    pass


@dataclass(frozen=True)
class Entry:
    account: Account
    debit: Decimal = ZERO
    credit: Decimal = ZERO

    def __post_init__(self) -> None:
        to_money(self.debit)
        to_money(self.credit)
        if (self.debit > ZERO) == (self.credit > ZERO):
            raise ValueError("An entry needs exactly one of debit or credit above zero")


def total_debits(entries: Sequence[Entry]) -> Decimal:
    return sum((e.debit for e in entries), ZERO)


def total_credits(entries: Sequence[Entry]) -> Decimal:
    return sum((e.credit for e in entries), ZERO)


def assert_balanced(entries: Sequence[Entry]) -> None:
    if total_debits(entries) != total_credits(entries):
        raise UnbalancedEntries("Debits and credits do not match")


def account_balance(entries: Sequence[Entry], account: Account) -> Decimal:
    """Debits minus credits for one account"""
    mine = [e for e in entries if e.account is account]
    return total_debits(mine) - total_credits(mine)


def _tax_parts(tax: TaxResult) -> list[tuple[Account, Decimal]]:
    return [
        (Account.CGST_PAYABLE, tax.cgst),
        (Account.SGST_PAYABLE, tax.sgst),
        (Account.IGST_PAYABLE, tax.igst),
    ]


def post_invoice(tax: TaxResult) -> list[Entry]:
    """Dr Receivable (total); Cr Sales (subtotal); Cr each GST payable."""
    entries: list[Entry] = []
    if tax.total > ZERO:
        entries.append(Entry(Account.RECEIVABLE, debit=tax.total))
    if tax.subtotal > ZERO:
        entries.append(Entry(Account.SALES, credit=tax.subtotal))
    entries += [Entry(a, credit=amt) for a, amt in _tax_parts(tax) if amt > ZERO]
    assert_balanced(entries)
    return entries


def post_credit_note(tax: TaxResult) -> list[Entry]:
    """The reverse of an invoice, for the credited amounts."""
    entries: list[Entry] = []
    if tax.total > ZERO:
        entries.append(Entry(Account.RECEIVABLE, credit=tax.total))
    if tax.subtotal > ZERO:
        entries.append(Entry(Account.SALES, debit=tax.subtotal))
    entries += [Entry(a, debit=amt) for a, amt in _tax_parts(tax) if amt > ZERO]
    assert_balanced(entries)
    return entries


def post_payment(cash: Decimal, tds: Decimal) -> list[Entry]:
    """Dr Cash; DR TDS receivable; Cr Receivable (cash + TDS)."""
    cash_amount = to_money(cash)
    tds_amount = to_money(tds)
    settled = cash_amount + tds_amount
    if settled <= ZERO:
        raise ValueError("Payment must be greater than zero")
    entries: list[Entry] = []
    if cash_amount > ZERO:
        entries.append(Entry(Account.CASH, debit=cash_amount))
    if tds_amount > ZERO:
        entries.append(Entry(Account.TDS_RECEIVABLE, debit=tds_amount))
    entries.append(Entry(Account.RECEIVABLE, credit=settled))
    assert_balanced(entries)
    return entries
