import re
import zlib
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from goldsmith.models import EMBEDDING_DIM


class FakeProvider:
    """Deterministic stand-in for the LLM. No test calls the real API."""

    def __init__(self) -> None:
        self.responses: dict[type[BaseModel], Callable[[str], Any]] = {}
        self.calls: list[tuple[str, str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        # Hashed bag of words: same text -> same vector; shared words -> close.
        out = []
        for text in texts:
            vec = [0.0] * EMBEDDING_DIM
            for word in re.findall(r"\w+", text.lower()) or ["<empty>"]:
                vec[zlib.crc32(word.encode()) % EMBEDDING_DIM] += 1.0
            out.append(vec)
        return out

    def structured(self, instructions: str, user: str, schema: type[Any], temperature: Any = None):
        self.calls.append((instructions, user))
        if schema not in self.responses:
            raise RuntimeError(f"FakeProvider has no response for {schema.__name__}")
        return self.responses[schema](user)
