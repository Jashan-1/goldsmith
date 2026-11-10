from fastapi.testclient import TestClient

from goldsmith.bench import run, score_arms
from tests.fake_provider import FakeProvider
from tests.helpers import FIXTURES, fake_label, row_of


def client_rows(client: TestClient, pid: str) -> list[dict]:
    return client.get(f"/api/projects/{pid}/rows?limit=200").json()["items"]


def test_score_arms_ranks_by_uncertainty():
    items = [(0.9, False), (0.8, True), (0.1, True), (0.2, False)]
    out = score_arms(items, budget=2)
    assert out["model_errors"] == 2
    assert out["arms"]["none"]["accuracy"] == 0.5
    assert out["arms"]["goldsmith"] == {"errors_caught": 1.0, "accuracy": 0.75}
    assert out["arms"]["random"] == {"errors_caught": 1.0, "accuracy": 0.75}
    assert score_arms([], 5)["arms"]["none"]["accuracy"] is None


def test_bench_hides_gold_and_scores(client: TestClient, fake_llm: FakeProvider):
    fake_llm.responses["LabelOutput"] = fake_label
    out = run(client, FIXTURES / "tickets_100.csv", gold="label", budget=10)
    assert out["rows"] > 50 and out["budget"] == 10
    # The gold column must never reach the model.
    rows = [row_of(user) for _, user, _ in fake_llm.calls if "## Row to label" in user]
    assert rows and not any("label:" in r for r in rows)
    assert all(row["reference_output"] is None for row in client_rows(client, out["project_id"]))
    arms = out["arms"]
    assert arms["goldsmith"]["accuracy"] >= arms["none"]["accuracy"]
