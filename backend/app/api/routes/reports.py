from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.api.deps import DbDep, UserDep
from app.api.schemas import (
    AgingBucketOut,
    AgingOut,
    GstAmountsOut,
    GstMonthOut,
    GstSummaryOut,
    GstSupplyOut,
    HsnRowOut,
    HsnSummaryOut,
    SummaryOut,
    TdsReportOut,
    TdsRowOut,
)
from app.core.clock import today_ist
from app.core.errors import Unprocessable
from app.domain.invoice_rules import financial_year, financial_year_bounds
from app.domain.money import ZERO, money_str
from app.services import reports

router = APIRouter(prefix="/reports", tags=["reports"])

FromParam = Annotated[date | None, Query(alias="from")]
ToParam = Annotated[date | None, Query(alias="to")]


def _amounts(a: reports.Amounts) -> dict[str, Any]:
    return {
        "invoice_count": a.count,
        "taxable_value": money_str(a.taxable),
        "cgst": money_str(a.cgst),
        "sgst": money_str(a.sgst),
        "igst": money_str(a.igst),
        "total_tax": money_str(a.total_tax),
    }


@router.get("/summary", response_model=SummaryOut)
def get_summary(user: UserDep, db: DbDep) -> SummaryOut:
    s = reports.summary(db, user.id, today_ist())
    return SummaryOut(
        revenue_this_month=money_str(s.revenue_this_month),
        overdue_count=s.overdue_count,
        overdue_total=money_str(s.overdue_total),
    )


@router.get("/gst-summary", response_model=GstSummaryOut)
def get_gst_summary(
    user: UserDep, db: DbDep, from_date: FromParam = None, to_date: ToParam = None
) -> GstSummaryOut:
    start, end = reports.resolve_range(from_date, to_date, today_ist())
    months, by_supply, totals = reports.gst_summary(db, user.id, start, end)
    return GstSummaryOut(
        from_date=start,
        to_date=end,
        months=[GstMonthOut(month=m, **_amounts(a)) for m, a in months.items()],
        by_supply_type=[GstSupplyOut(supply_type=s, **_amounts(a)) for s, a in by_supply.items()],
        totals=GstAmountsOut(**_amounts(totals)),
    )


@router.get("/hsn-summary", response_model=HsnSummaryOut)
def get_hsn_summary(
    user: UserDep, db: DbDep, from_date: FromParam = None, to_date: ToParam = None
) -> HsnSummaryOut:
    start, end = reports.resolve_range(from_date, to_date, today_ist())
    rows = reports.hsn_summary(db, user.id, start, end)
    return HsnSummaryOut(
        from_date=start,
        to_date=end,
        rows=[HsnRowOut(hsn_sac=code, **_amounts(a)) for code, a in rows],
    )


@router.get("/tds", response_model=TdsReportOut)
def get_tds_report(
    user: UserDep,
    db: DbDep,
    fy: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
) -> TdsReportOut:
    year = fy or financial_year(today_ist())
    try:
        start, end = financial_year_bounds(year)
    except ValueError as exc:
        raise Unprocessable("invalid_financial_year", str(exc)) from None
    rows = reports.tds_report(db, user.id, start, end)
    return TdsReportOut(
        financial_year=year,
        from_date=start,
        to_date=end,
        rows=[
            TdsRowOut(
                customer_id=r.customer_id,
                customer_name=r.customer_name,
                payment_count=r.payment_count,
                cash_received=money_str(r.cash_received),
                tds_deducted=money_str(r.tds_deducted),
            )
            for r in rows
        ],
        total_cash_received=money_str(sum((r.cash_received for r in rows), ZERO)),
        total_tds_deducted=money_str(sum((r.tds_deducted for r in rows), ZERO)),
    )


@router.get("/receivables-aging", response_model=AgingOut)
def get_receivables_aging(user: UserDep, db: DbDep) -> AgingOut:
    today = today_ist()
    buckets = reports.receivables_aging(db, user.id, today)
    return AgingOut(
        as_of=today,
        buckets=[
            AgingBucketOut(bucket=name, invoice_count=count, amount_due=money_str(total))
            for name, (count, total) in buckets.items()
        ],
        total_due=money_str(sum((t for _, t in buckets.values()), ZERO)),
    )
