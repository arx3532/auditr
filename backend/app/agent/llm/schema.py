from typing import Any

from pydantic import BaseModel


def json_schema_for(model: type[BaseModel]) -> dict[str, Any]:
    """JSON schema for a tool's arguments, with $ref inlined and titles removed.
    Some model servers choke on $defs, so the schema is self-contained."""
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})
    return _clean(_inline(schema, defs))  # type: ignore[no-any-return]


def _inline(node: Any, defs: dict[str, Any]) -> Any:
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/$defs/"):
            target = defs[ref.removeprefix("#/$defs/")]
            extra = {k: v for k, v in node.items() if k != "$ref"}
            return _inline({**target, **extra}, defs)
        return {k: _inline(v, defs) for k, v in node.items()}
    if isinstance(node, list):
        return [_inline(v, defs) for v in node]
    return node


def _clean(node: Any) -> Any:
    if isinstance(node, dict):
        out: dict[str, Any] = {}
        for key, value in node.items():
            if key == "title":
                continue
            if key == "properties" and isinstance(value, dict):
                # keep property NAMES, even one called "title"; clean what they contain
                out[key] = {name: _clean(sub) for name, sub in value.items()}
            else:
                out[key] = _clean(value)
        return out
    if isinstance(node, list):
        return [_clean(v) for v in node]
    return node
