import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.domain.rules_config import get_rule_set


def write_rules(path: Path) -> Path:
    path.write_text(
        json.dumps(
            {
                "rule_sets": [
                    {"effective_from": "2024-01-01", "allowed_gst_rates": ["0", "5"]},
                    {"effective_from": "2025-06-01", "allowed_gst_rates": ["0", "7"]},
                ]
            }
        ),
        encoding="utf-8",
    )
    return path


def test_picks_rule_set_by_date(tmp_path: Path) -> None:
    path = write_rules(tmp_path / "rules.json")
    assert get_rule_set(date(2024, 12, 31), path).allowed_gst_rates == {
        Decimal("0"),
        Decimal("5"),
    }
    assert get_rule_set(date(2025, 6, 1), path).allowed_gst_rates == {
        Decimal("0"),
        Decimal("7"),
    }


def test_no_rules_before_first_effective_date(tmp_path: Path) -> None:
    path = write_rules(tmp_path / "rules.json")
    with pytest.raises(LookupError):
        get_rule_set(date(2023, 1, 1), path)
