from datetime import date

import pytest

from app.domain.invoice_rules import aging_bucket, financial_year_bounds
from app.services.exports import csv_safe


def test_financial_year_bounds() -> None:
    assert financial_year_bounds("2026-27") == (date(2026, 4, 1), date(2027, 3, 31))
    assert financial_year_bounds("2099-00") == (date(2099, 4, 1), date(2100, 3, 31))


@pytest.mark.parametrize("bad", ["2026", "2026-28", "26-27", "2026/27", "abcd-ef", ""])
def test_financial_year_bounds_rejects_bad_input(bad: str) -> None:
    with pytest.raises(ValueError):
        financial_year_bounds(bad)


@pytest.mark.parametrize(
    ("days_overdue", "bucket"),
    [
        (-5, "not_due"),
        (0, "not_due"),
        (1, "1_30"),
        (30, "1_30"),
        (31, "31_60"),
        (60, "31_60"),
        (61, "61_90"),
        (90, "61_90"),
        (91, "90_plus"),
    ],
)
def test_aging_bucket(days_overdue: int, bucket: str) -> None:
    today = date(2026, 6, 30)
    due = date.fromordinal(today.toordinal() - days_overdue)
    assert aging_bucket(due, today) == bucket


@pytest.mark.parametrize("risky", ["=1+1", "+cmd", "-cmd", "@SUM(A1)", "\tcmd", "\rcmd"])
def test_csv_safe_neutralises_formulas(risky: str) -> None:
    assert csv_safe(risky) == "'" + risky


def test_csv_safe_leaves_normal_text_alone() -> None:
    assert csv_safe("AdTech Pvt. Ltd.") == "AdTech Pvt. Ltd."
    assert csv_safe("a=b") == "a=b"
    assert csv_safe("") == ""