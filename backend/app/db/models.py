import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

MONEY = Numeric(14, 2)
RATE = Numeric(5, 2)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    auth_id: Mapped[str] = mapped_column(String(255), unique=True)
    state_code: Mapped[str | None] = mapped_column(String(2), default=None)
    business_name: Mapped[str | None] = mapped_column(String(200), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    gstin: Mapped[str | None] = mapped_column(String(15), default=None)
    state_code: Mapped[str] = mapped_column(String(2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("user_id", "number", name="uq_invoices_user_id_number"),
        CheckConstraint(
            "status IN ('draft','issued','partially_paid','paid','cancelled')",
            name="status_valid",
        ),
        CheckConstraint(
            "subtotal >= 0 AND cgst >= 0 AND sgst >= 0 AND igst >= 0 "
            "AND total >= 0 AND amount_due >= 0",
            name="amounts_non_negative",
        ),
        CheckConstraint("amount_due <= total", name="due_not_above_total"),
        Index("ix_invoices_user_status_due", "user_id", "status", "due_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"))
    number: Mapped[str | None] = mapped_column(String(16), default=None)
    status: Mapped[str] = mapped_column(String(20))
    supply_type: Mapped[str] = mapped_column(String(20))
    lut_ref: Mapped[str | None] = mapped_column(String(100), default=None)
    public_token: Mapped[str | None] = mapped_column(String(64), unique=True, default=None)
    issue_date: Mapped[date | None] = mapped_column(Date, default=None)
    due_date: Mapped[date] = mapped_column(Date)
    subtotal: Mapped[Decimal] = mapped_column(MONEY)
    cgst: Mapped[Decimal] = mapped_column(MONEY)
    sgst: Mapped[Decimal] = mapped_column(MONEY)
    igst: Mapped[Decimal] = mapped_column(MONEY)
    total: Mapped[Decimal] = mapped_column(MONEY)
    amount_due: Mapped[Decimal] = mapped_column(MONEY)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped[Customer] = relationship(lazy="selectin")
    items: Mapped[list["InvoiceItem"]] = relationship(
        order_by="InvoiceItem.position", cascade="all, delete-orphan", lazy="selectin"
    )


class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    __table_args__ = (
        CheckConstraint(
            "taxable_value >= 0 AND gst_rate >= 0 AND cgst >= 0 AND sgst >= 0 AND igst >= 0",
            name="amounts_non_negative",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(500))
    hsn_sac: Mapped[str | None] = mapped_column(String(10), default=None)
    taxable_value: Mapped[Decimal] = mapped_column(MONEY)
    gst_rate: Mapped[Decimal] = mapped_column(RATE)
    cgst: Mapped[Decimal] = mapped_column(MONEY)
    sgst: Mapped[Decimal] = mapped_column(MONEY)
    igst: Mapped[Decimal] = mapped_column(MONEY)


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(
            "cash_received >= 0 AND tds_deducted >= 0 AND cash_received + tds_deducted > 0",
            name="amounts_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), index=True)
    cash_received: Mapped[Decimal] = mapped_column(MONEY)
    tds_deducted: Mapped[Decimal] = mapped_column(MONEY)
    paid_on: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    __table_args__ = (
        CheckConstraint(
            "debit >= 0 AND credit >= 0 AND "
            "((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))",
            name="one_side",
        ),
        Index("ix_ledger_entries_source", "source_type", "source_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    source_type: Mapped[str] = mapped_column(String(20))  # 'invoice' or 'payment'
    source_id: Mapped[uuid.UUID] = mapped_column(Uuid)  # no FK: it points at two tables
    account: Mapped[str] = mapped_column(String(30))
    debit: Mapped[Decimal] = mapped_column(MONEY)
    credit: Mapped[Decimal] = mapped_column(MONEY)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InvoiceNumberSequence(Base):
    __tablename__ = "invoice_number_sequences"
    __table_args__ = (CheckConstraint("last_number >= 0", name="non_negative"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    financial_year: Mapped[str] = mapped_column(String(7), primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0)


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    request_hash: Mapped[str] = mapped_column(String(64))
    response_status: Mapped[int | None] = mapped_column(Integer, default=None)
    response_body: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatThread(Base):
    """One conversation. Its id is also the LangGraph thread id. The pending_* columns
    describe the single approval the conversation is waiting on, if any."""

    __tablename__ = "chat_threads"
    __table_args__ = (
        CheckConstraint(
            "pending_kind IS NULL OR pending_kind IN ('issue_invoice','record_payment')",
            name="pending_kind_valid",
        ),
        CheckConstraint(
            "(pending_approval_id IS NULL) = (pending_kind IS NULL) "
            "AND (pending_approval_id IS NULL) = (pending_expires_at IS NULL)",
            name="pending_fields_together",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    pending_approval_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, default=None)
    pending_kind: Mapped[str | None] = mapped_column(String(20), default=None)
    pending_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("invoices.id"), default=None
    )
    pending_args: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)
    pending_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
