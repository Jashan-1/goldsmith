"""Pick diverse seed rows: one per cluster, then the rows farthest from those already chosen."""

import numpy as np
from numpy.typing import NDArray

from goldsmith.ingest.similarity import normalize


def select_seeds(
    vectors: NDArray[np.floating],
    clusters: list[int],
    count: int,
    keep: list[int] | None = None,
) -> list[int]:
    """Return indices of `count` seeds (or all rows if fewer). Fully deterministic.

    `keep` are indices that must stay seeds (e.g. ones the user already labelled).
    """
    v = normalize(np.asarray(vectors, dtype=np.float64))
    n = len(v)
    chosen = list(dict.fromkeys(keep or []))
    if n == 0:
        return chosen
    count = min(max(count, len(chosen)), n)

    # One per cluster, biggest clusters first, using the row closest to the cluster centre.
    labels = np.asarray(clusters)
    covered = {int(labels[i]) for i in chosen}
    by_size = sorted(set(clusters), key=lambda c: (-int((labels == c).sum()), c))
    for c in by_size:
        if len(chosen) >= count:
            break
        if c in covered:
            continue
        members = np.flatnonzero(labels == c)
        centre = v[members].mean(axis=0)
        chosen.append(int(members[np.argmax(v[members] @ centre)]))

    # Fill the rest by farthest-point sampling (cosine distance to the nearest chosen seed).
    if len(chosen) < count:
        nearest = (1 - v @ v[chosen].T).min(axis=1)
        nearest[chosen] = -1
        while len(chosen) < count:
            i = int(np.argmax(nearest))
            chosen.append(i)
            nearest = np.minimum(nearest, 1 - v @ v[i])
            nearest[chosen] = -1
    return chosen
