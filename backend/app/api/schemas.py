import uuid
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RequestModel(ApiModel):
    model_config = ConfigDict(extra="forbid")


# ---- requests ----
class ProfileIn(RequestModel):
    state_code: str = Field(min_length=2, max_length=2)
    business_name: str | None = Field(default=None, max_length=200)


class CustomerIn(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    gstin: str | None = Field(default=None, max_length=15)
    state_code: str | None = Field(default=None, min_length=2, max_length=2)


class ItemIn(RequestModel):
    description: str = Field(min_length=1, max_length=500)
    hsn_sac: str | None = Field(default=None, max_length=10)
    taxable_value: str
    gst_rate: str


class InvoiceIn(RequestModel):
    customer_id: uuid.UUID
    due_date: date
    items: list[ItemIn] = Field(min_length=1, max_length=50)
    lut_ref: str | None = Field(default=None, max_length=100)


class InvoiceUpdateIn(RequestModel):
    customer_id: uuid.UUID | None = None
    due_date: date | None = None
    items: list[ItemIn] | None = Field(default=None, min_length=1, max_length=50)
    lut_ref: str | None = Field(default=None, max_length=100)


class PaymentIn(RequestModel):
    cash_received: str
    tds_deducted: str = "0.00"
    paid_on: date | None = Field(default=None, alias="date")


# ---- responses ----
class CustomerOut(ApiModel):
    id: uuid.UUID
    name: str
    gstin: str | None = None
    state_code: str | None = None


class ItemOut(ApiModel):
    description: str
    hsn_sac: str | None = None
    taxable_value: str
    gst_rate: str


class TaxOut(ApiModel):
    cgst: str | None = None
    sgst: str | None = None
    igst: str | None = None
    zero_rated: bool | None = None
    lut_ref: str | None = None


class InvoiceOut(ApiModel):
    id: uuid.UUID
    number: str | None = None
    customer: CustomerOut
    status: str
    items: list[ItemOut]
    tax: TaxOut
    subtotal: str
    total: str
    amount_due: str
    issue_date: date | None = None
    due_date: date
    public_token: str | None = None


class InvoiceListOut(ApiModel):
    items: list[InvoiceOut]
    next_cursor: str | None = None


class PaymentOut(ApiModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    cash_received: str
    tds_deducted: str
    paid_on: date = Field(alias="date")


class SummaryOut(ApiModel):
    revenue_this_month: str
    overdue_count: int
    overdue_total: str


class GstAmountsOut(ApiModel):
    invoice_count: int
    taxable_value: str
    cgst: str
    sgst: str
    igst: str
    total_tax: str


class GstMonthOut(GstAmountsOut):
    month: str


class GstSupplyOut(GstAmountsOut):
    supply_type: str


class GstSummaryOut(ApiModel):
    from_date: date
    to_date: date
    months: list[GstMonthOut]
    by_supply_type: list[GstSupplyOut]
    totals: GstAmountsOut


class HsnRowOut(GstAmountsOut):
    hsn_sac: str


class HsnSummaryOut(ApiModel):
    from_date: date
    to_date: date
    rows: list[HsnRowOut]


class TdsRowOut(ApiModel):
    customer_id: uuid.UUID
    customer_name: str
    payment_count: int
    cash_received: str
    tds_deducted: str


class TdsReportOut(ApiModel):
    financial_year: str
    from_date: date
    to_date: date
    rows: list[TdsRowOut]
    total_cash_received: str
    total_tds_deducted: str


class AgingBucketOut(ApiModel):
    bucket: str
    invoice_count: int
    amount_due: str


class AgingOut(ApiModel):
    as_of: date
    buckets: list[AgingBucketOut]
    total_due: str


class ShareLinkOut(ApiModel):
    token: str
    path: str


class PublicInvoiceOut(ApiModel):
    number: str | None = None
    status: str
    supplier_name: str | None = None
    customer_name: str
    items: list[ItemOut]
    tax: TaxOut
    subtotal: str
    total: str
    amount_due: str
    issue_date: date | None = None
    due_date: date


class ChatIn(RequestModel):
    thread_id: uuid.UUID | None = None
    message: str = Field(min_length=1, max_length=2000)


class ResumeIn(RequestModel):
    thread_id: uuid.UUID
    approval_id: uuid.UUID
    decision: Literal["approve", "reject", "edit"]
    edits: dict[str, Any] | None = None


class PaymentEditIn(RequestModel):
    cash_received: str | None = None
    tds_deducted: str | None = None
    paid_on: date | None = Field(default=None, alias="date")
