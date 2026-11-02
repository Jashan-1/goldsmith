import numpy as np

from goldsmith.ingest.similarity import cluster, cluster_count, find_duplicates


def test_duplicates_point_at_the_original():
    a, b = np.eye(4)[0], np.eye(4)[1]
    vectors = np.array([a, b, a * 2, a + 0.01 * b, b])
    assert find_duplicates(vectors, 0.97) == [None, None, 0, 0, 1]


def test_duplicates_across_chunk_boundary():
    rng = np.random.default_rng(0)
    vectors = rng.normal(size=(1200, 16))
    vectors[1100] = vectors[3]
    dup = find_duplicates(vectors, 0.97)
    assert dup[1100] == 3
    assert sum(d is not None for d in dup) == 1


def test_zero_vectors_do_not_crash():
    assert find_duplicates(np.zeros((2, 3)), 0.97) == [None, None]


def test_cluster_count_rule():
    assert [cluster_count(n) for n in (1, 4, 16, 100, 5000)] == [1, 2, 4, 10, 12]


def test_cluster_is_deterministic_and_separates_groups():
    rng = np.random.default_rng(1)
    groups = [rng.normal(loc=c, scale=0.05, size=(8, 3)) for c in ([5, 0, 0], [0, 5, 0])]
    vectors = np.vstack(groups)  # 16 rows -> k = 4
    labels = cluster(vectors, seed=0)
    assert labels == cluster(vectors, seed=0)
    assert not set(labels[:8]) & set(labels[8:])
    assert cluster(np.zeros((0, 3))) == []
