from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import DbDep, UserDep
from app.core.clock import today_ist
from app.services import exports, reports

router = APIRouter(prefix="/exports", tags=["exports"])

FromParam = Annotated[date | None, Query(alias="from")]
ToParam = Annotated[date | None, Query(alias="to")]


def _csv_response(content: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/invoices.csv")
def export_invoices(
    user: UserDep, db: DbDep, from_date: FromParam = None, to_date: ToParam = None
) -> Response:
    start, end = reports.resolve_range(from_date, to_date, today_ist())
    content = exports.invoices_csv(db, user.id, start, end)
    return _csv_response(content, f"invoices_{start}_{end}.csv")


@router.get("/payments.csv")
def export_payments(
    user: UserDep, db: DbDep, from_date: FromParam = None, to_date: ToParam = None
) -> Response:
    start, end = reports.resolve_range(from_date, to_date, today_ist())
    content = exports.payments_csv(db, user.id, start, end)
    return _csv_response(content, f"payments_{start}_{end}.csv")
