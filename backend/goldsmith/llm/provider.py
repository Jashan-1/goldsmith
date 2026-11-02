"""The single entry point for LLM calls. Tests swap in a fake with `set_provider`."""

import logging
import time
from pathlib import Path
from typing import Protocol, TypeVar

from openai import OpenAI, omit
from pydantic import BaseModel

from goldsmith.config import settings
from goldsmith.models.row import EMBEDDING_DIM

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)
PROMPTS_DIR = Path(__file__).parent / "prompts"


class LLMError(RuntimeError):
    pass


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text()


class LLMProvider(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...

    def structured(
        self, instructions: str, user: str, schema: type[T], temperature: float | None = None
    ) -> T: ...


class OpenAIProvider:
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise LLMError("OPENAI_API_KEY is not set.")
        self.client = OpenAI(api_key=settings.openai_api_key)

    def embed(self, texts: list[str]) -> list[list[float]]:
        start = time.monotonic()
        # `dimensions` keeps vectors matching the DB column whatever text-embedding-3 model is used.
        res = self.client.embeddings.create(
            model=settings.openai_embedding_model, input=texts, dimensions=EMBEDDING_DIM
        )
        _log_usage(settings.openai_embedding_model, res.usage.total_tokens, start)
        return [d.embedding for d in res.data]

    def structured(
        self, instructions: str, user: str, schema: type[T], temperature: float | None = None
    ) -> T:
        if not settings.openai_model:
            raise LLMError("OPENAI_MODEL is not set.")
        start = time.monotonic()
        res = self.client.responses.parse(
            model=settings.openai_model,
            instructions=instructions,
            input=user,
            text_format=schema,
            # Some models reject a temperature argument, so only send it when asked.
            temperature=omit if temperature is None else temperature,
        )
        _log_usage(settings.openai_model, res.usage.total_tokens if res.usage else 0, start)
        parsed: T | None = res.output_parsed
        if parsed is None:
            raise LLMError("The model returned no structured output.")
        return parsed


def _log_usage(model: str, tokens: int, start: float) -> None:
    # shortcut: usage goes to the log only; persist it when the report shows cost.
    latency_ms = int((time.monotonic() - start) * 1000)
    logger.info("llm call model=%s tokens=%d latency_ms=%d", model, tokens, latency_ms)


_provider: LLMProvider | None = None


def get_provider() -> LLMProvider:
    global _provider
    if _provider is None:
        _provider = OpenAIProvider()
    return _provider


def set_provider(provider: LLMProvider | None) -> None:
    global _provider
    _provider = provider
