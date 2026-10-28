import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Header, Query
from fastapi.responses import JSONResponse

from app.api.deps import DbDep, UserDep
from app.api.mappers import invoice_out, payment_out
from app.api.schemas import InvoiceIn, InvoiceListOut, InvoiceOut, PaymentIn, PaymentOut
from app.core.clock import today_ist
from app.core.errors import NotFound
from app.db import repositories as repo
from app.services import invoicing
from app.services.idempotency import request_hash, run_idempotent

router = APIRouter(prefix="/invoices", tags=["invoices"])

IdempotencyKeyHeader = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$"),
]


@router.post("", status_code=201, response_model=InvoiceOut, response_model_exclude_none=True)
def create_invoice(body: InvoiceIn, user: UserDep, db: DbDep) -> InvoiceOut:
    today = today_ist()
    invoice = invoicing.create_draft(
        db,
        user,
        customer_id=body.customer_id,
        due_date=body.due_date,
        items=[
            invoicing.ItemInput(i.description, i.hsn_sac, i.taxable_value, i.gst_rate)
            for i in body.items
        ],
        lut_ref=body.lut_ref,
        today=today,
    )
    return invoice_out(invoice, today)


@router.get("", response_model=InvoiceListOut, response_model_exclude_none=True)
def list_invoices(
    user: UserDep,
    db: DbDep,
    status: Annotated[str | None, Query()] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> InvoiceListOut:
    today = today_ist()
    rows, next_cursor = repo.list_invoices(
        db, user.id, status=status, today=today, cursor=cursor, limit=limit
    )
    return InvoiceListOut(items=[invoice_out(r, today) for r in rows], next_cursor=next_cursor)


@router.get("/{invoice_id}", response_model=InvoiceOut, response_model_exclude_none=True)
def read_invoice(invoice_id: uuid.UUID, user: UserDep, db: DbDep) -> InvoiceOut:
    invoice = repo.get_invoice(db, user.id, invoice_id)
    if invoice is None:
        raise NotFound("invoice_not_found", "Invoice not found")
    return invoice_out(invoice, today_ist())


@router.get(
    "/{invoice_id}/payments", response_model=list[PaymentOut], response_model_exclude_none=True
)
def read_payments(invoice_id: uuid.UUID, user: UserDep, db: DbDep) -> list[PaymentOut]:
    if repo.get_invoice(db, user.id, invoice_id) is None:
        raise NotFound("invoice_not_found", "Invoice not found")
    return [payment_out(p) for p in repo.list_payments(db, user.id, invoice_id)]


@router.post("/{invoice_id}/issue")
def issue_invoice(
    invoice_id: uuid.UUID, user: UserDep, db: DbDep, key: IdempotencyKeyHeader
) -> JSONResponse:
    today = today_ist()

    def handler() -> tuple[int, dict[str, Any]]:
        invoice = invoicing.issue_invoice(db, user.id, invoice_id, today)
        body = invoice_out(invoice, today).model_dump(mode="json", by_alias=True, exclude_none=True)
        return 200, body

    status_code, body = run_idempotent(
        db, user.id, key, request_hash("POST", f"/invoices/{invoice_id}/issue", {}), handler
    )
    return JSONResponse(status_code=status_code, content=body)


@router.post("/{invoice_id}/payments")
def record_payment(
    invoice_id: uuid.UUID,
    body: PaymentIn,
    user: UserDep,
    db: DbDep,
    key: IdempotencyKeyHeader,
) -> JSONResponse:
    today = today_ist()

    def handler() -> tuple[int, dict[str, Any]]:
        invoice, payment = invoicing.record_payment(
            db,
            user.id,
            invoice_id,
            cash_received=body.cash_received,
            tds_deducted=body.tds_deducted,
            paid_on=body.paid_on,
            today=today,
        )
        return 201, {
            "payment": payment_out(payment).model_dump(
                mode="json", by_alias=True, exclude_none=True
            ),
            "invoice": invoice_out(invoice, today).model_dump(
                mode="json", by_alias=True, exclude_none=True
            ),
        }

    status_code, response = run_idempotent(
        db,
        user.id,
        key,
        request_hash(
            "POST",
            f"/invoices/{invoice_id}/payments",
            body.model_dump(mode="json", by_alias=True),
        ),
        handler,
    )
    return JSONResponse(status_code=status_code, content=response)
