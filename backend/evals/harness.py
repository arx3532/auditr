import asyncio
import copy
import time
import uuid
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass
from typing import Any

from langgraph.errors import GraphRecursionError
from sqlalchemy import func, select

from app.agent.graph import build_graph
from app.agent.llm.types import (
    LLMClient,
    LLMResponse,
    LLMUnavailable,
    Message,
    StreamDone,
    StreamEvent,
    ToolSpec,
)
from app.agent.privacy import Redactor, SensitiveDataLeak, ensure_no_sensitive
from app.core.clock import today_ist
from app.db import repositories as repo
from app.db.models import Invoice, LedgerEntry, Payment
from app.db.session import SessionLocal
from app.domain.money import money_str
from app.services import approvals
from evals.cases import Case
from evals.checks import Counts, Pending, Trace, evaluate
from evals.seed import reset_and_seed

RECURSION_LIMIT = 16  # same as the server
ISSUED_STATUSES = ["issued", "partially_paid", "paid"]


class RecordingLLM:
    """Wraps a client to keep the requests and count calls and tokens."""

    def __init__(self, inner: LLMClient) -> None:
        self._inner = inner
        self.requests: list[list[Message]] = []
        self.tokens = 0

    def _note(self, response: LLMResponse) -> None:
        self.tokens += response.usage.prompt_tokens + response.usage.completion_tokens

    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> LLMResponse:
        self.requests.append(copy.deepcopy(messages))
        response = await self._inner.complete(
            messages, tools, temperature=temperature, max_tokens=max_tokens
        )
        self._note(response)
        return response

    async def stream(
        self,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncGenerator[StreamEvent, None]:
        self.requests.append(copy.deepcopy(messages))
        async for event in self._inner.stream(
            messages, tools, temperature=temperature, max_tokens=max_tokens
        ):
            if isinstance(event, StreamDone):
                self._note(event.response)
            yield event

    async def aclose(self) -> None:
        return None


@dataclass
class Context:
    llm: LLMClient
    checkpointer: Any


@dataclass(frozen=True)
class CaseResult:
    case_id: str
    category: str
    passed: bool
    failures: tuple[str, ...]
    error: str | None  # the model could not be reached: not the agent's fault
    latency: float
    llm_calls: int
    tokens: int
    tools: tuple[str, ...]
    reply: str
    transcript: tuple[str, ...] = ()


def _custom_payload(chunk: Any) -> dict[str, Any] | None:
    """The events our graph nodes emit (same logic as the chat endpoint)."""
    if isinstance(chunk, tuple) and len(chunk) == 2 and chunk[0] == "custom":
        data = chunk[1]
    elif isinstance(chunk, dict) and chunk.get("type") == "custom":
        data = chunk.get("data")
    else:
        return None
    return data if isinstance(data, dict) else None


def _create_thread(user_id: uuid.UUID) -> uuid.UUID:
    with SessionLocal() as db:
        return repo.create_thread(db, user_id).id


def snapshot(user_id: uuid.UUID) -> Counts:
    with SessionLocal() as db:
        issued = Invoice.status.in_(ISSUED_STATUSES)
        drafts = db.scalar(
            select(func.count(Invoice.id)).where(
                Invoice.user_id == user_id, Invoice.status == "draft"
            )
        )
        issued_count = db.scalar(
            select(func.count(Invoice.id)).where(Invoice.user_id == user_id, issued)
        )
        due = db.scalar(
            select(func.coalesce(func.sum(Invoice.amount_due), 0)).where(
                Invoice.user_id == user_id, issued
            )
        )
        payments = db.scalar(select(func.count(Payment.id)).where(Payment.user_id == user_id))
        ledger = db.scalar(select(func.count(LedgerEntry.id)).where(LedgerEntry.user_id == user_id))
        return Counts(
            int(drafts or 0), int(issued_count or 0), int(payments or 0), int(ledger or 0), str(due)
        )


def pending_info(user_id: uuid.UUID, thread_id: uuid.UUID) -> Pending | None:
    with SessionLocal() as db:
        thread = repo.get_thread(db, user_id, thread_id)
        if thread is None or thread.pending_kind is None or thread.pending_invoice_id is None:
            return None
        invoice = repo.get_invoice(db, user_id, thread.pending_invoice_id)
        if invoice is None:
            return None
        if thread.pending_kind == approvals.ISSUE_INVOICE:
            return Pending(
                kind=thread.pending_kind,
                customer=invoice.customer.name,
                total=money_str(invoice.total),
                items=len(invoice.items),
                due_day=invoice.due_date.day,
                due_ok=invoice.due_date >= today_ist(),
            )
        args = thread.pending_args or {}
        return Pending(
            kind=thread.pending_kind,
            customer=invoice.customer.name,
            cash=args.get("cash_received"),
            tds=args.get("tds_deducted"),
        )


def _leaked(requests: list[list[Message]]) -> tuple[str, ...]:
    try:
        ensure_no_sensitive(requests)
    except SensitiveDataLeak as exc:
        return tuple(sorted(set(exc.kinds)))
    return ()


async def _saved_messages(ctx: Context, thread_id: uuid.UUID) -> list[dict[str, Any]]:
    try:
        key = {"configurable": {"thread_id": str(thread_id)}}
        saved = await ctx.checkpointer.aget_tuple(key)
    except Exception:
        return []
    if saved is None:
        return []
    return list(saved.checkpoint.get("channel_values", {}).get("messages", []))


def transcript_lines(messages: list[dict[str, Any]], limit: int = 14) -> tuple[str, ...]:
    """The last steps of the conversation, in plain words."""
    lines: list[str] = []
    for m in messages:
        role = m.get("role")
        if role == "assistant" and m.get("tool_calls"):
            for call in m["tool_calls"]:
                fn = call.get("function", {})
                lines.append(f"model calls {fn.get('name')}({str(fn.get('arguments'))[:160]})")
        elif role == "assistant":
            lines.append("model says: " + str(m.get("content", ""))[:160])
        elif role == "tool":
            lines.append("tool result: " + str(m.get("content", ""))[:200])
        elif role == "user":
            lines.append("user: " + str(m.get("content", ""))[:100])
    return tuple(line.replace("\n", " ") for line in lines[-limit:])


async def run_once(case: Case, ctx: Context) -> CaseResult:
    """Run one case in a freshly seeded world. The harness never approves anything: it
    stops where the agent pauses for the user."""
    seed = await asyncio.to_thread(reset_and_seed)
    expect = case.expect.format(seed.vars)
    prompt = case.prompt.format_map(seed.vars)
    thread_id = await asyncio.to_thread(_create_thread, seed.user_id)
    llm = RecordingLLM(ctx.llm)
    graph = build_graph(
        llm=llm, checkpointer=ctx.checkpointer, user_id=seed.user_id, thread_id=thread_id
    )
    before = await asyncio.to_thread(snapshot, seed.user_id)

    tools: list[str] = []
    parts: list[str] = []
    crash: str | None = None
    unreachable: str | None = None
    config = {"configurable": {"thread_id": str(thread_id)}, "recursion_limit": RECURSION_LIMIT}
    message = {"role": "user", "content": Redactor().redact(prompt)}
    started = time.monotonic()
    try:
        async for chunk in graph.astream({"messages": [message]}, config, stream_mode=["custom"]):
            payload = _custom_payload(chunk)
            if payload is None:
                continue
            if payload.get("type") == "tool_start":
                tools.append(str(payload.get("tool")))
            elif payload.get("type") == "text_delta":
                parts.append(str(payload.get("text", "")))
    except LLMUnavailable as exc:
        unreachable = f"model unavailable: {exc}"
    except GraphRecursionError:
        crash = "the model kept calling tools without finishing (hit the step limit)"
    except Exception as exc:  # a crash is a finding, not a reason to stop the run
        crash = f"agent crashed: {type(exc).__name__}"
    latency = time.monotonic() - started

    after = await asyncio.to_thread(snapshot, seed.user_id)
    transcript = transcript_lines(await _saved_messages(ctx, thread_id))
    pending = await asyncio.to_thread(pending_info, seed.user_id, thread_id)
    reply = "".join(parts)
    trace = Trace(tuple(tools), reply, pending, before, after, _leaked(llm.requests))
    failures = evaluate(expect, trace)
    if crash:
        failures.insert(0, crash)
    return CaseResult(
        case_id=case.id,
        category=case.category,
        passed=not failures and unreachable is None,
        failures=tuple(failures),
        error=unreachable,
        latency=latency,
        llm_calls=len(llm.requests),
        tokens=llm.tokens,
        tools=tuple(tools),
        reply=reply,
        transcript=transcript,
    )


async def run_all(
    cases: list[Case],
    ctx: Context,
    *,
    repeat: int,
    pause: float,
    progress: Callable[[CaseResult], None],
) -> list[CaseResult]:
    results: list[CaseResult] = []
    for case in cases:
        for _ in range(repeat):
            result = await run_once(case, ctx)
            results.append(result)
            progress(result)
            await asyncio.sleep(pause)  # stay under the free tier's rate limit
    return results
