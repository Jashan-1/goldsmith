"""Combine per-row signals into one uncertainty score in [0, 1]. Higher means "ask a human"."""

import numpy as np
from numpy.typing import NDArray

from goldsmith.ingest.similarity import normalize


def combine(signals: dict[str, float | None], weights: dict[str, float]) -> float:
    """Noisy-OR: any one strong signal can push a row to review on its own.

    Each weight is the most that signal alone can contribute (0 to 1). None = not measured
    (cheap mode, or no reference in the upload). A weighted mean diluted single strong signals,
    so a confident model with one red flag never crossed the threshold.
    """
    keep = 1.0
    for name, value in signals.items():
        if value is not None:
            keep *= 1 - min(1.0, max(0.0, weights.get(name, 0) * value))
    return 1 - keep


def label_disagreement(outputs: list[str]) -> float:
    """Share of samples that differ from the first (the temperature-0 answer)."""
    return 1 - outputs.count(outputs[0]) / len(outputs)


def text_disagreement(vectors: NDArray[np.floating]) -> float:
    """Mean cosine distance from the first sample to the others, scaled to [0, 1].

    shortcut: the x4 scale assumes paraphrases sit within ~0.25 cosine distance; calibrate on real
    review data in Phase 2.
    """
    v = normalize(np.asarray(vectors, dtype=np.float64))
    if len(v) < 2:
        return 0.0
    distance = float(np.mean(1 - v[1:] @ v[0]))
    return min(1.0, max(0.0, distance * 4))


def nearest_distance(
    vectors: NDArray[np.floating], references: NDArray[np.floating]
) -> NDArray[np.floating]:
    """Cosine distance from each vector to its nearest reference (seed or human-reviewed row)."""
    if len(references) == 0:
        return np.ones(len(vectors))
    sims = (
        normalize(np.asarray(vectors, np.float64)) @ normalize(np.asarray(references, np.float64)).T
    )
    result: NDArray[np.floating] = 1 - sims.max(axis=1)
    return result


def percentile_ranks(values: NDArray[np.floating]) -> list[float]:
    """0 for the smallest value, 1 for the largest; ties share a rank.

    Used for novelty so the score doesn't depend on the embedding model's distance scale.
    """
    n = len(values)
    if n < 2:
        return [0.0] * n
    order = np.argsort(np.argsort(values, kind="stable"), kind="stable")
    ranks = order / (n - 1)
    # Equal values get the same (lowest) rank.
    out: dict[float, float] = {}
    for value, rank in sorted(zip(values.tolist(), ranks.tolist(), strict=True)):
        out.setdefault(value, rank)
    return [out[v] for v in values.tolist()]


def status_for(uncertainty: float, threshold: float) -> str:
    return "needs_review" if uncertainty >= threshold else "auto_accepted"
