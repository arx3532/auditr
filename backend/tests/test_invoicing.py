import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.clock import today_ist
from app.db.models import LedgerEntry
from app.db.session import SessionLocal
from app.domain.invoice_rules import financial_year
from app.services import invoicing
from tests.conftest import make_token
from tests.test_gstin import make_gstin

# ---------- helpers ----------


def hdr(sub: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub)}"}


def setup_user(client: TestClient, sub: str, state: str = "32") -> dict[str, str]:
    headers = hdr(sub)
    r = client.put("/me/profile", json={"stateCode": state}, headers=headers)
    assert r.status_code == 200, r.text
    return headers


def make_customer(client: TestClient, headers: dict[str, str], state: str = "32") -> str:
    r = client.post(
        "/customers", json={"name": "AdTech Pvt. Ltd.", "stateCode": state}, headers=headers
    )
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


def draft(
    client: TestClient,
    headers: dict[str, str],
    customer_id: str,
    value: str = "50000.00",
    rate: str = "18",
    **extra: Any,
) -> Any:
    due = (today_ist() + timedelta(days=30)).isoformat()
    body = {
        "customerId": customer_id,
        "dueDate": due,
        "items": [{"description": "Design work", "taxableValue": value, "gstRate": rate}],
        **extra,
    }
    return client.post("/invoices", json=body, headers=headers)


def issue(
    client: TestClient, headers: dict[str, str], invoice_id: str, key: str | None = None
) -> Any:
    return client.post(
        f"/invoices/{invoice_id}/issue",
        headers={**headers, "Idempotency-Key": key or uuid.uuid4().hex},
    )


def pay(
    client: TestClient,
    headers: dict[str, str],
    invoice_id: str,
    cash: str,
    tds: str = "0.00",
    key: str | None = None,
) -> Any:
    return client.post(
        f"/invoices/{invoice_id}/payments",
        json={"cashReceived": cash, "tdsDeducted": tds},
        headers={**headers, "Idempotency-Key": key or uuid.uuid4().hex},
    )


def ledger_totals() -> tuple[Decimal, Decimal]:
    with SessionLocal() as s:
        d, c = s.execute(
            select(
                func.coalesce(func.sum(LedgerEntry.debit), 0),
                func.coalesce(func.sum(LedgerEntry.credit), 0),
            )
        ).one()
    return Decimal(d), Decimal(c)


def balance(account: str) -> Decimal:
    with SessionLocal() as s:
        d, c = s.execute(
            select(
                func.coalesce(func.sum(LedgerEntry.debit), 0),
                func.coalesce(func.sum(LedgerEntry.credit), 0),
            ).where(LedgerEntry.account == account)
        ).one()
    return Decimal(d) - Decimal(c)


# ---------- customers ----------


def test_customer_state_derived_from_gstin(client: TestClient) -> None:
    r = client.post("/customers", json={"name": "Acme", "gstin": make_gstin()}, headers=hdr("a"))
    assert r.status_code == 201
    assert r.json()["stateCode"] == "27"


def test_customer_state_mismatch_rejected(client: TestClient) -> None:
    body = {"name": "Acme", "gstin": make_gstin(state="27"), "stateCode": "29"}
    r = client.post("/customers", json=body, headers=hdr("a"))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "state_mismatch"


def test_customer_needs_a_state(client: TestClient) -> None:
    r = client.post("/customers", json={"name": "Acme"}, headers=hdr("a"))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "state_required"


def test_customer_bad_gstin_checksum_rejected(client: TestClient) -> None:
    good = make_gstin()
    bad = good[:-1] + ("0" if good[-1] != "0" else "1")
    r = client.post("/customers", json={"name": "Acme", "gstin": bad}, headers=hdr("a"))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_gstin"


# ---------- drafts ----------


def test_intra_state_draft(client: TestClient) -> None:
    h = setup_user(client, "a", "32")
    r = draft(client, h, make_customer(client, h, "32"))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "draft"
    assert body["tax"] == {"cgst": "4500.00", "sgst": "4500.00"}
    assert body["subtotal"] == "50000.00"
    assert body["total"] == "59000.00"
    assert body["amountDue"] == "59000.00"
    assert "number" not in body


def test_inter_state_draft_uses_igst(client: TestClient) -> None:
    h = setup_user(client, "a", "32")
    r = draft(client, h, make_customer(client, h, "29"))
    assert r.status_code == 201, r.text
    assert r.json()["tax"] == {"igst": "9000.00"}


def test_export_with_lut_is_zero_rated(client: TestClient) -> None:
    h = setup_user(client, "a", "32")
    r = draft(client, h, make_customer(client, h, "29"), lutRef="LUT-TEST-1")
    assert r.status_code == 201, r.text
    assert r.json()["tax"] == {"zeroRated": True, "lutRef": "LUT-TEST-1"}
    assert r.json()["total"] == "50000.00"


def test_draft_needs_supplier_state(client: TestClient) -> None:
    h = hdr("a")  # profile never set
    cid = make_customer(client, h, "32")
    r = draft(client, h, cid)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "supplier_state_required"


def test_disallowed_rate_rejected(client: TestClient) -> None:
    h = setup_user(client, "a")
    r = draft(client, h, make_customer(client, h), rate="12")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_invoice"


def test_json_number_for_money_rejected(client: TestClient) -> None:
    h = setup_user(client, "a")
    body = {
        "customerId": make_customer(client, h),
        "dueDate": (today_ist() + timedelta(days=5)).isoformat(),
        "items": [{"description": "x", "taxableValue": 50000, "gstRate": "18"}],
    }
    assert client.post("/invoices", json=body, headers=h).status_code == 422


def test_zero_value_invoice_rejected(client: TestClient) -> None:
    h = setup_user(client, "a")
    r = draft(client, h, make_customer(client, h), value="0.00")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "zero_invoice"


# ---------- issuing ----------


def test_issue_assigns_number_and_posts_balanced_ledger(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    r = issue(client, h, inv["id"])
    assert r.status_code == 200, r.text
    fy = financial_year(today_ist())
    assert r.json()["number"] == f"INV/{fy}/0001"
    assert r.json()["status"] == "issued"
    d, c = ledger_totals()
    assert d == c == Decimal("59000.00")
    assert balance("receivable") == Decimal("59000.00")


def test_numbers_are_sequential(client: TestClient) -> None:
    h = setup_user(client, "a")
    cid = make_customer(client, h)
    fy = financial_year(today_ist())
    for expected in (1, 2):
        inv = draft(client, h, cid).json()
        assert issue(client, h, inv["id"]).json()["number"] == f"INV/{fy}/{expected:04d}"


def test_issue_requires_idempotency_key(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    assert client.post(f"/invoices/{inv['id']}/issue", headers=h).status_code == 422


def test_same_key_replays_without_consuming_a_number(client: TestClient) -> None:
    h = setup_user(client, "a")
    cid = make_customer(client, h)
    first = draft(client, h, cid).json()
    key = uuid.uuid4().hex
    r1 = issue(client, h, first["id"], key)
    r2 = issue(client, h, first["id"], key)
    assert r1.status_code == r2.status_code == 200
    assert r1.json() == r2.json()
    second = draft(client, h, cid).json()
    fy = financial_year(today_ist())
    assert issue(client, h, second["id"]).json()["number"] == f"INV/{fy}/0002"
    d, c = ledger_totals()
    assert d == c


def test_same_key_for_a_different_invoice_is_rejected(client: TestClient) -> None:
    h = setup_user(client, "a")
    cid = make_customer(client, h)
    a = draft(client, h, cid).json()
    b = draft(client, h, cid).json()
    key = uuid.uuid4().hex
    assert issue(client, h, a["id"], key).status_code == 200
    r = issue(client, h, b["id"], key)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "idempotency_key_reuse"


def test_issuing_twice_with_new_keys_is_rejected(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    assert issue(client, h, inv["id"]).status_code == 200
    r = issue(client, h, inv["id"])
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "invalid_state"


def test_concurrent_issues_get_unique_gapless_numbers(client: TestClient) -> None:
    h = setup_user(client, "a")
    cid = make_customer(client, h)
    user_id = uuid.UUID(client.get("/me", headers=h).json()["id"])
    invoice_ids = [uuid.UUID(draft(client, h, cid).json()["id"]) for _ in range(5)]

    def issue_one(invoice_id: uuid.UUID) -> None:
        with SessionLocal() as session:
            invoicing.issue_invoice(session, user_id, invoice_id, today_ist())
            session.commit()

    with ThreadPoolExecutor(max_workers=5) as pool:
        list(pool.map(issue_one, invoice_ids))  # re-raises if any thread failed

    items = client.get("/invoices", headers=h).json()["items"]
    fy = financial_year(today_ist())
    assert sorted(i["number"] for i in items) == [f"INV/{fy}/{n:04d}" for n in range(1, 6)]


# ---------- payments ----------


def test_payment_with_tds_settles_invoice(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    issue(client, h, inv["id"])
    r = pay(client, h, inv["id"], cash="53100.00", tds="5900.00")
    assert r.status_code == 201, r.text
    assert r.json()["invoice"]["status"] == "paid"
    assert r.json()["invoice"]["amountDue"] == "0.00"
    assert balance("receivable") == Decimal("0.00")
    assert balance("tds_receivable") == Decimal("5900.00")
    assert balance("cash") == Decimal("53100.00")
    d, c = ledger_totals()
    assert d == c


def test_partial_payments_then_paid(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    issue(client, h, inv["id"])
    steps = [
        ("20000.00", "partially_paid", "39000.00"),
        ("19000.00", "partially_paid", "20000.00"),
        ("20000.00", "paid", "0.00"),
    ]
    for cash, status, due in steps:
        r = pay(client, h, inv["id"], cash=cash).json()["invoice"]
        assert (r["status"], r["amountDue"]) == (status, due)
    assert len(client.get(f"/invoices/{inv['id']}/payments", headers=h).json()) == 3


def test_overpayment_rejected(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    issue(client, h, inv["id"])
    r = pay(client, h, inv["id"], cash="59000.01")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_payment"


def test_payment_on_draft_rejected(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    assert pay(client, h, inv["id"], cash="100.00").status_code == 409


def test_payment_replay_records_only_once(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    issue(client, h, inv["id"])
    key = uuid.uuid4().hex
    r1 = pay(client, h, inv["id"], cash="1000.00", key=key)
    r2 = pay(client, h, inv["id"], cash="1000.00", key=key)
    assert r1.status_code == r2.status_code == 201
    assert r1.json() == r2.json()
    assert len(client.get(f"/invoices/{inv['id']}/payments", headers=h).json()) == 1
    assert client.get(f"/invoices/{inv['id']}", headers=h).json()["amountDue"] == "58000.00"


# ---------- isolation between users ----------


def test_users_cannot_see_each_others_data(client: TestClient) -> None:
    a = setup_user(client, "user_a")
    b = setup_user(client, "user_b")
    cid_a = make_customer(client, a)
    inv_a = draft(client, a, cid_a).json()

    assert client.get(f"/invoices/{inv_a['id']}", headers=b).status_code == 404
    assert issue(client, b, inv_a["id"]).status_code == 404
    assert pay(client, b, inv_a["id"], cash="1.00").status_code == 404
    assert draft(client, b, cid_a).status_code == 404  # A's customer
    assert client.get("/invoices", headers=b).json() == {"items": []}
    assert client.get("/customers", headers=b).json() == []
