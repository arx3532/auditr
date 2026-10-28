from typing import Annotated

from fastapi import APIRouter, Response
from fastapi import Path as PathParam

from app.api.deps import DbDep
from app.api.mappers import public_invoice_out
from app.api.schemas import PublicInvoiceOut
from app.core.clock import today_ist
from app.core.errors import NotFound
from app.db import repositories as repo

router = APIRouter(prefix="/public", tags=["public"])

TokenParam = Annotated[str, PathParam(min_length=20, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]


@router.get("/invoices/{token}", response_model=PublicInvoiceOut, response_model_exclude_none=True)
def read_public_invoice(token: TokenParam, response: Response, db: DbDep) -> PublicInvoiceOut:
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    found = repo.get_invoice_by_public_token(db, token)
    if found is None:  # unknown, revoked, or not shareable: all look the same
        raise NotFound("invoice_not_found", "This link is invalid or has been turned off")
    invoice, business_name = found
    return public_invoice_out(invoice, business_name, today_ist())
