import copy
import json
import uuid
from collections.abc import AsyncIterator, Sequence
from typing import Any

from app.agent.llm.types import (
    LLMResponse,
    Message,
    StreamDone,
    StreamEvent,
    TextDelta,
    ToolCall,
    ToolSpec,
    Usage,
)
from app.agent.privacy import ensure_no_sensitive


def text_response(text: str) -> LLMResponse:
    return LLMResponse(text, (), Usage(1, 1), "stop", 0)


def tool_response(name: str, arguments: dict[str, Any], text: str = "") -> LLMResponse:
    raw = json.dumps(arguments)
    call = ToolCall(f"call_{uuid.uuid4().hex[:8]}", name, raw, arguments)
    return LLMResponse(text, (call,), Usage(1, 1), "tool_calls", 0)


class FakeLLM:
    """Scripted LLM for tests and evals. Applies the same sensitive-data guard as the
    real client, and records every request it receives."""

    def __init__(self, responses: Sequence[LLMResponse | Exception]) -> None:
        self._responses = list(responses)
        self.requests: list[list[Message]] = []

    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> LLMResponse:
        ensure_no_sensitive(messages)
        self.requests.append(copy.deepcopy(messages))
        if not self._responses:
            raise AssertionError("FakeLLM ran out of scripted responses")
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    async def stream(
        self,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[StreamEvent]:
        response = await self.complete(
            messages, tools, temperature=temperature, max_tokens=max_tokens
        )
        if response.text:
            yield TextDelta(response.text)
        yield StreamDone(response)

    async def aclose(self) -> None:
        return None
