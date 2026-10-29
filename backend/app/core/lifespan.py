import asyncio
import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.agent.llm.factory import build_llm_client
from app.agent.llm.types import LLMError
from app.config import get_settings

logger = logging.getLogger(__name__)


def _psycopg_url(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def _check_event_loop() -> None:
    if sys.platform == "win32" and type(asyncio.get_running_loop()).__name__ == "ProactorEventLoop":
        raise RuntimeError(
            "On Windows, start the server with `uv run python run.py`. "
            "psycopg's async mode needs the selector event loop."
        )


async def open_checkpointer(
    database_url: str,
) -> tuple[AsyncConnectionPool[AsyncConnection[dict[str, Any]]], AsyncPostgresSaver]:
    """Open a connection pool and LangGraph's Postgres checkpointer on it."""
    # LangGraph needs autocommit and dict rows on its connections.
    pool: AsyncConnectionPool[AsyncConnection[dict[str, Any]]] = AsyncConnectionPool(
        conninfo=_psycopg_url(database_url),
        min_size=1,
        max_size=10,
        open=False,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
    )
    await pool.open()
    saver = AsyncPostgresSaver(pool)
    await saver.setup()  # creates LangGraph's own tables if missing
    return pool, saver


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _check_event_loop()
    pool, checkpointer = await open_checkpointer(get_settings().database_url)
    app.state.checkpointer = checkpointer
    try:
        app.state.llm = build_llm_client()
    except LLMError:
        app.state.llm = None
        logger.warning("NVIDIA_API_KEY is not set: chat is disabled")
    try:
        yield
    finally:
        if app.state.llm is not None:
            await app.state.llm.aclose()
        await pool.close()
