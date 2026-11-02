import json
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
    dedupe_threshold: float = field(default_factory=lambda: float(_env("DEDUPE_THRESHOLD", "0.97")))
    dev_auth_bypass: bool = field(
        default_factory=lambda: _env("DEV_AUTH_BYPASS", "false").lower() == "true"
    )
    # Labelling: samples per row for self-disagreement (cheap mode always uses 1).
    label_samples: int = field(default_factory=lambda: int(_env("LABEL_SAMPLES", "3")))
    label_concurrency: int = field(default_factory=lambda: int(_env("LABEL_CONCURRENCY", "8")))
    # Max push per uncertainty signal (JSON, 0-1). >= the 0.5 threshold means that signal alone
    # sends a row to review. Stated confidence weighs least: models are poorly calibrated.
    uncertainty_weights: dict[str, float] = field(
        default_factory=lambda: json.loads(
            _env(
                "UNCERTAINTY_WEIGHTS",
                '{"reference": 0.8, "disagreement": 0.7, "rule_concerns": 0.6,'
                ' "novelty": 0.4, "confidence": 0.3}',
            )
        )
    )


settings = Settings()
