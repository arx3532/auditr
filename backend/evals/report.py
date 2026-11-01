from collections import defaultdict
from pathlib import Path

from app.core.clock import today_ist
from evals.cases import CATEGORIES
from evals.harness import CaseResult


def counted(results: list[CaseResult]) -> list[CaseResult]:
    """Runs where the model could not be reached say nothing about the agent."""
    return [r for r in results if r.error is None]


def pass_rate(results: list[CaseResult]) -> float:
    valid = counted(results)
    return sum(r.passed for r in valid) / len(valid) if valid else 0.0


def _p95(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[int(0.95 * (len(ordered) - 1))] if ordered else 0.0


def render_markdown(results: list[CaseResult], *, model: str) -> str:
    valid = counted(results)
    errors = len(results) - len(valid)
    passed = sum(r.passed for r in valid)
    latencies = [r.latency for r in valid]
    lines = [
        "# Eval report",
        "",
        f"- Model: `{model}`",
        f"- Date: {today_ist().isoformat()}",
        f"- Runs: {len(results)} ({errors} could not reach the model)",
        f"- **Pass rate: {pass_rate(results):.1%} ({passed}/{len(valid)})**",
        f"- Latency: average {sum(latencies) / max(len(latencies), 1):.1f}s, "
        f"p95 {_p95(latencies):.1f}s",
        f"- Tokens: {sum(r.tokens for r in valid)} total, "
        f"{sum(r.llm_calls for r in valid) / max(len(valid), 1):.1f} model calls per run",
        "",
        "| Category | Passed | Total |",
        "|---|---|---|",
    ]
    by_category: dict[str, list[CaseResult]] = defaultdict(list)
    for result in valid:
        by_category[result.category].append(result)
    for category in CATEGORIES:
        group = by_category.get(category, [])
        lines.append(f"| {category} | {sum(r.passed for r in group)} | {len(group)} |")

    failed = [r for r in results if not r.passed]
    if failed:
        lines += ["", "## Failures", ""]
    for result in failed:
        lines.append(f"### {result.case_id}")
        for problem in (*result.failures, *([result.error] if result.error else [])):
            lines.append(f"- {problem}")
        lines.append(f"- Tools called: {list(result.tools) or 'none'}")
        reply = result.reply.strip().replace("\n", " ")
        lines += [f"- Reply: {reply[:300] or '(empty)'}", ""]
    return "\n".join(lines) + "\n"


def write_report(path: str, text: str) -> None:
    Path(path).open("a", encoding="utf-8").write(text)
