import numpy as np
from fastapi.testclient import TestClient

from goldsmith.core.seeds import select_seeds
from tests.helpers import ingest, new_project

# Three tight groups on different axes, sizes 4/3/2.
GROUPS = np.array(
    [
        [1, 0.1, 0],
        [1, 0, 0],
        [1, 0, 0.1],
        [1, 0.05, 0.05],
        [0, 1, 0],
        [0.1, 1, 0],
        [0, 1, 0.1],
        [0, 0, 1],
        [0.1, 0, 1],
    ],
    dtype=float,
)
CLUSTERS = [0, 0, 0, 0, 1, 1, 1, 2, 2]


def test_one_seed_per_cluster_closest_to_centre():
    seeds = select_seeds(GROUPS, CLUSTERS, 3)
    assert [CLUSTERS[i] for i in seeds] == [0, 1, 2]  # biggest cluster first
    assert seeds[0] == 3  # [1, .05, .05] is the centre of cluster 0


def test_fewer_seeds_than_clusters_prefers_big_clusters():
    assert [CLUSTERS[i] for i in select_seeds(GROUPS, CLUSTERS, 2)] == [0, 1]


def test_fill_picks_farthest_rows_and_is_deterministic():
    seeds = select_seeds(GROUPS, CLUSTERS, 6)
    assert len(seeds) == len(set(seeds)) == 6
    assert seeds == select_seeds(GROUPS, CLUSTERS, 6)


def test_keep_preserves_labelled_seeds_and_counts_their_cluster():
    seeds = select_seeds(GROUPS, CLUSTERS, 3, keep=[0])
    assert seeds[0] == 0
    assert sorted(CLUSTERS[i] for i in seeds) == [0, 1, 2]


def test_count_larger_than_rows_returns_all():
    assert sorted(select_seeds(GROUPS, CLUSTERS, 50)) == list(range(9))
    assert select_seeds(np.zeros((0, 3)), [], 10) == []


def test_select_and_label_seeds(client: TestClient):
    pid, page = ingest(client, "support_tickets.csv")
    url = f"/api/projects/{pid}/seeds"

    seeds = client.post(f"{url}/select").json()
    assert len(seeds) == 10
    assert all(s["row"]["duplicate_of"] is None for s in seeds)
    assert {s["row"]["cluster_id"] for s in seeds} == {c["cluster_id"] for c in page["clusters"]}
    assert all(s["expected_output"] is None for s in seeds)
    assert client.get(url).json() == seeds

    first = seeds[0]["row"]["id"]
    res = client.post(f"{url}/{first}", json={"expected_output": "billing"})
    assert res.status_code == 200
    assert res.json()["expected_output"] == "billing"
    # Relabel: replaces the current label (unique index would reject two).
    client.post(f"{url}/{first}", json={"expected_output": "account"})

    # Reselect with fewer: the labelled seed survives.
    fewer = client.post(f"{url}/select", json={"count": 5}).json()
    assert len(fewer) == 5
    kept = next(s for s in fewer if s["row"]["id"] == first)
    assert kept["expected_output"] == "account"
    rows = client.get(f"/api/projects/{pid}/rows?limit=200").json()["items"]
    assert sum(r["is_seed"] for r in rows) == 5


def test_seed_errors(client: TestClient, client_as, make_user):
    empty = new_project(client)
    assert client.post(f"/api/projects/{empty}/seeds/select").status_code == 409

    pid, page = ingest(client, "qa.csv")
    url = f"/api/projects/{pid}/seeds"
    assert client.post(f"{url}/select", json={"count": 2}).status_code == 422
    seeds = client.post(f"{url}/select", json={"count": 5}).json()
    non_seed = next(r for r in page["items"] if r["id"] not in {s["row"]["id"] for s in seeds})
    assert client.post(f"{url}/{non_seed['id']}", json={"expected_output": "x"}).status_code == 404
    seed_id = seeds[0]["row"]["id"]
    assert client.post(f"{url}/{seed_id}", json={"expected_output": ""}).status_code == 422

    bob = client_as(make_user("bob@example.com"))
    assert bob.get(url).status_code == 404
    assert bob.post(f"{url}/select").status_code == 404
    assert bob.post(f"{url}/{seed_id}", json={"expected_output": "x"}).status_code == 404
