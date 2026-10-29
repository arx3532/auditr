from datetime import date
from typing import Any

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.mappers import invoice_out
from app.db import repositories as repo
from app.db.models import ChatThread
from app.domain.money import money_str
from app.services import approvals, invoicing


def _dump(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(mode="json", by_alias=True, exclude_none=True)


def build_approval_payload(db: Session, thread: ChatThread, today: date) -> dict[str, Any] | None:
    if (
        thread.pending_approval_id is None
        or thread.pending_invoice_id is None
        or thread.pending_expires_at is None
    ):
        return None
    invoice = repo.get_invoice(db, thread.user_id, thread.pending_invoice_id)
    if invoice is None:
        return None
    payload: dict[str, Any] = {
        "approvalId": str(thread.pending_approval_id),
        "kind": thread.pending_kind,
        "expiresAt": thread.pending_expires_at.isoformat(),
    }
    if thread.pending_kind == approvals.ISSUE_INVOICE:
        payload["draft"] = _dump(invoice_out(invoice, today))
        return payload

    args = thread.pending_args or {}
    plan = invoicing.preview_payment(
        db,
        thread.user_id,
        invoice.id,
        cash_received=args["cash_received"],
        tds_deducted=args["tds_deducted"],
        paid_on=date.fromisoformat(args["paid_on"]),
        today=today,
    )
    payload["payment"] = {
        "invoice": _dump(invoice_out(invoice, today)),
        "cashReceived": money_str(plan.cash_received),
        "tdsDeducted": money_str(plan.tds_deducted),
        "date": plan.paid_on.isoformat(),
        "amountDueAfter": money_str(plan.amount_due_after),
        "statusAfter": plan.status_after.value,
    }
    return payload
