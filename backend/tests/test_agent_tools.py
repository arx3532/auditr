import json

from app.agent.tools import TOOL_SPECS, TOOLS


def test_tool_specs_are_self_contained() -> None:
    assert {s.name for s in TOOL_SPECS} == {t.name for t in TOOLS}
    for spec in TOOL_SPECS:
        text = json.dumps(spec.parameters)
        assert "$ref" not in text and "$defs" not in text
        assert spec.parameters["type"] == "object"


def test_money_fields_are_described_as_text() -> None:
    specs = {s.name: s.parameters for s in TOOL_SPECS}
    assert specs["record_payment"]["properties"]["cash_received"]["type"] == "string"
    item = specs["create_invoice_draft"]["properties"]["items"]["items"]
    assert item["properties"]["taxable_value"]["type"] == "string"
    assert specs["create_invoice_draft"]["properties"]["due_date"]["format"] == "date"
