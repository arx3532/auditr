import hashlib
import json
import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import Conflict
from app.db.models import IdempotencyKey

Handler = Callable[[], tuple[int, dict[str, Any]]]


def request_hash(method: str, path: str, body: dict[str, Any]) -> str:
    canonical = json.dumps(
        {"m": method, "p": path, "b": body}, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def run_idempotent(
    db: Session, user_id: uuid.UUID, key: str, req_hash: str, handler: Handler
) -> tuple[int, dict[str, Any]]:
    claimed = db.execute(
        pg_insert(IdempotencyKey)
        .values(user_id=user_id, key=key, request_hash=req_hash)
        .on_conflict_do_nothing()
        .returning(IdempotencyKey.key)
    ).first()

    if claimed is None:  # this key was used before: replay or reject
        existing = db.scalar(
            select(IdempotencyKey)
            .where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key)
            .execution_options(populate_existing=True)
        )
        if existing is None or existing.response_body is None or existing.response_status is None:
            raise Conflict("request_in_progress", "A request with this key is still in progress")
        if existing.request_hash != req_hash:
            raise Conflict(
                "idempotency_key_reuse", "This Idempotency-Key was used for a different request"
            )
        return existing.response_status, existing.response_body

    try:
        status_code, body = handler()
        db.execute(
            update(IdempotencyKey)
            .where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key)
            .values(response_status=status_code, response_body=body)
        )
        db.commit()
    except Exception:
        db.rollback()  # also removes the claimed key, so a corrected retry can run
        raise
    return status_code, body
