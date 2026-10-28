from decimal import Decimal

import pytest
from hypothesis import assume, given
from hypothesis import strategies as st

from app.domain.gst import LineInput, SupplyType, compute_tax
from app.domain.ledger import (
    Account,
    Entry,
    UnbalancedEntries,
    account_balance,
    assert_balanced,
    post_credit_note,
    post_invoice,
    post_payment,
)

RATES = [Decimal("0"), Decimal("5"), Decimal("18")]  # test values only
ALLOWED = frozenset(RATES)


def sample_tax(supply: SupplyType = SupplyType.INTRA_STATE):  # type: ignore[no-untyped-def]
    return compute_tax([LineInput(Decimal("50000.00"), Decimal("18"))], supply, ALLOWED)


def test_invoice_postings() -> None:
    entries = post_invoice(sample_tax())
    assert account_balance(entries, Account.RECEIVABLE) == Decimal("59000.00")
    assert account_balance(entries, Account.SALES) == Decimal("-50000.00")
    assert account_balance(entries, Account.CGST_PAYABLE) == Decimal("-4500.00")


def test_payment_with_tds_clears_receivable() -> None:
    invoice = post_invoice(sample_tax())
    payment = post_payment(Decimal("53100.00"), Decimal("5900.00"))
    assert account_balance(invoice + payment, Account.RECEIVABLE) == Decimal("0.00")
    assert account_balance(payment, Account.TDS_RECEIVABLE) == Decimal("5900.00")


def test_credit_note_reverses_invoice() -> None:
    tax = sample_tax()
    entries = post_invoice(tax) + post_credit_note(tax)
    for account in Account:
        assert account_balance(entries, account) == Decimal("0.00")


def test_entry_needs_exactly_one_side() -> None:
    with pytest.raises(ValueError):
        Entry(Account.CASH)
    with pytest.raises(ValueError):
        Entry(Account.CASH, debit=Decimal("1.00"), credit=Decimal("1.00"))


def test_unbalanced_entries_detected() -> None:
    with pytest.raises(UnbalancedEntries):
        assert_balanced([Entry(Account.CASH, debit=Decimal("10.00"))])


def test_zero_payment_rejected() -> None:
    with pytest.raises(ValueError):
        post_payment(Decimal("0.00"), Decimal("0.00"))


amounts = st.decimals(min_value=Decimal("0"), max_value=Decimal("1000000"), places=2)
line_lists = st.lists(st.tuples(amounts, st.sampled_from(RATES)), min_size=1, max_size=5)


@given(lines=line_lists, supply=st.sampled_from(list(SupplyType)))
def test_invoice_always_balances_and_totals_agree(
    lines: list[tuple[Decimal, Decimal]], supply: SupplyType
) -> None:
    tax = compute_tax([LineInput(v, r) for v, r in lines], supply, ALLOWED)
    entries = post_invoice(tax)  # raises if unbalanced
    assert tax.cgst == tax.sgst
    assert tax.total == tax.subtotal + tax.total_tax
    assert account_balance(entries, Account.RECEIVABLE) == tax.total


@given(
    lines=line_lists,
    supply=st.sampled_from(list(SupplyType)),
    data=st.data(),
)
def test_payments_reduce_receivable_exactly(
    lines: list[tuple[Decimal, Decimal]], supply: SupplyType, data: st.DataObject
) -> None:
    tax = compute_tax([LineInput(v, r) for v, r in lines], supply, ALLOWED)
    total_cents = int(tax.total * 100)
    assume(total_cents > 0)
    paid_cents = data.draw(st.integers(min_value=1, max_value=total_cents))
    tds_cents = data.draw(st.integers(min_value=0, max_value=paid_cents))
    cash = Decimal(paid_cents - tds_cents) / 100
    tds = Decimal(tds_cents) / 100
    entries = post_invoice(tax) + post_payment(cash, tds)
    expected = tax.total - Decimal(paid_cents) / 100
    assert account_balance(entries, Account.RECEIVABLE) == expected
