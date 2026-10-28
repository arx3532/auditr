import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RequestModel(ApiModel):
    model_config = ConfigDict(extra="forbid")


# ---- requests ----
class ProfileIn(RequestModel):
    state_code: str = Field(min_length=2, max_length=2)


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
