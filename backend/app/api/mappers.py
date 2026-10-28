from datetime import date
from decimal import Decimal

from app.api.schemas import (
    CustomerOut,
    InvoiceOut,
    ItemOut,
    PaymentOut,
    PublicInvoiceOut,
    TaxOut,
)
from app.db.models import Customer, Invoice, Payment
from app.domain.gst import SupplyType
from app.domain.invoice_rules import InvoiceStatus, is_overdue
from app.domain.money import money_str


def _rate(value: Decimal) -> str:
    return format(value.normalize(), "f")  # 18.00 -> "18", 40.00 -> "40"


def customer_out(c: Customer) -> CustomerOut:
    return CustomerOut(id=c.id, name=c.name, gstin=c.gstin, state_code=c.state_code)


def _tax_out(inv: Invoice) -> TaxOut:
    if inv.supply_type == SupplyType.INTRA_STATE.value:
        return TaxOut(cgst=money_str(inv.cgst), sgst=money_str(inv.sgst))
    if inv.supply_type == SupplyType.INTER_STATE.value:
        return TaxOut(igst=money_str(inv.igst))
    return TaxOut(zero_rated=True, lut_ref=inv.lut_ref)


def _items_out(inv: Invoice) -> list[ItemOut]:
    return [
        ItemOut(
            description=i.description,
            hsn_sac=i.hsn_sac,
            taxable_value=money_str(i.taxable_value),
            gst_rate=_rate(i.gst_rate),
        )
        for i in inv.items
    ]


def _status(inv: Invoice, today: date) -> str:
    overdue = is_overdue(InvoiceStatus(inv.status), inv.due_date, today)
    return "overdue" if overdue else inv.status


def invoice_out(inv: Invoice, today: date) -> InvoiceOut:
    return InvoiceOut(
        id=inv.id,
        number=inv.number,
        customer=customer_out(inv.customer),
        status=_status(inv, today),
        items=_items_out(inv),
        tax=_tax_out(inv),
        subtotal=money_str(inv.subtotal),
        total=money_str(inv.total),
        amount_due=money_str(inv.amount_due),
        issue_date=inv.issue_date,
        due_date=inv.due_date,
        public_token=inv.public_token,
    )


def public_invoice_out(inv: Invoice, business_name: str | None, today: date) -> PublicInvoiceOut:
    """What the customer sees. No internal ids and no customer GSTIN."""
    return PublicInvoiceOut(
        number=inv.number,
        status=_status(inv, today),
        supplier_name=business_name,
        customer_name=inv.customer.name,
        items=_items_out(inv),
        tax=_tax_out(inv),
        subtotal=money_str(inv.subtotal),
        total=money_str(inv.total),
        amount_due=money_str(inv.amount_due),
        issue_date=inv.issue_date,
        due_date=inv.due_date,
    )


def payment_out(p: Payment) -> PaymentOut:
    return PaymentOut(
        id=p.id,
        invoice_id=p.invoice_id,
        cash_received=money_str(p.cash_received),
        tds_deducted=money_str(p.tds_deducted),
        paid_on=p.paid_on,
    )
