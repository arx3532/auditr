from app.agent.tools import TOOLS
from evals.cases import APPROVALS, CASES, CATEGORIES, GATED

VARS = {
    "inv1": "INV/2026-27/0001",
    "inv2": "INV/2026-27/0002",
    "inv3": "INV/2026-27/0003",
    "inv4": "INV/2026-27/0004",
    "d10": "2026-11-08",
    "d30": "2026-11-28",
}


def test_ids_are_unique_and_the_set_is_a_sensible_size() -> None:
    ids = [c.id for c in CASES]
    assert len(ids) == len(set(ids))
    assert 30 <= len(ids) <= 60


def test_every_category_is_covered() -> None:
    for category in CATEGORIES:
        assert sum(c.category == category for c in CASES) >= 3, category
    assert {c.category for c in CASES} <= set(CATEGORIES)


def test_placeholders_all_resolve() -> None:
    for case in CASES:
        case.prompt.format_map(VARS)
        case.expect.format(VARS)


def test_expectations_are_coherent() -> None:
    tool_names = {t.name for t in TOOLS}
    assert set(GATED) <= tool_names
    for case in CASES:
        e = case.expect
        assert e.approval in APPROVALS, case.id
        for name in (*e.tools_any, *e.tools_all, *e.tools_not):
            assert name in tool_names, (case.id, name)
        if e.draft_total or e.draft_customer or e.draft_items:
            assert e.approval == "issue_invoice", case.id
        if e.cash or e.tds:
            assert e.approval == "record_payment", case.id
        if e.approval == "none":
            assert not (e.draft_total or e.cash or e.due_day), case.id


def test_lookups_and_refusals_never_expect_an_action() -> None:
    for case in CASES:
        if case.category in ("lookup", "refuse"):
            assert case.expect.approval == "none", case.id
