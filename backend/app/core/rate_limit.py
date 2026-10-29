import time
from collections import defaultdict, deque
from collections.abc import Callable

from app.core.errors import TooManyRequests


class SlidingWindowLimiter:
    """Allows `limit` calls per `window_seconds` for each key. In-process only: with
    more than one server replica, each replica counts separately."""

    def __init__(
        self,
        limit: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._limit = limit
        self._window = window_seconds
        self._clock = clock
        self._hits: defaultdict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = self._clock()
        hits = self._hits[key]
        while hits and now - hits[0] >= self._window:
            hits.popleft()
        if len(hits) >= self._limit:
            raise TooManyRequests("rate_limited", "Too many messages. Please wait a few minutes.")
        hits.append(now)
