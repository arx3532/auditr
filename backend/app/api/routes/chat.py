import logging
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.errors import GraphRecursionError
from langgraph.types import Command
from pydantic import BaseModel, ValidationError

from app.agent.graph import build_graph
from app.agent.llm.types import LLMClient, LLMError, LLMUnavailable
from app.agent.privacy import Redactor
from app.agent.tools import validation_summary
from app.api.approval_payload import build_approval_payload
from app.api.deps import UserDep
from app.api.mappers import invoice_out, payment_out
from app.api.schemas import ChatIn, InvoiceUpdateIn, PaymentEditIn, ResumeIn
from app.api.sse import KEEPALIVE, sse, with_keepalive
from app.config import get_settings
from app.core.clock import today_ist
from app.core.errors import Conflict, DomainError, NotFound, ServiceUnavailable, Unprocessable
from app.core.rate_limit import SlidingWindowLimiter
from app.db import repositories as repo
from app.db.models import User
from app.db.session import SessionLocal
from app.services import approvals, invoicing

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

RECURSION_LIMIT = 16  # graph steps per turn: stops a model that loops on tool errors
KEEPALIVE_SECONDS = 15.0
chat_limiter = SlidingWindowLimiter(limit=20, window_seconds=600)


def get_llm(request: Request) -> LLMClient:
    llm: LLMClient | None = getattr(request.app.state, "llm", None)
    if llm is None:
        raise ServiceUnavailable("llm_not_configured", "The AI assistant is not configured")
    return llm


def get_checkpointer(request: Request) -> BaseCheckpointSaver[Any]:
    saver: BaseCheckpointSaver[Any] | None = getattr(request.app.state, "checkpointer", None)
    if saver is None:
        raise ServiceUnavailable("chat_unavailable", "Chat is not available")
    return saver


LlmDep = Annotated[LLMClient, Depends(get_llm)]
CheckpointerDep = Annotated[BaseCheckpointSaver[Any], Depends(get_checkpointer)]


def _dump(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(mode="json", by_alias=True, exclude_none=True)


def _error(code: str, message: str) -> dict[str, Any]:
    return {"type": "error", "code": code, "message": message}


# ---------- synchronous database helpers (run in a worker thread) ----------


def _open_thread(user_id: uuid.UUID, thread_id: uuid.UUID | None) -> uuid.UUID:
    with SessionLocal() as db:
        if thread_id is None:
            return repo.create_thread(db, user_id).id
        thread = repo.get_thread(db, user_id, thread_id)
        if thread is None:
            raise NotFound("thread_not_found", "Conversation not found")
        if thread.pending_approval_id is not None:
            raise Conflict("approval_pending", "Approve, edit or reject the pending action first")
        return thread.id


def _pending_kind(user_id: uuid.UUID, thread_id: uuid.UUID, approval_id: uuid.UUID) -> str:
    with SessionLocal() as db:
        thread = repo.get_thread(db, user_id, thread_id)
        if thread is None:
            raise NotFound("thread_not_found", "Conversation not found")
        if thread.pending_approval_id != approval_id or thread.pending_kind is None:
            raise Conflict("approval_not_pending", "This approval is no longer pending")
        return thread.pending_kind


def _pending_payload(user_id: uuid.UUID, thread_id: uuid.UUID) -> dict[str, Any] | None:
    with SessionLocal() as db:
        thread = repo.get_thread(db, user_id, thread_id)
        return None if thread is None else build_approval_payload(db, thread, today_ist())


def _thread_view(user_id: uuid.UUID, thread_id: uuid.UUID) -> dict[str, Any]:
    with SessionLocal() as db:
        thread = repo.get_thread(db, user_id, thread_id)
        if thread is None:
            raise NotFound("thread_not_found", "Conversation not found")
        return {
            "threadId": str(thread.id),
            "pendingApproval": build_approval_payload(db, thread, today_ist()),
        }


def _parse_edit(
    kind: str, edits: dict[str, Any] | None
) -> approvals.InvoiceEdit | approvals.PaymentEdit:
    if not edits:
        raise Unprocessable("nothing_to_update", "Send at least one change")
    try:
        if kind == approvals.ISSUE_INVOICE:
            inv = InvoiceUpdateIn.model_validate(edits)
            return approvals.InvoiceEdit(
                customer_id=inv.customer_id,
                due_date=inv.due_date,
                items=None
                if inv.items is None
                else [
                    invoicing.ItemInput(i.description, i.hsn_sac, i.taxable_value, i.gst_rate)
                    for i in inv.items
                ],
                lut_ref=inv.lut_ref,
                lut_ref_given="lut_ref" in inv.model_fields_set,
            )
        pay = PaymentEditIn.model_validate(edits)
        return approvals.PaymentEdit(
            cash_received=pay.cash_received,
            tds_deducted=pay.tds_deducted,
            paid_on=pay.paid_on,
            paid_on_given="paid_on" in pay.model_fields_set,
        )
    except ValidationError as exc:
        raise Unprocessable("invalid_edit", validation_summary(exc)) from None


def _apply_edit(
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
    approval_id: uuid.UUID,
    edit: approvals.InvoiceEdit | approvals.PaymentEdit,
) -> None:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise NotFound("user_not_found", "User not found")
        approvals.edit_pending(
            db, user, thread_id, approval_id, edit, today=today_ist(), now=datetime.now(UTC)
        )


@dataclass(frozen=True)
class Resolved:
    kind: str
    message: str
    extra: dict[str, Any]


def _decide(
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
    approval_id: uuid.UUID,
    decision: Literal["approve", "reject"],
) -> Resolved:
    today = today_ist()
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise NotFound("user_not_found", "User not found")
        outcome = approvals.resolve_decision(
            db, user, thread_id, approval_id, decision, today=today, now=datetime.now(UTC)
        )
        extra: dict[str, Any] = {}
        if outcome.invoice is not None:
            extra["invoice"] = _dump(invoice_out(outcome.invoice, today))
        if outcome.payment is not None:
            extra["payment"] = _dump(payment_out(outcome.payment))
        return Resolved(outcome.kind, outcome.message, extra)


# ---------- streaming ----------


def _custom_payload(chunk: Any) -> dict[str, Any] | None:
    """The events our nodes emit. Handles both stream chunk formats LangGraph can use."""
    if isinstance(chunk, tuple) and len(chunk) == 2 and chunk[0] == "custom":
        data = chunk[1]
    elif isinstance(chunk, dict) and chunk.get("type") == "custom":
        data = chunk.get("data")
    else:
        return None
    return data if isinstance(data, dict) else None


async def _pending_events(
    user_id: uuid.UUID, thread_id: uuid.UUID
) -> AsyncGenerator[dict[str, Any], None]:
    payload = await run_in_threadpool(_pending_payload, user_id, thread_id)
    if payload is not None:
        yield {"type": "approval_required", **payload}


async def _stream_graph(
    graph: Any,
    graph_input: Any,
    thread_id: uuid.UUID,
    user_id: uuid.UUID,
    lead: list[dict[str, Any]] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    for event in lead or []:
        yield event
    config = {"configurable": {"thread_id": str(thread_id)}, "recursion_limit": RECURSION_LIMIT}
    async for chunk in graph.astream(graph_input, config, stream_mode=["custom"]):
        payload = _custom_payload(chunk)
        if payload is not None:
            yield payload
    # If the graph paused for approval, tell the client what to show.
    async for event in _pending_events(user_id, thread_id):
        yield event


async def _sse(
    events: AsyncGenerator[dict[str, Any], None], thread_id: uuid.UUID
) -> AsyncGenerator[str, None]:
    """Always ends with `done` or `error`. Never leaks prompts or internals."""
    try:
        yield sse({"type": "thread", "threadId": str(thread_id)})
        async for item in with_keepalive(events, KEEPALIVE_SECONDS):
            yield KEEPALIVE if item is None else sse(item)
        yield sse({"type": "done"})
    except LLMUnavailable:
        yield sse(_error("llm_unavailable", "The AI service is busy. Please try again."))
    except LLMError:
        yield sse(_error("llm_error", "The AI service returned an unexpected answer."))
    except GraphRecursionError:
        yield sse(_error("too_many_steps", "That took too many steps. Please rephrase."))
    except DomainError as exc:
        yield sse(_error(exc.code, exc.message))
    except Exception as exc:
        if get_settings().environment == "local":
            logger.exception("chat stream failed")
        else:
            logger.error("chat stream failed: %s", type(exc).__name__)
        yield sse(_error("internal_error", "Something went wrong."))


def _sse_response(
    events: AsyncGenerator[dict[str, Any], None], thread_id: uuid.UUID
) -> StreamingResponse:
    return StreamingResponse(
        _sse(events, thread_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


# ---------- endpoints ----------


@router.post("")
async def chat(
    body: ChatIn, user: UserDep, llm: LlmDep, checkpointer: CheckpointerDep
) -> StreamingResponse:
    text = body.message.strip()
    if not text:
        raise Unprocessable("empty_message", "Message cannot be empty")
    user_id = user.id
    chat_limiter.check(str(user_id))
    thread_id = await run_in_threadpool(_open_thread, user_id, body.thread_id)
    graph = build_graph(llm=llm, checkpointer=checkpointer, user_id=user_id, thread_id=thread_id)
    # Masked BEFORE it enters the checkpoint: raw PAN and similar values are never stored.
    message = {"role": "user", "content": Redactor().redact(text)}
    events = _stream_graph(graph, {"messages": [message]}, thread_id, user_id)
    return _sse_response(events, thread_id)


@router.post("/resume")
async def resume(
    body: ResumeIn, user: UserDep, llm: LlmDep, checkpointer: CheckpointerDep
) -> StreamingResponse:
    user_id = user.id
    kind = await run_in_threadpool(_pending_kind, user_id, body.thread_id, body.approval_id)

    if body.decision == "edit":
        edit = _parse_edit(kind, body.edits)
        await run_in_threadpool(_apply_edit, user_id, body.thread_id, body.approval_id, edit)
        return _sse_response(_pending_events(user_id, body.thread_id), body.thread_id)

    chat_limiter.check(str(user_id))
    resolved = await run_in_threadpool(
        _decide, user_id, body.thread_id, body.approval_id, body.decision
    )
    graph = build_graph(
        llm=llm, checkpointer=checkpointer, user_id=user_id, thread_id=body.thread_id
    )
    lead = {
        "type": "approval_resolved",
        "approvalId": str(body.approval_id),
        "outcome": resolved.kind,
        **resolved.extra,
    }
    command = Command(resume={"outcome": resolved.kind, "message": resolved.message})
    events = _stream_graph(graph, command, body.thread_id, user_id, lead=[lead])
    return _sse_response(events, body.thread_id)


@router.get("/threads/{thread_id}")
async def read_thread(thread_id: uuid.UUID, user: UserDep) -> dict[str, Any]:
    return await run_in_threadpool(_thread_view, user.id, thread_id)
