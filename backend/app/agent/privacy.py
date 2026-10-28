"""Privacy filter: keeps identifiers away from the LLM provider.

Best-effort pattern matching. It over-redacts on purpose: any run of 9 to 18 digits
is masked, which also hides phone numbers and absurdly large amounts. It cannot catch
obfuscated identifiers (for example a PAN typed with spaces between the characters),
so the design also keeps raw customer data out of tool results.
"""

import re
import unicodedata
from collections.abc import Iterator
from functools import partial
from typing import Any

# A match must not touch letters, digits, hyphens or dots on either side. That keeps
# UUID pieces, invoice numbers, dates and decimal amounts from being masked by accident.
_BEFORE = r"(?<![A-Za-z0-9.\-])"
_AFTER = r"(?![A-Za-z0-9\-]|\.\d)"

# Order matters: more specific patterns run first.
PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("EMAIL", re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")),
    (
        "GSTIN",
        re.compile(_BEFORE + r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]" + _AFTER, re.IGNORECASE),
    ),
    ("PAN", re.compile(_BEFORE + r"[A-Z]{5}\d{4}[A-Z]" + _AFTER, re.IGNORECASE)),
    ("AADHAAR", re.compile(_BEFORE + r"\d{4}[ \-]?\d{4}[ \-]?\d{4}" + _AFTER)),
    ("NUMBER", re.compile(_BEFORE + r"\d{9,18}" + _AFTER)),
)

_TOKEN = re.compile(r"\[(?:EMAIL|GSTIN|PAN|AADHAAR|NUMBER)_\d+\]")
_ZERO_WIDTH = {ord(c): None for c in "\u200b\u200c\u200d\u2060\ufeff"}


class SensitiveDataLeak(Exception):
    """Raised when a request that is about to leave the server still holds sensitive data."""

    def __init__(self, kinds: list[str]) -> None:
        super().__init__(
            "Sensitive data found in an outgoing request: " + ", ".join(sorted(set(kinds)))
        )
        self.kinds = kinds


def normalize(text: str) -> str:
    """Fold full-width characters to ASCII and drop zero-width characters, so that
    simple obfuscation does not slip past the patterns."""
    return unicodedata.normalize("NFKC", text).translate(_ZERO_WIDTH)


def _canonical(kind: str, value: str) -> str:
    if kind == "AADHAAR":
        return re.sub(r"\D", "", value)
    if kind in ("PAN", "GSTIN"):
        return value.upper()
    if kind == "EMAIL":
        return value.lower()
    return value


class Redactor:
    """Replaces sensitive values with stable tokens. The same value always gets the
    same token within one Redactor, and restore() maps tokens back for the owner."""

    def __init__(self) -> None:
        self._tokens: dict[tuple[str, str], str] = {}
        self._originals: dict[str, str] = {}
        self._counts: dict[str, int] = {}

    def _sub(self, kind: str, match: re.Match[str]) -> str:
        value = match.group(0)
        key = (kind, _canonical(kind, value))
        token = self._tokens.get(key)
        if token is None:
            number = self._counts.get(kind, 0) + 1
            self._counts[kind] = number
            token = f"[{kind}_{number}]"
            self._tokens[key] = token
            self._originals[token] = value
        return token

    def redact(self, text: str) -> str:
        out = normalize(text)
        for kind, pattern in PATTERNS:
            out = pattern.sub(partial(self._sub, kind), out)
        return out

    def restore(self, text: str) -> str:
        return _TOKEN.sub(lambda m: self._originals.get(m.group(0), m.group(0)), text)


def find_sensitive(text: str) -> list[str]:
    normalised = normalize(text)
    return [kind for kind, pattern in PATTERNS if pattern.search(normalised)]


def _strings(node: Any) -> Iterator[str]:
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from _strings(value)
    elif isinstance(node, list | tuple):
        for value in node:
            yield from _strings(value)


def ensure_no_sensitive(payload: Any) -> None:
    """Scan every string inside a request body (not its JSON text, where escapes like
    \\n would hide the start of a number). Raises instead of sending."""
    kinds = [kind for text in _strings(payload) for kind in find_sensitive(text)]
    if kinds:
        raise SensitiveDataLeak(kinds)


def redact_messages(messages: list[dict[str, Any]], redactor: Redactor) -> list[dict[str, Any]]:
    """Return a redacted copy of chat messages. The input is not modified."""
    result: list[dict[str, Any]] = []
    for message in messages:
        copy = dict(message)
        content = copy.get("content")
        if isinstance(content, str):
            copy["content"] = redactor.redact(content)
        elif isinstance(content, list):
            copy["content"] = [
                {**part, "text": redactor.redact(part["text"])}
                if isinstance(part, dict) and isinstance(part.get("text"), str)
                else part
                for part in content
            ]
        result.append(copy)
    return result
