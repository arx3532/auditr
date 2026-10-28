import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
import pytest

from app.agent.llm.nvidia import NvidiaClient
from app.agent.llm.types import (
    LLMBadResponse,
    LLMUnavailable,
    StreamDone,
    TextDelta,
)
from app.agent.privacy import Redactor, SensitiveDataLeak

MESSAGES = [{"role": "user", "content": "Hello"}]


@asynccontextmanager
async def open_client(
    handler: Any, **kwargs: Any
) -> AsyncIterator[tuple[NvidiaClient, list[float]]]:
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    client = NvidiaClient(
        "nvapi-test",
        transport=httpx.MockTransport(handler),
        sleep=fake_sleep,
        **kwargs,
    )
    try:
        yield client, sleeps
    finally:
        await client.aclose()


def ok(content: str | None = "Hi", tool_calls: list[Any] | None = None) -> httpx.Response:
    message: dict[str, Any] = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
    return httpx.Response(
        200,
        json={
            "choices": [{"message": message, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2},
        },
    )


def sse(*chunks: dict[str, Any]) -> bytes:
    lines = "".join(f"data: {json.dumps(c)}\n\n" for c in chunks)
    return (lines + "data: [DONE]\n\n").encode()


def test_complete_parses_text_and_usage_and_sends_expected_request() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return ok("Hi there")

    async def scenario() -> None:
        async with open_client(handler, model="test/model") as (client, _):
            result = await client.complete(MESSAGES)
        assert result.text == "Hi there"
        assert (result.usage.prompt_tokens, result.usage.completion_tokens) == (3, 2)
        assert result.finish_reason == "stop"

    asyncio.run(scenario())
    request = seen[0]
    assert request.url.path.endswith("/chat/completions")
    assert request.headers["authorization"] == "Bearer nvapi-test"
    body = json.loads(request.content)
    assert body["model"] == "test/model"
    assert body["stream"] is False
    assert "nvapi-test" not in request.content.decode()


def test_tool_call_parsed_and_broken_json_survives() -> None:
    good = {"id": "c1", "function": {"name": "lookup", "arguments": '{"name": "Asha"}'}}
    bad = {"id": "c2", "function": {"name": "lookup", "arguments": '{"name": '}}

    async def scenario() -> None:
        async with open_client(lambda r: ok(None, [good, bad])) as (client, _):
            result = await client.complete(MESSAGES)
        assert result.text == ""
        first, second = result.tool_calls
        assert first.arguments == {"name": "Asha"}
        assert second.arguments is None  # invalid JSON is flagged, not raised
        assert second.raw_arguments == '{"name": '

    asyncio.run(scenario())


def test_retries_on_429_and_honours_retry_after() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, headers={"retry-after": "2"})
        return ok()

    async def scenario() -> None:
        async with open_client(handler) as (client, sleeps):
            result = await client.complete(MESSAGES)
            assert result.text == "Hi"
            assert sleeps == [2.0]

    asyncio.run(scenario())
    assert calls == 2


def test_gives_up_after_max_retries() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    async def scenario() -> None:
        async with open_client(handler, max_retries=2) as (client, sleeps):
            with pytest.raises(LLMUnavailable):
                await client.complete(MESSAGES)
            assert len(sleeps) == 2

    asyncio.run(scenario())
    assert calls == 3


def test_network_errors_are_retried_then_reported() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    async def scenario() -> None:
        async with open_client(handler, max_retries=1) as (client, _):
            with pytest.raises(LLMUnavailable):
                await client.complete(MESSAGES)

    asyncio.run(scenario())


def test_auth_errors_are_not_retried() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(401, json={"detail": "bad key"})

    async def scenario() -> None:
        async with open_client(handler) as (client, _):
            with pytest.raises(LLMBadResponse):
                await client.complete(MESSAGES)

    asyncio.run(scenario())
    assert calls == 1


def test_malformed_response_rejected() -> None:
    async def scenario() -> None:
        async with open_client(lambda r: httpx.Response(200, json={"unexpected": True})) as (c, _):
            with pytest.raises(LLMBadResponse):
                await c.complete(MESSAGES)

    asyncio.run(scenario())


def test_sensitive_data_is_never_sent() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return ok()

    raw = [{"role": "user", "content": "My PAN is ABCDE1234F"}]

    async def scenario() -> None:
        async with open_client(handler) as (client, _):
            with pytest.raises(SensitiveDataLeak):
                await client.complete(raw)
            assert calls == 0  # the request never left the server
            masked = [{"role": "user", "content": Redactor().redact(raw[0]["content"])}]
            await client.complete(masked)
            assert calls == 1

    asyncio.run(scenario())


def test_stream_assembles_text_and_tool_call_pieces() -> None:
    chunks = [
        {"choices": [{"delta": {"content": "Hel"}}]},
        {"choices": [{"delta": {"content": "lo"}}]},
        {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_1",
                                "function": {"name": "lookup_customer", "arguments": '{"na'},
                            }
                        ]
                    }
                }
            ]
        },
        {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [{"index": 0, "function": {"arguments": 'me": "Asha"}'}}]
                    },
                    "finish_reason": "tool_calls",
                }
            ]
        },
        {"usage": {"prompt_tokens": 5, "completion_tokens": 7}, "choices": []},
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, content=sse(*chunks))

    async def scenario() -> None:
        async with open_client(handler) as (client, _):
            events = [e async for e in client.stream(MESSAGES)]
        assert [e.text for e in events if isinstance(e, TextDelta)] == ["Hel", "lo"]
        done = events[-1]
        assert isinstance(done, StreamDone)
        assert done.response.text == "Hello"
        assert done.response.finish_reason == "tool_calls"
        assert done.response.usage.completion_tokens == 7
        call = done.response.tool_calls[0]
        assert (call.id, call.name, call.arguments) == (
            "call_1",
            "lookup_customer",
            {"name": "Asha"},
        )

    asyncio.run(scenario())


def test_stream_retries_before_any_output() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503)
        return httpx.Response(200, content=sse({"choices": [{"delta": {"content": "Hi"}}]}))

    async def scenario() -> None:
        async with open_client(handler) as (client, sleeps):
            events = [e async for e in client.stream(MESSAGES)]
            assert isinstance(events[-1], StreamDone)
            assert events[-1].response.text == "Hi"
            assert len(sleeps) == 1

    asyncio.run(scenario())
    assert calls == 2
