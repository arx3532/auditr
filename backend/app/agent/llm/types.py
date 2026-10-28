import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol

Message = dict[str, Any]


class LLMError(Exception):
    """Base class. Messages never contain prompts, completions or keys."""


class LLMUnavailable(LLMError):
    """Network trouble, rate limiting or server errors, after retries."""


class LLMBadResponse(LLMError):
    """The server answered, but not with something we can use."""


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]

    def to_openai(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    raw_arguments: str
    arguments: dict[str, Any] | None  # None when the model sent invalid JSON


@dataclass(frozen=True)
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0


@dataclass(frozen=True)
class LLMResponse:
    text: str
    tool_calls: tuple[ToolCall, ...]
    usage: Usage
    finish_reason: str | None
    latency_ms: int


@dataclass(frozen=True)
class TextDelta:
    text: str


@dataclass(frozen=True)
class StreamDone:
    response: LLMResponse


StreamEvent = TextDelta | StreamDone


class LLMClient(Protocol):
    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> LLMResponse: ...

    def stream(
        self,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[StreamEvent]: ...

    async def aclose(self) -> None: ...


def parse_tool_arguments(raw: str) -> dict[str, Any] | None:
    """Models sometimes send broken JSON. Return None and let the agent handle it."""
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except ValueError:
        return None
    return value if isinstance(value, dict) else None
