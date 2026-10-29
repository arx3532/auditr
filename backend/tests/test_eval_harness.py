import asyncio
from datetime import timedelta

from app.agent.llm.fake import FakeLLM, text_response, tool_response
from app.agent.llm.types import LLMResponse
from app.config import get_settings
from app.core.clock import today_ist
from app.core.lifespan import open_checkpointer
from evals.cases import Case, Expect
from evals.harness import CaseResult, Context, run_once


def run(case: Case, *responses: LLMResponse) -> CaseResult:
    async def scenario() -> CaseResult:
        pool, saver = await open_checkpointer(get_settings().database_url)
        try:
            return await run_once(case, Context(llm=FakeLLM(list(responses)), checkpointer=saver))
        finally:
            await pool.close()

    return asyncio.run(scenario())


def draft_call() -> LLMResponse:
    return tool_response(
        "create_invoice_draft",
        {
            "customer_name": "AdTech Pvt. Ltd.",
            "due_date": (today_ist() + timedelta(days=10)).isoformat(),
            "items": [{"description": "Logo", "taxable_value": "50000.00", "gst_rate": "18"}],
        },
    )


DRAFT_CASE = Case(
    "t-draft",
    "draft",
    "Invoice AdTech 50000 at 18% GST due {d10}.",
    Expect(approval="issue_invoice", draft_total="59000.00", draft_customer="AdTech Pvt. Ltd."),
)


def test_a_correct_run_passes() -> None:
    result = run(DRAFT_CASE, draft_call(), text_response("Draft ready."))
    assert result.passed, result.failures
    assert result.tools == ("create_invoice_draft",)
    assert result.llm_calls == 1  # the run stops where the agent waits for the user


def test_a_model_that_only_chats_fails_the_case() -> None:
    result = run(DRAFT_CASE, text_response("Sure, tell me more."))
    assert not result.passed
    assert any("no approval" in p for p in result.failures)


def test_lookup_case_with_reply_checks() -> None:
    case = Case(
        "t-lookup",
        "lookup",
        "Who are my customers?",
        Expect(tools_all=("list_customers",), mentions=(("adtech",), ("bluewave",))),
    )
    good = run(
        case,
        tool_response("list_customers", {}),
        text_response("You work with AdTech Pvt. Ltd. and Bluewave Studio."),
    )
    assert good.passed, good.failures
    bad = run(case, tool_response("list_customers", {}), text_response("You have some customers."))
    assert not bad.passed


def test_each_run_starts_from_a_fresh_world() -> None:
    first = run(DRAFT_CASE, draft_call())
    second = run(DRAFT_CASE, draft_call())
    assert first.passed and second.passed  # the second run would see 2 drafts if state leaked
