import asyncio
from collections.abc import AsyncGenerator
from typing import Any

import pytest

from app.api.sse import with_keepalive
from app.core.errors import TooManyRequests
from app.core.rate_limit import SlidingWindowLimiter


def test_sliding_window_limiter() -> None:
    now = [0.0]
    limiter = SlidingWindowLimiter(2, 10.0, clock=lambda: now[0])
    limiter.check("a")
    limiter.check("a")
    with pytest.raises(TooManyRequests):
        limiter.check("a")
    limiter.check("b")  # other users are not affected
    now[0] = 10.0
    limiter.check("a")  # the window has passed


def test_keepalive_never_drops_items() -> None:
    async def slow() -> AsyncGenerator[int, None]:
        await asyncio.sleep(0.05)
        yield 1
        await asyncio.sleep(0.05)
        yield 2

    async def collect() -> list[Any]:
        return [item async for item in with_keepalive(slow(), 0.01)]

    items = asyncio.run(collect())
    assert [i for i in items if i is not None] == [1, 2]
    assert None in items  # keep-alives were sent while waiting
