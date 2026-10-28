import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

DEFAULT_PATH = Path(__file__).parent / "data" / "tax_rules.json"


@dataclass(frozen=True)
class RuleSet:
    effective_from: date
    allowed_gst_rates: frozenset[Decimal]


def load_rule_sets(path: Path = DEFAULT_PATH) -> list[RuleSet]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rule_sets = [
        RuleSet(
            effective_from=date.fromisoformat(item["effective_from"]),
            allowed_gst_rates=frozenset(Decimal(r) for r in item["allowed_gst_rates"]),
        )
        for item in data["rule_sets"]
    ]
    return sorted(rule_sets, key=lambda r: r.effective_from)


def get_rule_set(on: date, path: Path = DEFAULT_PATH) -> RuleSet:
    """The rule set in force on a given date (the latest one that has started)."""
    applicable = [r for r in load_rule_sets(path) if r.effective_from <= on]
    if not applicable:
        raise LookupError(f"No tax rules effective on {on}")
    return applicable[-1]
