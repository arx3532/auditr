import json
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.agent.llm.fake import FakeLLM, text_response, tool_response
from app.agent.llm.types import LLMResponse, LLMUnavailable, Usage
from app.api.routes import chat as chat_routes
from app.core.clock import today_ist
from app.core.rate_limit import SlidingWindowLimiter
from app.db.models import ChatThread
from app.db.session import SessionLocal
from app.main import app
from tests.test_gstin import make_gstin
from tests.test_invoicing import (
    balance,
    draft,
    hdr,
    issue,
    ledger_totals,
    make_customer,
    setup_user,
)

# ---------- helpers ----------


def use_llm(*responses: LLMResponse | Exception) -> FakeLLM:
    llm = FakeLLM(list(responses))
    app.state.llm = llm
    return llm


def parse_events(response: Any) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for line in response.text.splitlines():
        if line.startswith("data:"):
            events.append(json.loads(line[5:].strip()))
    return events


def of_type(events: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    return [e for e in events if e["type"] == kind]


def last_approval(events: list[dict[str, Any]]) -> dict[str, Any]:
    found = of_type(events, "approval_required")
    assert found, f"no approval_required in {[e['type'] for e in events]}"
    return found[-1]


def say(client: TestClient, h: dict[str, str], message: str, thread_id: str | None = None) -> Any:
    body: dict[str, Any] = {"message": message}
    if thread_id:
        body["threadId"] = thread_id
    return client.post("/chat", json=body, headers=h)


def resume(
    client: TestClient,
    h: dict[str, str],
    thread_id: str,
    approval_id: str,
    decision: str,
    edits: dict[str, Any] | None = None,
) -> Any:
    body: dict[str, Any] = {"threadId": thread_id, "approvalId": approval_id, "decision": decision}
    if edits is not None:
        body["edits"] = edits
    return client.post("/chat/resume", json=body, headers=h)


def draft_args(**over: Any) -> dict[str, Any]:
    args: dict[str, Any] = {
        "customer_name": "AdTech Pvt. Ltd.",
        "due_date": (today_ist() + timedelta(days=10)).isoformat(),
        "items": [{"description": "Design work", "taxable_value": "50000.00", "gst_rate": "18"}],
    }
    args.update(over)
    return args


def propose(
    client: TestClient,
    h: dict[str, str],
    *responses: LLMResponse | Exception,
    message: str = "Invoice AdTech 50000 at 18%",
) -> tuple[FakeLLM, str, dict[str, Any]]:
    llm = use_llm(*responses)
    events = parse_events(say(client, h, message))
    return llm, events[0]["threadId"], last_approval(events)


def text_of(events: list[dict[str, Any]]) -> str:
    return "".join(e["text"] for e in of_type(events, "text_delta"))


def setup_with_customer(client: TestClient, sub: str = "a") -> dict[str, str]:
    h = setup_user(client, sub, "32")
    make_customer(client, h, "32")
    return h


# ---------- plain replies and read tools ----------


def test_plain_reply_streams_text(client: TestClient) -> None:
    h = setup_user(client, "a")
    use_llm(text_response("Hello!"))
    events = parse_events(say(client, h, "hi"))
    assert [e["type"] for e in events] == ["thread", "text_delta", "done"]
    assert text_of(events) == "Hello!"


def test_read_tool_result_reaches_the_model_without_identifiers(client: TestClient) -> None:
    h = setup_user(client, "a", "32")
    gstin = make_gstin()
    client.post("/customers", json={"name": "Acme Ltd", "gstin": gstin}, headers=h)
    llm = use_llm(tool_response("list_customers", {}), text_response("You have one customer."))
    events = parse_events(say(client, h, "who are my customers?"))
    assert [e["type"] for e in events if e["type"].startswith("tool")] == ["tool_start", "tool_end"]
    assert "Acme Ltd" in llm.requests[1][-1]["content"]
    assert gstin not in json.dumps(llm.requests)  # the model never sees GSTINs
    assert text_of(events) == "You have one customer."


def test_list_invoices_tool(client: TestClient) -> None:
    h = setup_with_customer(client)
    inv = draft(client, h, make_customer(client, h, "29")).json()
    number = issue(client, h, inv["id"]).json()["number"]
    llm = use_llm(tool_response("list_invoices", {"status": "issued"}), text_response("Found."))
    say(client, h, "show issued invoices")
    assert number in llm.requests[1][-1]["content"]


# ---------- invoice drafts and approval ----------


def test_draft_proposal_then_approve_issues_the_invoice(client: TestClient) -> None:
    h = setup_with_customer(client)
    llm, thread_id, approval = propose(
        client, h, tool_response("create_invoice_draft", draft_args()), text_response("Issued.")
    )
    assert approval["kind"] == "issue_invoice"
    assert approval["draft"]["total"] == "59000.00"
    assert approval["draft"]["status"] == "draft"
    assert client.get("/invoices?status=issued", headers=h).json()["items"] == []  # nothing yet

    events = parse_events(resume(client, h, thread_id, approval["approvalId"], "approve"))
    resolved = of_type(events, "approval_resolved")[0]
    assert resolved["outcome"] == "approved"
    assert resolved["invoice"]["status"] == "issued"
    assert resolved["invoice"]["number"].startswith("INV/")
    assert text_of(events) == "Issued."
    assert events[-1]["type"] == "done"
    assert "was issued" in llm.requests[1][-1]["content"]
    debits, credits = ledger_totals()
    assert debits == credits == Decimal("59000.00")


def test_reject_cancels_the_draft(client: TestClient) -> None:
    h = setup_with_customer(client)
    llm, thread_id, approval = propose(
        client, h, tool_response("create_invoice_draft", draft_args()), text_response("Cancelled.")
    )
    events = parse_events(resume(client, h, thread_id, approval["approvalId"], "reject"))
    assert of_type(events, "approval_resolved")[0]["outcome"] == "rejected"
    status = client.get(f"/invoices/{approval['draft']['id']}", headers=h).json()["status"]
    assert status == "cancelled"
    assert "rejected" in llm.requests[1][-1]["content"]


def test_edit_changes_the_draft_and_rotates_the_approval(client: TestClient) -> None:
    h = setup_with_customer(client)
    llm, thread_id, approval = propose(
        client, h, tool_response("create_invoice_draft", draft_args()), text_response("Issued.")
    )
    items = [{"description": "Design work", "taxableValue": "10000.00", "gstRate": "5"}]
    events = parse_events(
        resume(client, h, thread_id, approval["approvalId"], "edit", {"items": items})
    )
    new = last_approval(events)
    assert new["approvalId"] != approval["approvalId"]
    assert new["draft"]["total"] == "10500.00"
    assert len(llm.requests) == 1  # an edit never calls the model
    # the old card can no longer be used
    assert resume(client, h, thread_id, approval["approvalId"], "approve").status_code == 409
    events = parse_events(resume(client, h, thread_id, new["approvalId"], "approve"))
    assert of_type(events, "approval_resolved")[0]["invoice"]["total"] == "10500.00"


def test_an_approval_can_only_be_used_once(client: TestClient) -> None:
    h = setup_with_customer(client)
    _, thread_id, approval = propose(
        client, h, tool_response("create_invoice_draft", draft_args()), text_response("Done.")
    )
    first = resume(client, h, thread_id, approval["approvalId"], "approve")
    assert first.status_code == 200
    second = resume(client, h, thread_id, approval["approvalId"], "approve")
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "approval_not_pending"
    assert len(client.get("/invoices?status=issued", headers=h).json()["items"]) == 1


def expire(thread_id: str) -> None:
    with SessionLocal() as s:
        s.execute(
            update(ChatThread)
            .where(ChatThread.id == uuid.UUID(thread_id))
            .values(pending_expires_at=datetime.now(UTC) - timedelta(minutes=1))
        )
        s.commit()


def test_expired_approval_cancels_the_draft(client: TestClient) -> None:
    h = setup_with_customer(client)
    llm, thread_id, approval = propose(
        client, h, tool_response("create_invoice_draft", draft_args()), text_response("Expired.")
    )
    expire(thread_id)
    events = parse_events(resume(client, h, thread_id, approval["approvalId"], "approve"))
    assert of_type(events, "approval_resolved")[0]["outcome"] == "expired"
    status = client.get(f"/invoices/{approval['draft']['id']}", headers=h).json()["status"]
    assert status == "cancelled"
    assert "expired" in llm.requests[1][-1]["content"]


def test_an_expired_approval_cannot_be_edited(client: TestClient) -> None:
    h = setup_with_customer(client)
    _, thread_id, approval = propose(
        client, h, tool_response("create_invoice_draft", draft_args()), text_response("x")
    )
    expire(thread_id)
    r = resume(client, h, thread_id, approval["approvalId"], "edit", {"lutRef": None})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "approval_expired"


def test_a_pending_approval_blocks_new_messages(client: TestClient) -> None:
    h = setup_with_customer(client)
    _, thread_id, _ = propose(client, h, tool_response("create_invoice_draft", draft_args()))
    r = say(client, h, "hello again", thread_id)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "approval_pending"


# ---------- payments ----------


def test_payment_proposal_edit_and_approve(client: TestClient) -> None:
    h = setup_with_customer(client)
    inv = draft(client, h, make_customer(client, h, "29")).json()
    number = issue(client, h, inv["id"]).json()["number"]
    args = {"invoice_number": number, "cash_received": "53100.00", "tds_deducted": "5900.00"}
    _, thread_id, approval = propose(
        client, h, tool_response("record_payment", args), text_response("Recorded.")
    )
    payment = approval["payment"]
    assert approval["kind"] == "record_payment"
    assert (payment["amountDueAfter"], payment["statusAfter"]) == ("0.00", "paid")
    assert client.get(f"/invoices/{inv['id']}", headers=h).json()["amountDue"] == "59000.00"

    edits = {"cashReceived": "20000.00", "tdsDeducted": "0.00"}
    events = parse_events(resume(client, h, thread_id, approval["approvalId"], "edit", edits))
    new = last_approval(events)
    assert new["payment"]["statusAfter"] == "partially_paid"
    assert new["payment"]["amountDueAfter"] == "39000.00"

    events = parse_events(resume(client, h, thread_id, new["approvalId"], "approve"))
    assert of_type(events, "approval_resolved")[0]["outcome"] == "approved"
    after = client.get(f"/invoices/{inv['id']}", headers=h).json()
    assert (after["status"], after["amountDue"]) == ("partially_paid", "39000.00")
    assert balance("cash") == Decimal("20000.00")
    debits, credits = ledger_totals()
    assert debits == credits


# ---------- the model makes mistakes ----------


def test_unknown_customer_is_reported_back_to_the_model(client: TestClient) -> None:
    h = setup_with_customer(client)
    llm = use_llm(
        tool_response("create_invoice_draft", draft_args(customer_name="Nobody Inc")),
        text_response("I could not find that customer."),
    )
    events = parse_events(say(client, h, "invoice Nobody Inc"))
    assert not of_type(events, "approval_required")
    assert "No customer matches" in llm.requests[1][-1]["content"]


def test_disallowed_gst_rate_is_reported_back_to_the_model(client: TestClient) -> None:
    h = setup_with_customer(client)
    items = [{"description": "x", "taxable_value": "100.00", "gst_rate": "12"}]
    llm = use_llm(
        tool_response("create_invoice_draft", draft_args(items=items)), text_response("Sorry.")
    )
    events = parse_events(say(client, h, "invoice AdTech 100 at 12%"))
    assert not of_type(events, "approval_required")
    assert "not allowed" in llm.requests[1][-1]["content"]


def test_money_sent_as_json_numbers_is_accepted(client: TestClient) -> None:
    h = setup_with_customer(client)
    items = [{"description": "x", "taxable_value": 50000, "gst_rate": 18}]
    _, _, approval = propose(
        client, h, tool_response("create_invoice_draft", draft_args(items=items))
    )
    assert approval["draft"]["total"] == "59000.00"


def test_only_one_action_is_proposed_per_turn(client: TestClient) -> None:
    h = setup_with_customer(client)
    first = tool_response("create_invoice_draft", draft_args())
    second = tool_response("create_invoice_draft", draft_args())
    combo = LLMResponse("", first.tool_calls + second.tool_calls, Usage(1, 1), "tool_calls", 0)
    llm, thread_id, approval = propose(client, h, combo, text_response("One at a time."))
    assert len(client.get("/invoices?status=draft", headers=h).json()["items"]) == 1
    resume(client, h, thread_id, approval["approvalId"], "reject")
    tool_texts = [m["content"] for m in llm.requests[1] if m["role"] == "tool"]
    assert any("only one action" in t for t in tool_texts)


# ---------- privacy ----------


def test_identifiers_in_messages_never_reach_the_model(client: TestClient) -> None:
    h = setup_user(client, "a")
    llm = use_llm(text_response("ok"))
    say(client, h, "My PAN is ABCDE1234F and account 12345678901234. What is my revenue?")
    sent = json.dumps(llm.requests)
    assert "ABCDE1234F" not in sent and "12345678901234" not in sent
    assert "[PAN_1]" in sent and "[NUMBER_1]" in sent


# ---------- ownership, auth, limits, failures ----------


def test_other_users_cannot_touch_a_conversation(client: TestClient) -> None:
    a = setup_with_customer(client, "user_a")
    b = setup_user(client, "user_b")
    _, thread_id, approval = propose(client, a, tool_response("create_invoice_draft", draft_args()))
    assert say(client, b, "hi", thread_id).status_code == 404
    assert resume(client, b, thread_id, approval["approvalId"], "approve").status_code == 404
    assert client.get(f"/chat/threads/{thread_id}", headers=b).status_code == 404
    assert client.get(f"/invoices/{approval['draft']['id']}", headers=a).json()["status"] == "draft"


def test_chat_requires_login(client: TestClient) -> None:
    assert client.post("/chat", json={"message": "hi"}).status_code == 401
    assert hdr("x")  # keeps the helper import used


def test_llm_failure_is_reported_as_an_error_event(client: TestClient) -> None:
    h = setup_user(client, "a")
    use_llm(LLMUnavailable("down"))
    events = parse_events(say(client, h, "hi"))
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "llm_unavailable"
    assert not of_type(events, "done")


def test_chat_is_disabled_without_an_llm(client: TestClient) -> None:
    h = setup_user(client, "a")
    app.state.llm = None
    r = say(client, h, "hi")
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "llm_not_configured"


def test_chat_is_rate_limited(client: TestClient, monkeypatch: Any) -> None:
    h = setup_user(client, "a")
    monkeypatch.setattr(chat_routes, "chat_limiter", SlidingWindowLimiter(1, 60.0))
    use_llm(text_response("one"), text_response("two"))
    assert say(client, h, "first").status_code == 200
    r = say(client, h, "second")
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"


# ---------- thread view and durability ----------


def test_thread_view_shows_the_pending_approval(client: TestClient) -> None:
    h = setup_with_customer(client)
    _, thread_id, approval = propose(
        client, h, tool_response("create_invoice_draft", draft_args()), text_response("Done.")
    )
    view = client.get(f"/chat/threads/{thread_id}", headers=h).json()
    assert view["pendingApproval"]["approvalId"] == approval["approvalId"]
    resume(client, h, thread_id, approval["approvalId"], "approve")
    assert client.get(f"/chat/threads/{thread_id}", headers=h).json()["pendingApproval"] is None


def test_pending_approval_survives_a_server_restart(client: TestClient) -> None:
    h = setup_with_customer(client)
    _, thread_id, approval = propose(client, h, tool_response("create_invoice_draft", draft_args()))
    with TestClient(app) as restarted:  # a new lifespan: new connection pool, same database
        use_llm(text_response("Issued after restart."))
        r = resume(restarted, h, thread_id, approval["approvalId"], "approve")
        events = parse_events(r)
    assert of_type(events, "approval_resolved")[0]["outcome"] == "approved"
    assert text_of(events) == "Issued after restart."


def test_an_empty_model_reply_is_retried_then_replaced(client: TestClient) -> None:
    h = setup_user(client, "a")
    llm = use_llm(text_response(""), text_response("Recovered."))
    events = parse_events(say(client, h, "hi"))
    assert text_of(events) == "Recovered."
    assert len(llm.requests) == 2

    use_llm(text_response(""), text_response(""))
    events = parse_events(say(client, h, "hi again"))
    assert "could not come up with an answer" in text_of(events)
    assert events[-1]["type"] == "done"
