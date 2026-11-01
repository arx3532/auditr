import pytest
from fastapi.testclient import TestClient

from tests.conftest import make_token


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_ready(client: TestClient) -> None:
    assert client.get("/ready").status_code == 200


def test_me_requires_token(client: TestClient) -> None:
    assert client.get("/me").status_code == 401


def test_me_creates_user_once(client: TestClient) -> None:
    token = make_token()
    first = client.get("/me", headers=auth(token))
    second = client.get("/me", headers=auth(token))
    assert first.status_code == 200
    assert first.json() == second.json()


def test_different_users_get_different_ids(client: TestClient) -> None:
    a = client.get("/me", headers=auth(make_token("user_a"))).json()
    b = client.get("/me", headers=auth(make_token("user_b"))).json()
    assert a["id"] != b["id"]


def test_expired_token_rejected(client: TestClient) -> None:
    assert client.get("/me", headers=auth(make_token(ttl=-60))).status_code == 401


def test_wrong_issuer_rejected(client: TestClient) -> None:
    token = make_token(issuer="https://evil.example.com")
    assert client.get("/me", headers=auth(token)).status_code == 401


def test_garbage_token_rejected(client: TestClient) -> None:
    assert client.get("/me", headers=auth("not-a-jwt")).status_code == 401


def test_cors_origins_accept_json_or_commas(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import Settings

    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example")
    assert Settings().cors_origins == ["https://a.example", "https://b.example"]
    monkeypatch.setenv("CORS_ORIGINS", '["https://c.example"]')
    assert Settings().cors_origins == ["https://c.example"]
