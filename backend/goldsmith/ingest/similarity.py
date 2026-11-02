"""Near-duplicate detection and clustering on embeddings."""

import math

import numpy as np
from numpy.typing import NDArray
from sklearn.cluster import KMeans

MAX_CLUSTERS = 12


def normalize(vectors: NDArray[np.floating]) -> NDArray[np.floating]:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.where(norms == 0, 1, norms)


def find_duplicates(vectors: NDArray[np.floating], threshold: float) -> list[int | None]:
    """For each row, the index of the earliest row it near-duplicates (cosine > threshold).

    Points at the original, never at another duplicate. Chunked to bound memory at 5,000 rows.
    """
    v = normalize(np.asarray(vectors, dtype=np.float32))
    dup: list[int | None] = [None] * len(v)
    for start in range(0, len(v), 500):
        end = min(start + 500, len(v))
        sims = v[start:end] @ v[:end].T
        for local, i in enumerate(range(start, end)):
            earlier = np.flatnonzero(sims[local, :i] > threshold)
            if earlier.size:
                j = int(earlier[0])
                dup[i] = dup[j] if dup[j] is not None else j
    return dup


def cluster_count(n: int) -> int:
    return max(1, min(MAX_CLUSTERS, round(math.sqrt(n))))


def cluster(vectors: NDArray[np.floating], seed: int = 0) -> list[int]:
    if len(vectors) == 0:
        return []
    k = cluster_count(len(vectors))
    labels = KMeans(n_clusters=k, random_state=seed, n_init="auto").fit_predict(normalize(vectors))
    return [int(x) for x in labels]
