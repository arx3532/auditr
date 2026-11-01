import asyncio
import json
import logging
import random
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import httpx

from app.agent.llm.types import (
    LLMBadResponse,
    LLMResponse,
    LLMUnavailable,
    Message,
    StreamDone,
    StreamEvent,
    TextDelta,
    ToolCall,
    ToolSpec,
    Usage,
    parse_tool_arguments,
)
from app.agent.privacy import ensure_no_sensitive

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "meta/muse-glimmer-30b"
CHAT_PATH = "/chat/completions"
RETRYABLE = {429, 500, 502, 503, 504}

Sleep = Callable[[float], Awaitable[None]]


async def _default_sleep(seconds: float) -> None:
    await asyncio.sleep(seconds)


def _new_call_id() -> str:
    return f"call_{uuid.uuid4().hex[:12]}"


def _load_json(text: str) -> dict[str, Any]:
    try:
        value = json.loads(text)
    except ValueError:
        raise LLMBadResponse("Invalid JSON from the LLM") from None
    if not isinstance(value, dict):
        raise LLMBadResponse("Unexpected JSON from the LLM")
    return value


def _usage(raw: Any) -> Usage:
    try:
        return Usage(int(raw.get("prompt_tokens") or 0), int(raw.get("completion_tokens") or 0))
    except (AttributeError, TypeError, ValueError):
        return Usage()


def _tool_call(raw: Any) -> ToolCall:
    function = raw["function"]
    arguments = function.get("arguments") or ""
    if not isinstance(arguments, str):  # some servers send an object instead of a string
        arguments = json.dumps(arguments)
    return ToolCall(
        id=raw.get("id") or _new_call_id(),
        name=function["name"],
        raw_arguments=arguments,
        arguments=parse_tool_arguments(arguments),
    )


def _parse_response(data: Any, latency_ms: int) -> LLMResponse:
    try:
        choice = data["choices"][0]
        message = choice["message"]
        return LLMResponse(
            text=message.get("content") or "",
            tool_calls=tuple(_tool_call(c) for c in message.get("tool_calls") or []),
            usage=_usage(data.get("usage")),
            finish_reason=choice.get("finish_reason"),
            latency_ms=latency_ms,
        )
    except (KeyError, IndexError, TypeError, AttributeError):
        raise LLMBadResponse("Unexpected response shape from the LLM") from None


def _sse_payload(line: str) -> str | None:
    if not line.startswith("data:"):
        return None  # comments, blank lines, keep-alives
    return line[5:].strip()


def _apply_tool_deltas(slots: dict[int, dict[str, str]], deltas: list[Any]) -> None:
    for delta in deltas:
        slot = slots.setdefault(int(delta.get("index", 0)), {"id": "", "name": "", "args": ""})
        if delta.get("id"):
            slot["id"] = delta["id"]
        function = delta.get("function") or {}
        if function.get("name"):
            slot["name"] = function["name"]
        if function.get("arguments"):
            slot["args"] += function["arguments"]


class NvidiaClient:
    """Client for NVIDIA's hosted, OpenAI-compatible chat API."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        model: str = DEFAULT_MODEL,
        timeout: float = 60.0,
        max_retries: int = 3,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Sleep = _default_sleep,
    ) -> None:
        self._model = model
        self._max_retries = max_retries
        self._sleep = sleep
        self._http = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    def _body(
        self,
        messages: list[Message],
        tools: list[ToolSpec] | None,
        temperature: float,
        max_tokens: int,
        *,
        stream: bool,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }
        if tools:
            body["tools"] = [t.to_openai() for t in tools]
            body["tool_choice"] = "auto"
        ensure_no_sensitive(body)  # fail closed: never send what should have been masked
        return body

    @staticmethod
    def _retry_delay(attempt: int, retry_after: str | None) -> float:
        if retry_after and retry_after.isdigit():
            return min(float(retry_after), 10.0)
        delay = min(0.5 * float(2**attempt), 8.0)
        jitter = random.random() * 0.25
        return delay + jitter

    async def _post_with_retries(self, body: dict[str, Any]) -> httpx.Response:
        for attempt in range(self._max_retries + 1):
            retry_after: str | None = None
            try:
                response = await self._http.post(CHAT_PATH, json=body)
                if response.status_code not in RETRYABLE:
                    return response
                reason = f"status {response.status_code}"
                retry_after = response.headers.get("retry-after")
            except httpx.TransportError:
                reason = "network error"
            if attempt == self._max_retries:
                raise LLMUnavailable(f"LLM request failed after retries ({reason})")
            await self._sleep(self._retry_delay(attempt, retry_after))
        raise LLMUnavailable("LLM request failed")  # unreachable, keeps mypy happy

    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> LLMResponse:
        body = self._body(messages, tools, temperature, max_tokens, stream=False)
        started = time.monotonic()
        response = await self._post_with_retries(body)
        if response.status_code != 200:
            raise LLMBadResponse(f"LLM returned status {response.status_code}")
        try:
            data = response.json()
        except ValueError:
            raise LLMBadResponse("Invalid JSON from the LLM") from None
        result = _parse_response(data, int((time.monotonic() - started) * 1000))
        self._log(result)
        return result

    async def stream(
        self,
        messages: list[Message],
        tools: list[ToolSpec] | None = None,
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> AsyncIterator[StreamEvent]:
        body = self._body(messages, tools, temperature, max_tokens, stream=True)
        started = time.monotonic()
        for attempt in range(self._max_retries + 1):
            text_parts: list[str] = []
            slots: dict[int, dict[str, str]] = {}
            usage = Usage()
            finish: str | None = None
            reason = ""
            retry_after: str | None = None
            try:
                async with self._http.stream("POST", CHAT_PATH, json=body) as response:
                    if response.status_code in RETRYABLE:
                        reason = f"status {response.status_code}"
                        retry_after = response.headers.get("retry-after")
                    elif response.status_code != 200:
                        raise LLMBadResponse(f"LLM returned status {response.status_code}")
                    else:
                        async for line in response.aiter_lines():
                            payload = _sse_payload(line)
                            if payload is None:
                                continue
                            if payload == "[DONE]":
                                break
                            chunk = _load_json(payload)
                            for choice in chunk.get("choices") or []:
                                delta = choice.get("delta") or {}
                                piece = delta.get("content")
                                if piece:
                                    text_parts.append(piece)
                                    yield TextDelta(piece)
                                _apply_tool_deltas(slots, delta.get("tool_calls") or [])
                                finish = choice.get("finish_reason") or finish
                            if chunk.get("usage"):
                                usage = _usage(chunk["usage"])
                        calls = tuple(
                            ToolCall(
                                id=slot["id"] or _new_call_id(),
                                name=slot["name"],
                                raw_arguments=slot["args"],
                                arguments=parse_tool_arguments(slot["args"]),
                            )
                            for _, slot in sorted(slots.items())
                            if slot["name"]
                        )
                        result = LLMResponse(
                            text="".join(text_parts),
                            tool_calls=calls,
                            usage=usage,
                            finish_reason=finish,
                            latency_ms=int((time.monotonic() - started) * 1000),
                        )
                        self._log(result)
                        yield StreamDone(result)
                        return
            except httpx.TransportError:
                if text_parts or slots:  # already sent output to the caller: cannot retry
                    raise LLMUnavailable("LLM stream was interrupted") from None
                reason = "network error"
            if attempt == self._max_retries:
                raise LLMUnavailable(f"LLM request failed after retries ({reason})")
            await self._sleep(self._retry_delay(attempt, retry_after))

    def _log(self, result: LLMResponse) -> None:
        # Metrics only. Never log prompts, completions, tool arguments or the key.
        logger.info(
            "llm_call model=%s latency_ms=%d prompt_tokens=%d completion_tokens=%d tools=%s",
            self._model,
            result.latency_ms,
            result.usage.prompt_tokens,
            result.usage.completion_tokens,
            [c.name for c in result.tool_calls],
        )
