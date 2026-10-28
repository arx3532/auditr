import json

from pydantic import BaseModel

from app.agent.llm.schema import json_schema_for


class Item(BaseModel):
    description: str
    taxable_value: str


class Args(BaseModel):
    customer_ref: str
    items: list[Item]
    title: str | None = None  # a property that happens to be called "title"


def test_schema_is_self_contained() -> None:
    schema = json_schema_for(Args)
    assert "$defs" not in schema
    assert "$ref" not in json.dumps(schema)
    assert "title" not in schema  # the schema's own title is removed...
    assert "title" in schema["properties"]  # ...but a property named title survives
    item_props = schema["properties"]["items"]["items"]["properties"]
    assert set(item_props) == {"description", "taxable_value"}
    assert set(schema["required"]) == {"customer_ref", "items"}
