import os

from tests import _loop  # noqa: F401

os.environ["DATABASE_URL"] = "postgresql+psycopg://finagent:finagent@localhost:5432/finagent_test"
os.environ["CLERK_JWKS_URL"] = "https://test.example.com/.well-known/jwks.json"
os.environ["CLERK_ISSUER"] = "https://test.example.com"
os.environ["NVIDIA_API_KEY"] = ""  # tests never use a real key

import time
from collections.abc import Iterator
from types import SimpleNamespace

import jwt
import pytest
from alembic import command
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import get_jwks_client
from app.db.session import engine
from app.main import app

ISSUER = os.environ["CLERK_ISSUER"]
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeJWKS:
    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        return SimpleNamespace(key=_private_key.public_key())


@pytest.fixture(scope="session", autouse=True)
def _migrate() -> None:
    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def _clean_db() -> Iterator[None]:
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE users CASCADE"))
    yield


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[get_jwks_client] = lambda: FakeJWKS()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_token(sub: str = "user_test_1", issuer: str = ISSUER, ttl: int = 300) -> str:
    now = int(time.time())
    claims = {"sub": sub, "iss": issuer, "iat": now, "exp": now + ttl}
    return jwt.encode(claims, _private_key, algorithm="RS256")
