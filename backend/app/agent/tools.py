"""Tools the model may call. Read tools run at once. The two action tools never change
money: they create a draft or a proposal and open an approval for the user."""

import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from app.agent.llm.schema import json_schema_for
from app.agent.llm.types import ToolSpec
from app.db import repositories as repo
from app.db.models import Customer, User
from app.domain.invoice_rules import InvoiceStatus, is_overdue
from app.domain.money import money_str
from app.services import approvals, invoicing, reports


class ToolError(Exception):
    """A problem the model can fix itself. The message is shown to the model."""


def _number_to_text(value: Any) -> Any:
    """Models often send amounts as JSON numbers. Accept them as text, never as floats
    in arithmetic: the text goes straight to the Decimal-based money code."""
    if isinstance(value, bool):
        raise ValueError("Expected a number or text, not true/false")
    if isinstance(value, int | float):
        return str(value)
    return value


class ToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NoArgs(ToolArgs):
    pass


class ListInvoicesArgs(ToolArgs):
    status: Literal["draft", "issued", "partially_paid", "paid", "cancelled", "overdue"] | None = (
        None
    )
    customer_name: str | None = None
    limit: int = Field(default=10, ge=1, le=20)


class ItemArgs(ToolArgs):
    description: str = Field(min_length=1, max_length=500)
    taxable_value: str
    gst_rate: str
    hsn_sac: str | None = None

    @field_validator("taxable_value", "gst_rate", mode="before")
    @classmethod
    def _numbers_as_text(cls, value: Any) -> Any:
        return _number_to_text(value)


class CreateInvoiceDraftArgs(ToolArgs):
    customer_name: str = Field(min_length=1, max_length=200)
    due_date: date
    items: list[ItemArgs] = Field(min_length=1, max_length=20)


class RecordPaymentArgs(ToolArgs):
    invoice_number: str = Field(min_length=1, max_length=40)
    cash_received: str
    tds_deducted: str = "0.00"
    paid_on: date | None = None

    @field_validator("cash_received", "tds_deducted", mode="before")
    @classmethod
    def _numbers_as_text(cls, value: Any) -> Any:
        return _number_to_text(value)


def validation_summary(exc: ValidationError) -> str:
    """A short description of what was wrong, without echoing the input values."""
    parts = [f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()]
    return "; ".join(parts)[:400]


def _resolve_customer(db: Session, user_id: uuid.UUID, name: str) -> Customer:
    matches = repo.find_customers(db, user_id, name)
    if not matches:
        raise ToolError(f"No customer matches '{name}'. Use list_customers to see the names.")
    if len(matches) > 1:
        names = ", ".join(m.name for m in matches)
        raise ToolError(f"More than one customer matches: {names}. Ask the user which one.")
    return matches[0]


# ---------- read tools ----------


def _list_customers(db: Session, user: User, _args: Any, _today: date) -> dict[str, Any]:
    rows = repo.list_customers(db, user.id)
    return {"customers": [{"name": c.name, "state_code": c.state_code} for c in rows]}


def _list_invoices(db: Session, user: User, args: ListInvoicesArgs, today: date) -> dict[str, Any]:
    customer_id = None
    if args.customer_name:
        customer_id = _resolve_customer(db, user.id, args.customer_name).id
    rows = repo.search_invoices(
        db, user.id, status=args.status, customer_id=customer_id, today=today, limit=args.limit
    )
    return {
        "invoices": [
            {
                "number": i.number or "(draft)",
                "customer": i.customer.name,
                "status": "overdue"
                if is_overdue(InvoiceStatus(i.status), i.due_date, today)
                else i.status,
                "total": money_str(i.total),
                "amount_due": money_str(i.amount_due),
                "due_date": i.due_date.isoformat(),
            }
            for i in rows
        ]
    }


def _get_summary(db: Session, user: User, _args: Any, today: date) -> dict[str, Any]:
    s = reports.summary(db, user.id, today)
    return {
        "revenue_this_month_before_gst": money_str(s.revenue_this_month),
        "overdue_count": s.overdue_count,
        "overdue_total": money_str(s.overdue_total),
    }


def _aging(db: Session, user: User, _args: Any, today: date) -> dict[str, Any]:
    buckets = reports.receivables_aging(db, user.id, today)
    return {
        "as_of": today.isoformat(),
        "buckets": [
            {"bucket": name, "invoice_count": count, "amount_due": money_str(total)}
            for name, (count, total) in buckets.items()
        ],
    }


# ---------- registry ----------


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args_model: type[ToolArgs]
    gated: bool = False
    run: Callable[[Session, User, Any, date], dict[str, Any]] | None = None


TOOLS: tuple[Tool, ...] = (
    Tool(
        "list_customers",
        "List the user's customers (name and state code).",
        NoArgs,
        run=_list_customers,
    ),  # fmt: skip
    Tool(
        "list_invoices",
        "List recent invoices, newest first. Optionally filter by status or customer name.",
        ListInvoicesArgs,
        run=_list_invoices,
    ),  # fmt: skip
    Tool(
        "get_summary",
        "Revenue issued this month (before GST) and overdue totals.",
        NoArgs,
        run=_get_summary,
    ),  # fmt: skip
    Tool(
        "receivables_aging",
        "Outstanding invoice amounts grouped by days overdue.",
        NoArgs,
        run=_aging,
    ),  # fmt: skip
    Tool(
        "create_invoice_draft",
        "Create a DRAFT invoice. The user reviews it and must approve it before it is "
        "issued. Amounts are before GST. gst_rate is the percentage the USER stated. "
        "Never guess it.",
        CreateInvoiceDraftArgs,
        gated=True,
    ),
    Tool(
        "record_payment",
        "Propose recording a payment received against an issued invoice. The user must "
        "approve before anything is recorded. tds_deducted is TDS the customer withheld "
        "(default 0).",
        RecordPaymentArgs,
        gated=True,
    ),
)

_BY_NAME = {t.name: t for t in TOOLS}
TOOL_SPECS = [ToolSpec(t.name, t.description, json_schema_for(t.args_model)) for t in TOOLS]


def get_tool(name: str) -> Tool | None:
    return _BY_NAME.get(name)


# ---------- gated tools: open an approval, change no money ----------


def _thread_for_update(db: Session, user_id: uuid.UUID, thread_id: uuid.UUID) -> Any:
    thread = repo.get_thread(db, user_id, thread_id, for_update=True)
    if thread is None:
        raise ToolError("Conversation not found")
    return thread


def _prepare_draft(
    db: Session,
    user: User,
    thread_id: uuid.UUID,
    args: CreateInvoiceDraftArgs,
    today: date,
    now: datetime,
) -> str:
    customer = _resolve_customer(db, user.id, args.customer_name)
    invoice = invoicing.create_draft(
        db,
        user,
        customer_id=customer.id,
        due_date=args.due_date,
        items=[
            invoicing.ItemInput(i.description, i.hsn_sac, i.taxable_value, i.gst_rate)
            for i in args.items
        ],
        lut_ref=None,
        today=today,
    )
    approvals.open_issue_approval(db, _thread_for_update(db, user.id, thread_id), invoice.id, now)
    return approvals.ISSUE_INVOICE


def _prepare_payment(
    db: Session,
    user: User,
    thread_id: uuid.UUID,
    args: RecordPaymentArgs,
    today: date,
    now: datetime,
) -> str:
    invoice = repo.get_invoice_by_number(db, user.id, args.invoice_number.strip())
    if invoice is None:
        raise ToolError(
            f"No invoice has the number {args.invoice_number}. Use list_invoices to find it."
        )
    plan = invoicing.preview_payment(
        db,
        user.id,
        invoice.id,
        cash_received=args.cash_received,
        tds_deducted=args.tds_deducted,
        paid_on=args.paid_on,
        today=today,
    )
    approvals.open_payment_approval(
        db,
        _thread_for_update(db, user.id, thread_id),
        invoice.id,
        {
            "cash_received": money_str(plan.cash_received),
            "tds_deducted": money_str(plan.tds_deducted),
            "paid_on": plan.paid_on.isoformat(),
        },
        now,
    )
    return approvals.RECORD_PAYMENT


@dataclass(frozen=True)
class ToolRun:
    text: str | None  # result for the model (read tools); None when an approval was opened
    pending_kind: str | None  # set when an approval was opened


def execute_tool(
    session_factory: Callable[[], Session],
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
    tool: Tool,
    args: Any,
    today: date,
    now: datetime,
) -> ToolRun:
    """Synchronous. The graph calls it in a worker thread, with its own database session."""
    with session_factory() as db:
        user = db.get(User, user_id)
        if user is None:
            raise ToolError("User not found")
        if not tool.gated:
            assert tool.run is not None
            return ToolRun(json.dumps(tool.run(db, user, args, today), ensure_ascii=False), None)
        if tool.name == "create_invoice_draft":
            return ToolRun(None, _prepare_draft(db, user, thread_id, args, today, now))
        return ToolRun(None, _prepare_payment(db, user, thread_id, args, today, now))
