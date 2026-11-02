import os
from collections.abc import Callable, Iterator
from pathlib import Path

# Must run before any goldsmith import: settings are read at import time.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://localhost/goldsmith_test"
)
os.environ["SESSION_SECRET"] = "test-secret"
os.environ["DEV_AUTH_BYPASS"] = "false"

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from alembic import command  # noqa: E402
from goldsmith.api.deps import current_user  # noqa: E402
from goldsmith.db import Base, SessionLocal  # noqa: E402
from goldsmith.main import create_app  # noqa: E402
from goldsmith.models import User  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated() -> None:
    command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")


@pytest.fixture
def db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with SessionLocal() as session:
        session.execute(text(f"TRUNCATE {tables} CASCADE"))
        session.commit()


@pytest.fixture
def make_user(db: Session) -> Callable[[str], User]:
    def _make(email: str) -> User:
        user = User(email=email, name=email, google_sub=f"sub-{email}")
        db.add(user)
        db.commit()
        return user

    return _make


@pytest.fixture
def client_as(db: Session) -> Callable[[User], TestClient]:
    """A test client signed in as the given user (auth itself is tested in test_auth)."""

    def _client(user: User) -> TestClient:
        app = create_app()
        app.dependency_overrides[current_user] = lambda: user
        return TestClient(app)

    return _client
