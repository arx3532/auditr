import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient

from app.core.clock import today_ist
from app.domain.invoice_rules import financial_year
from tests.test_invoicing import (
    balance,
    draft,
    issue,
    ledger_totals,
    make_customer,
    pay,
    setup_user,
)


def patch(client: TestClient, headers: dict[str, str], invoice_id: str, **body: Any) -> Any:
    return client.patch(f"/invoices/{invoice_id}", json=body, headers=headers)


def cancel(client: TestClient, headers: dict[str, str], invoice_id: str) -> Any:
    return client.post(f"/invoices/{invoice_id}/cancel", headers=headers)


def lines(value: str, rate: str = "18") -> list[dict[str, str]]:
    return [{"description": "Design work", "taxableValue": value, "gstRate": rate}]


# ---------- editing ----------


def test_edit_items_recomputes_tax(client: TestClient) -> None:
    h = setup_user(client, "a", "32")
    inv = draft(client, h, make_customer(client, h, "32")).json()
    r = patch(client, h, inv["id"], items=lines("10000.00", "5"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tax"] == {"cgst": "250.00", "sgst": "250.00"}
    assert (body["subtotal"], body["total"], body["amountDue"]) == (
        "10000.00",
        "10500.00",
        "10500.00",
    )
    assert len(body["items"]) == 1  # the old line is gone
    assert client.get(f"/invoices/{inv['id']}", headers=h).json() == body


def test_edit_customer_changes_tax_type(client: TestClient) -> None:
    h = setup_user(client, "a", "32")
    same_state = make_customer(client, h, "32")
    other_state = make_customer(client, h, "29")
    inv = draft(client, h, same_state).json()
    assert inv["tax"] == {"cgst": "4500.00", "sgst": "4500.00"}
    r = patch(client, h, inv["id"], customerId=other_state)
    assert r.status_code == 200, r.text
    assert r.json()["tax"] == {"igst": "9000.00"}
    assert r.json()["customer"]["stateCode"] == "29"


def test_edit_due_date_only_keeps_the_numbers(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    new_due = (today_ist() + timedelta(days=60)).isoformat()
    r = patch(client, h, inv["id"], dueDate=new_due)
    assert r.status_code == 200
    assert r.json()["dueDate"] == new_due
    assert r.json()["total"] == "59000.00"


def test_lut_can_be_set_and_cleared(client: TestClient) -> None:
    h = setup_user(client, "a", "32")
    inv = draft(client, h, make_customer(client, h, "29")).json()
    r = patch(client, h, inv["id"], lutRef="LUT-TEST-1")
    assert r.json()["tax"] == {"zeroRated": True, "lutRef": "LUT-TEST-1"}
    assert r.json()["total"] == "50000.00"
    r = patch(client, h, inv["id"], lutRef=None)  # explicit null clears it
    assert r.json()["tax"] == {"igst": "9000.00"}
    assert r.json()["total"] == "59000.00"


def test_empty_edit_and_unknown_fields_rejected(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    r = patch(client, h, inv["id"])
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "nothing_to_update"
    assert patch(client, h, inv["id"], status="paid").status_code == 422
    assert patch(client, h, inv["id"], total="1.00").status_code == 422


def test_bad_edits_are_rejected_and_change_nothing(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()

    r = patch(client, h, inv["id"], items=lines("100.00", "12"))  # rate not allowed
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_invoice"

    yesterday = (today_ist() - timedelta(days=1)).isoformat()
    r = patch(client, h, inv["id"], dueDate=yesterday)
    assert r.json()["error"]["code"] == "due_date_in_past"

    bad_number = [{"description": "x", "taxableValue": 100, "gstRate": "18"}]
    assert patch(client, h, inv["id"], items=bad_number).status_code == 422
    assert patch(client, h, inv["id"], items=[]).status_code == 422

    unchanged = client.get(f"/invoices/{inv['id']}", headers=h).json()
    assert unchanged["total"] == "59000.00"
    assert unchanged["tax"] == {"cgst": "4500.00", "sgst": "4500.00"}


def test_edit_with_unknown_or_foreign_customer_is_404(client: TestClient) -> None:
    a = setup_user(client, "user_a")
    b = setup_user(client, "user_b")
    inv = draft(client, a, make_customer(client, a)).json()
    foreign = make_customer(client, b)
    for customer_id in (str(uuid.uuid4()), foreign):
        r = patch(client, a, inv["id"], customerId=customer_id)
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "customer_not_found"


def test_issued_invoice_cannot_be_edited(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    assert issue(client, h, inv["id"]).status_code == 200
    r = patch(client, h, inv["id"], items=lines("1.00"))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "invalid_state"


def test_edited_draft_issues_with_the_new_numbers(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    patch(client, h, inv["id"], items=lines("10000.00", "5"))
    r = issue(client, h, inv["id"])
    assert r.status_code == 200, r.text
    assert r.json()["total"] == "10500.00"
    assert balance("receivable") == Decimal("10500.00")
    debits, credits = ledger_totals()
    assert debits == credits == Decimal("10500.00")


def test_other_user_cannot_edit_or_cancel(client: TestClient) -> None:
    a = setup_user(client, "user_a")
    b = setup_user(client, "user_b")
    inv = draft(client, a, make_customer(client, a)).json()
    assert patch(client, b, inv["id"], items=lines("1.00")).status_code == 404
    assert cancel(client, b, inv["id"]).status_code == 404
    assert client.get(f"/invoices/{inv['id']}", headers=a).json()["status"] == "draft"


# ---------- cancelling ----------


def test_cancel_draft_and_repeat(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    r = cancel(client, h, inv["id"])
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"
    assert "number" not in r.json()
    assert cancel(client, h, inv["id"]).status_code == 200  # repeating is harmless
    listed = client.get("/invoices?status=cancelled", headers=h).json()["items"]
    assert [i["id"] for i in listed] == [inv["id"]]


def test_cancelled_draft_cannot_be_used(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    cancel(client, h, inv["id"])
    assert issue(client, h, inv["id"]).status_code == 409
    assert patch(client, h, inv["id"], items=lines("1.00")).status_code == 409
    assert pay(client, h, inv["id"], cash="1.00").status_code == 409
    r = client.post(f"/invoices/{inv['id']}/public-link", headers=h)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "not_shareable"


def test_issued_invoice_cannot_be_cancelled(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    issue(client, h, inv["id"])
    r = cancel(client, h, inv["id"])
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "invalid_state"


def test_cancelled_drafts_do_not_use_up_invoice_numbers(client: TestClient) -> None:
    h = setup_user(client, "a")
    cid = make_customer(client, h)
    first = draft(client, h, cid).json()
    cancel(client, h, first["id"])
    second = draft(client, h, cid).json()
    r = issue(client, h, second["id"])
    assert r.json()["number"] == f"INV/{financial_year(today_ist())}/0001"


def test_cancelled_drafts_stay_out_of_reports(client: TestClient) -> None:
    h = setup_user(client, "a")
    inv = draft(client, h, make_customer(client, h)).json()
    cancel(client, h, inv["id"])
    summary = client.get("/reports/summary", headers=h).json()
    assert summary["revenueThisMonth"] == "0.00"
    assert client.get("/reports/gst-summary", headers=h).json()["totals"]["invoiceCount"] == 0
