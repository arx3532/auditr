import csv
import io
import uuid
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.core.clock import today_ist
from app.db.models import Invoice
from app.db.session import SessionLocal
from tests.test_invoicing import draft, hdr, issue, make_customer, pay, setup_user


def set_due_days_ago(invoice_id: str, days: int) -> None:
    with SessionLocal() as s:
        s.execute(
            update(Invoice)
            .where(Invoice.id == uuid.UUID(invoice_id))
            .values(due_date=today_ist() - timedelta(days=days))
        )
        s.commit()


def issued_invoice(client: TestClient, h: dict[str, str], cid: str, **kw: Any) -> dict[str, Any]:
    inv = draft(client, h, cid, **kw).json()
    assert issue(client, h, inv["id"]).status_code == 200
    return dict(inv)


def parse_csv(response: Any) -> list[list[str]]:
    return list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))


# ---------- summary ----------


def test_summary_starts_at_zero(client: TestClient) -> None:
    h = setup_user(client, "a")
    r = client.get("/reports/summary", headers=h)
    assert r.status_code == 200
    assert r.json() == {"revenueThisMonth": "0.00", "overdueCount": 0, "overdueTotal": "0.00"}


def test_summary_counts_issued_not_drafts(client: TestClient) -> None:
    h = setup_user(client, "a")
    cid = make_customer(client, h)
    draft(client, h, cid)  # stays a draft
    issued_invoice(client, h, cid)
    body = client.get("/reports/summary", headers=h).json()
    assert body["revenueThisMonth"] == "50000.00"  # before GST
    assert body["overdueCount"] == 0


def test_summary_overdue(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = issued_invoice(client, h, make_customer(client, h))
    set_due_days_ago(inv["id"], 3)
    body = client.get("/reports/summary", headers=h).json()
    assert body["overdueCount"] == 1
    assert body["overdueTotal"] == "59000.00"


# ---------- GST and HSN ----------


def test_gst_summary_totals(client: TestClient) -> None:
    h = setup_user(client, "a", "32")
    issued_invoice(client, h, make_customer(client, h, "32"))  # intra-state
    issued_invoice(client, h, make_customer(client, h, "29"))  # inter-state
    body = client.get("/reports/gst-summary", headers=h).json()
    month = today_ist().strftime("%Y-%m")
    assert [m["month"] for m in body["months"]] == [month]
    assert body["totals"] == {
        "invoiceCount": 2,
        "taxableValue": "100000.00",
        "cgst": "4500.00",
        "sgst": "4500.00",
        "igst": "9000.00",
        "totalTax": "18000.00",
    }
    assert {s["supplyType"] for s in body["bySupplyType"]} == {"intra_state", "inter_state"}


def test_gst_summary_range_validation(client: TestClient) -> None:
    h = setup_user(client, "a")
    r = client.get("/reports/gst-summary?from=2026-06-01&to=2026-05-01", headers=h)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_range"
    r = client.get("/reports/gst-summary?from=2020-01-01", headers=h)
    assert r.json()["error"]["code"] == "range_too_large"


def test_hsn_summary_groups_by_code(client: TestClient) -> None:
    h = setup_user(client, "a")
    cid = make_customer(client, h)
    due = (today_ist() + timedelta(days=10)).isoformat()
    body = {
        "customerId": cid,
        "dueDate": due,
        "items": [
            {"description": "A", "hsnSac": "9983", "taxableValue": "1000.00", "gstRate": "18"},
            {"description": "B", "hsnSac": "9983", "taxableValue": "500.00", "gstRate": "18"},
            {"description": "C", "taxableValue": "200.00", "gstRate": "18"},
        ],
    }
    inv = client.post("/invoices", json=body, headers=h).json()
    issue(client, h, inv["id"])
    rows = client.get("/reports/hsn-summary", headers=h).json()["rows"]
    by_code = {r["hsnSac"]: r for r in rows}
    assert by_code["9983"]["taxableValue"] == "1500.00"
    assert by_code["9983"]["invoiceCount"] == 2  # two line items
    assert by_code["UNSPECIFIED"]["taxableValue"] == "200.00"


# ---------- TDS ----------


def test_tds_report(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = issued_invoice(client, h, make_customer(client, h))
    assert pay(client, h, inv["id"], cash="53100.00", tds="5900.00").status_code == 201
    body = client.get("/reports/tds", headers=h).json()
    assert body["totalTdsDeducted"] == "5900.00"
    assert body["totalCashReceived"] == "53100.00"
    assert body["rows"][0]["customerName"] == "AdTech Pvt. Ltd."
    assert body["rows"][0]["paymentCount"] == 1


def test_tds_report_other_year_is_empty(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = issued_invoice(client, h, make_customer(client, h))
    pay(client, h, inv["id"], cash="1000.00", tds="100.00")
    assert client.get("/reports/tds?fy=2020-21", headers=h).json()["rows"] == []


def test_tds_report_rejects_bad_financial_year(client: TestClient) -> None:
    h = setup_user(client, "a")
    r = client.get("/reports/tds?fy=2026-28", headers=h)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_financial_year"
    assert client.get("/reports/tds?fy=abc", headers=h).status_code == 422


# ---------- aging ----------


def test_receivables_aging_buckets(client: TestClient) -> None:
    h = setup_user(client, "a")
    cid = make_customer(client, h)
    issued_invoice(client, h, cid)  # due in 30 days: not due
    old = issued_invoice(client, h, cid)
    set_due_days_ago(old["id"], 45)
    body = client.get("/reports/receivables-aging", headers=h).json()
    by_name = {b["bucket"]: b for b in body["buckets"]}
    assert [b["bucket"] for b in body["buckets"]] == [
        "not_due", "1_30", "31_60", "61_90", "90_plus",
    ]  # fmt: skip
    assert by_name["not_due"]["invoiceCount"] == 1
    assert by_name["31_60"]["invoiceCount"] == 1
    assert by_name["31_60"]["amountDue"] == "59000.00"
    assert body["totalDue"] == "118000.00"


# ---------- exports ----------


def test_invoices_csv(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = issued_invoice(client, h, make_customer(client, h))
    r = client.get("/exports/invoices.csv", headers=h)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    rows = parse_csv(r)
    assert rows[0][0] == "Invoice number"
    assert len(rows) == 2
    number = client.get(f"/invoices/{inv['id']}", headers=h).json()["number"]
    assert rows[1][0] == number
    assert rows[1][7] == "50000.00"  # taxable value


def test_csv_neutralises_formula_in_customer_name(client: TestClient) -> None:
    h = setup_user(client, "a")
    r = client.post("/customers", json={"name": "=1+1", "stateCode": "32"}, headers=h)
    issued_invoice(client, h, r.json()["id"])
    rows = parse_csv(client.get("/exports/invoices.csv", headers=h))
    assert rows[1][3] == "'=1+1"


def test_payments_csv(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = issued_invoice(client, h, make_customer(client, h))
    pay(client, h, inv["id"], cash="1000.00", tds="100.00")
    rows = parse_csv(client.get("/exports/payments.csv", headers=h))
    assert rows[0][0] == "Payment date"
    assert rows[1][3:] == ["1000.00", "100.00"]


# ---------- public link ----------


def test_public_link_lifecycle(client: TestClient) -> None:
    h = setup_user(client, "a")
    client.put("/me/profile", json={"stateCode": "32", "businessName": "Asha Designs"}, headers=h)
    inv = issued_invoice(client, h, make_customer(client, h))

    link = client.post(f"/invoices/{inv['id']}/public-link", headers=h)
    assert link.status_code == 200
    token = link.json()["token"]
    assert link.json()["path"] == f"/pay/{token}"
    # asking again returns the same link
    assert client.post(f"/invoices/{inv['id']}/public-link", headers=h).json()["token"] == token
    assert client.get(f"/invoices/{inv['id']}", headers=h).json()["publicToken"] == token

    public = client.get(f"/public/invoices/{token}")  # no Authorization header
    assert public.status_code == 200
    body = public.json()
    assert body["supplierName"] == "Asha Designs"
    assert body["customerName"] == "AdTech Pvt. Ltd."
    assert body["total"] == "59000.00"
    assert "id" not in body and "customerId" not in body and "gstin" not in public.text
    assert public.headers["cache-control"] == "no-store"
    assert "noindex" in public.headers["x-robots-tag"]

    assert client.delete(f"/invoices/{inv['id']}/public-link", headers=h).status_code == 204
    assert client.get(f"/public/invoices/{token}").status_code == 404
    assert "publicToken" not in client.get(f"/invoices/{inv['id']}", headers=h).json()


def test_draft_cannot_be_shared(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    r = client.post(f"/invoices/{inv['id']}/public-link", headers=h)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "not_shareable"


def test_unknown_and_malformed_tokens(client: TestClient) -> None:
    assert client.get("/public/invoices/" + "a" * 43).status_code == 404
    assert client.get("/public/invoices/abc").status_code == 422


def test_other_user_cannot_create_link(client: TestClient) -> None:
    a = setup_user(client, "user_a")
    b = setup_user(client, "user_b")
    inv = issued_invoice(client, a, make_customer(client, a))
    assert client.post(f"/invoices/{inv['id']}/public-link", headers=b).status_code == 404
    assert client.delete(f"/invoices/{inv['id']}/public-link", headers=b).status_code == 404


# ---------- isolation ----------


def test_reports_are_per_user(client: TestClient) -> None:
    a = setup_user(client, "user_a")
    b = setup_user(client, "user_b")
    inv = issued_invoice(client, a, make_customer(client, a))
    pay(client, a, inv["id"], cash="1000.00", tds="100.00")
    assert client.get("/reports/summary", headers=b).json()["revenueThisMonth"] == "0.00"
    assert client.get("/reports/gst-summary", headers=b).json()["totals"]["invoiceCount"] == 0
    assert client.get("/reports/tds", headers=b).json()["rows"] == []
    assert len(parse_csv(client.get("/exports/invoices.csv", headers=b))) == 1  # header only


def test_reports_require_login(client: TestClient) -> None:
    for path in ("/reports/summary", "/reports/tds", "/exports/invoices.csv"):
        assert client.get(path).status_code == 401
    assert hdr("x")  # keeps the helper import used
