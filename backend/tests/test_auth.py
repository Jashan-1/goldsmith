import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from goldsmith.config import settings
from goldsmith.main import create_app


def test_me_requires_sign_in(db: Session) -> None:
    assert TestClient(create_app()).get("/api/auth/me").status_code == 401


def test_dev_bypass_signs_in_and_out(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "dev_auth_bypass", True)
    client = TestClient(create_app())

    res = client.get("/api/auth/google/login", follow_redirects=False)
    assert res.status_code == 307
    assert res.headers["location"] == settings.frontend_url
    assert client.get("/api/auth/me").json()["email"] == "dev@localhost"

    # Second sign-in reuses the same user.
    client.get("/api/auth/google/login", follow_redirects=False)
    assert client.get("/api/projects").status_code == 200

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_login_without_google_config_explains(db: Session) -> None:
    res = TestClient(create_app()).get("/api/auth/google/login", follow_redirects=False)
    assert res.status_code == 503
    assert "GOOGLE_CLIENT_ID" in res.json()["detail"]
