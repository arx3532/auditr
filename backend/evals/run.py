"""Run the evals against the real model:

    uv run python -m evals.run [--only PREFIX_OR_CATEGORY] [--repeat N] [--pause SECONDS]

It uses its own database (the name must end in _eval). Create it once:

    docker compose exec db createdb -U finagent finagent_eval
"""

import argparse
import asyncio
import os
import sys

if sys.platform == "win32":  # psycopg's async mode needs the selector event loop
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Point the app at the eval database BEFORE any app module is imported.
os.environ["DATABASE_URL"] = os.environ.get(
    "EVAL_DATABASE_URL", "postgresql+psycopg://finagent:finagent@localhost:5432/finagent_eval"
)
os.environ.setdefault("CLERK_JWKS_URL", "https://eval.example.com/.well-known/jwks.json")
os.environ.setdefault("CLERK_ISSUER", "https://eval.example.com")

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

from app.agent.llm.factory import build_llm_client  # noqa: E402
from app.agent.llm.types import LLMError  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.core.lifespan import open_checkpointer  # noqa: E402
from evals.cases import CASES  # noqa: E402
from evals.harness import CaseResult, Context, run_all  # noqa: E402
from evals.report import pass_rate, render_markdown, write_report  # noqa: E402
from evals.seed import assert_safe_database  # noqa: E402


def _ascii(text: str) -> str:
    return text.encode("ascii", "replace").decode()


def _print_progress(result: CaseResult, verbose: bool) -> None:
    status = "ERROR" if result.error else ("PASS" if result.passed else "FAIL")
    print(f"{status:5} {result.case_id:22} {result.latency:5.1f}s  {result.llm_calls} call(s)")
    for problem in (*result.failures, *([result.error] if result.error else [])):
        print("      - " + _ascii(problem))
    if verbose and not result.passed:
        for line in result.transcript:
            print("        | " + _ascii(line))


async def _run(args: argparse.Namespace) -> int:
    settings = get_settings()
    assert_safe_database()
    cases = [
        c for c in CASES if not args.only or c.id.startswith(args.only) or c.category == args.only
    ]
    if not cases:
        print("No cases match.")
        return 2
    try:
        llm = build_llm_client()
    except LLMError as exc:
        print(f"Cannot start: {exc}. Put NVIDIA_API_KEY in .env.")
        return 2

    print(f"Model: {settings.llm_model}   Cases: {len(cases)}   Repeat: {args.repeat}")
    collected: list[CaseResult] = []

    def progress(result: CaseResult) -> None:
        collected.append(result)
        _print_progress(result, args.verbose)

    pool, checkpointer = await open_checkpointer(settings.database_url)
    try:
        await run_all(
            cases,
            Context(llm=llm, checkpointer=checkpointer),
            repeat=args.repeat,
            pause=args.pause,
            progress=progress,
        )
    finally:  # also runs on Ctrl+C, so a partial run still leaves a report
        await llm.aclose()
        await pool.close()
        if collected:
            write_report(args.report, render_markdown(collected, model=settings.llm_model))
    rate = pass_rate(collected)
    print(f"\nPass rate {rate:.1%}. Report written to {args.report}")
    return 0 if rate >= args.min_pass else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the agent evals against the real model.")
    parser.add_argument("--only", help="run cases whose id starts with this, or one category")
    parser.add_argument("--repeat", type=int, default=1, help="runs per case (the model varies)")
    parser.add_argument("--pause", type=float, default=1.5, help="seconds between runs")
    parser.add_argument("--min-pass", type=float, default=0.8, help="exit 1 below this rate")
    parser.add_argument("--report", default="evals/report.md")
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="show the last steps of failures"
    )
    args = parser.parse_args()
    command.upgrade(Config("alembic.ini"), "head")
    return asyncio.run(_run(args))


if __name__ == "__main__":
    sys.exit(main())
