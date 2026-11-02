import re
import threading
import zlib
from collections.abc import Callable
from typing import Any

from goldsmith.models import EMBEDDING_DIM


class FakeProvider:
    """Deterministic stand-in for the LLM. No test calls the real API.

    `responses` maps a schema class name to fn(user_message, temperature) -> dict or model.
    """

    def __init__(self) -> None:
        self.responses: dict[str, Callable[[str, float | None], Any]] = {}
        self.calls: list[tuple[str, str, float | None]] = []
        self._lock = threading.Lock()  # labelling calls from a thread pool

    def embed(self, texts: list[str]) -> list[list[float]]:
        # Hashed bag of words: same text -> same vector; shared words -> close.
        out = []
        for text in texts:
            vec = [0.0] * EMBEDDING_DIM
            for word in re.findall(r"\w+", text.lower()) or ["<empty>"]:
                vec[zlib.crc32(word.encode()) % EMBEDDING_DIM] += 1.0
            out.append(vec)
        return out

    def structured(
        self, instructions: str, user: str, schema: type[Any], temperature: float | None = None
    ) -> Any:
        with self._lock:
            self.calls.append((instructions, user, temperature))
        if schema.__name__ not in self.responses:
            raise RuntimeError(f"FakeProvider has no response for {schema.__name__}")
        return schema.model_validate(self.responses[schema.__name__](user, temperature))
