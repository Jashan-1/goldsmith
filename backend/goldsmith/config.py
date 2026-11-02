import os
from dataclasses import dataclass, field


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@dataclass
class Settings:
    """Read from the environment; `make` loads ../.env via `uv run --env-file`."""

    database_url: str = field(
        default_factory=lambda: _env("DATABASE_URL", "postgresql+psycopg://localhost/goldsmith")
    )
    openai_api_key: str = field(default_factory=lambda: _env("OPENAI_API_KEY"))
    openai_model: str = field(default_factory=lambda: _env("OPENAI_MODEL"))
    openai_embedding_model: str = field(default_factory=lambda: _env("OPENAI_EMBEDDING_MODEL"))
    google_client_id: str = field(default_factory=lambda: _env("GOOGLE_CLIENT_ID"))
    google_client_secret: str = field(default_factory=lambda: _env("GOOGLE_CLIENT_SECRET"))
    session_secret: str = field(default_factory=lambda: _env("SESSION_SECRET"))
    frontend_url: str = field(default_factory=lambda: _env("FRONTEND_URL", "http://localhost:5173"))
    dev_auth_bypass: bool = field(
        default_factory=lambda: _env("DEV_AUTH_BYPASS", "false").lower() == "true"
    )


settings = Settings()
