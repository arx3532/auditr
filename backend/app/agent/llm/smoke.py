"""Checks your key, your model, and tool calling. Run with:
uv run python -m app.agent.llm.smoke
"""

import asyncio

from pydantic import BaseModel

from app.agent.llm.factory import build_llm_client
from app.agent.llm.schema import json_schema_for
from app.agent.llm.types import LLMError, StreamDone, TextDelta, ToolSpec
from app.config import get_settings


class LookupArgs(BaseModel):
    name: str


TOOLS = [ToolSpec("lookup_customer", "Find a customer by name.", json_schema_for(LookupArgs))]
SYSTEM = "You are a billing assistant. Use the provided tools when they apply."


async def main() -> None:
    print(f"Model: {get_settings().llm_model}")
    client = build_llm_client()

    try:
        messages = [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": "Look up the custoer named Asha."},
        ]
        response = await client.complete(messages, TOOLS, max_tokens=200)
        print(f"complete(): {response.latency_ms} ms, tokens {response.usage}")
        if response.tool_calls:
            call = response.tool_calls[0]
            print(f"  tool call OK: {call.name} {call.arguments}")
        else:
            print("  NO tool call. This model may not support tool calling well.")
            print(f"  text: {response.text[:120]!r}")

        print("stream(): ", end="", flush=True)
        chat = [{"role": "user", "content": "Say hello in five words."}]
        async for event in client.stream(chat, max_tokens=50):
            if isinstance(event, TextDelta):
                print(event.text, end="", flush=True)
            elif isinstance(event, StreamDone):
                print(f"\n  done: {event.response.latency_ms} ms")
    except LLMError as exc:
        print(f"FAILED: {exc}")
        print("  401/403: key wrong or expired. 404: model ID not in the catalog.")
        print("  429: rate limit, wait a minute. unavailable: check your network.")
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
