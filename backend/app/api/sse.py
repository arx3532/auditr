import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

KEEPALIVE = ": keepalive\n\n"


def sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def _next_item(source: AsyncGenerator[Any, None]) -> tuple[bool, Any]:
    try:
        return True, await source.__anext__()
    except StopAsyncIteration:
        return False, None


async def with_keepalive(
    source: AsyncGenerator[Any, None], interval: float
) -> AsyncGenerator[Any, None]:
    """Pass items through, and yield None whenever `interval` seconds pass without one,
    so proxies do not close an idle stream while the model is thinking. The waiting
    task is never cancelled on a timeout, so no item is ever lost."""
    pending: asyncio.Task[tuple[bool, Any]] | None = None
    try:
        while True:
            if pending is None:
                pending = asyncio.ensure_future(_next_item(source))
            done, _ = await asyncio.wait({pending}, timeout=interval)
            if not done:
                yield None
                continue
            has_item, item = pending.result()
            pending = None
            if not has_item:
                return
            yield item
    finally:
        if pending is not None:
            pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)
        await source.aclose()
