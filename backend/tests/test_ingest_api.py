import pytest
from fastapi.testclient import TestClient

from goldsmith.worker.runner import run_next
from tests.fake_provider import FakeProvider
from tests.helpers import ingest, new_project, upload


@pytest.mark.parametrize(
    ("name", "rows", "dups"),
    [
        ("support_tickets.csv", 16, 1),
        ("prompts.jsonl", 8, 0),
        ("qa.csv", 8, 0),
        ("chat.jsonl", 6, 0),
    ],
)
def test_each_fixture_ingests(client: TestClient, name: str, rows: int, dups: int):
    _, page = ingest(client, name)
    assert page["total"] == rows
    assert page["duplicates"] == dups
    assert all(r["cluster_id"] is not None for r in page["items"])
    assert sum(c["count"] for c in page["clusters"]) == rows


def test_duplicate_and_filters(client: TestClient):
    pid, page = ingest(client, "support_tickets.csv")
    dup = next(r for r in page["items"] if r["duplicate_of"])
    original = next(r for r in page["items"] if r["id"] == dup["duplicate_of"])
    assert dup["row_index"] == 12 and original["row_index"] == 0
    assert dup["cluster_id"] == original["cluster_id"]
    assert dup["metadata"] == {"ticket_id": "13", "priority": "high"}

    base = f"/api/projects/{pid}/rows"
    assert client.get(f"{base}?duplicates=exclude").json()["total"] == 15
    assert client.get(f"{base}?duplicates=only").json()["total"] == 1
    first = page["clusters"][0]
    assert client.get(f"{base}?cluster={first['cluster_id']}").json()["total"] == first["count"]
    assert len(client.get(f"{base}?limit=5&offset=15").json()["items"]) == 1


def test_upload_response(client: TestClient):
    up = upload(client, new_project(client), "qa.csv")
    assert up.status_code == 201
    body = up.json()
    assert body["format"] == "qa"
    assert body["columns"] == ["question", "answer", "category"]
    assert len(body["preview"]) == 5


def test_llm_mapping_fallback(client: TestClient, fake_llm: FakeProvider):
    fake_llm.responses["FieldMapping"] = lambda _user, _temp: {
        "input": ["col_a"],
        "reference_output": "col_b",
        "metadata": ["col_c"],
    }
    body = upload(client, new_project(client), "unknown_columns.csv").json()
    assert body["proposed_mapping"]["input"] == ["col_a"]
    assert len(fake_llm.calls) == 1


def test_llm_mapping_failure_returns_empty_guess(client: TestClient):
    body = upload(client, new_project(client), "unknown_columns.csv").json()
    assert body["proposed_mapping"]["input"] == []


def test_upload_errors(client: TestClient):
    pid = new_project(client)
    res = upload(client, pid, "bad.jsonl", b"nope\n")
    assert res.status_code == 400
    assert "Line 1" in res.json()["detail"]
    big = upload(client, pid, "big.csv", b"a\n" + b"x" * (10 * 1024 * 1024))
    assert big.status_code == 413


def test_mapping_validation_and_single_confirm(client: TestClient):
    pid = new_project(client)
    fid = upload(client, pid, "qa.csv").json()["id"]
    url = f"/api/projects/{pid}/files/{fid}/mapping"
    assert client.post(url, json={"input": ["nope"]}).status_code == 422
    assert client.post(url, json={"input": []}).status_code == 422
    assert client.post(url, json={"input": ["question"]}).status_code == 202
    assert client.post(url, json={"input": ["question"]}).status_code == 409


def test_failed_job_records_error(client: TestClient, fake_llm: FakeProvider, monkeypatch):
    def boom(texts):
        raise RuntimeError("embedding service down")

    monkeypatch.setattr(fake_llm, "embed", boom)
    pid = new_project(client)
    up = upload(client, pid, "qa.csv").json()
    job = client.post(f"/api/projects/{pid}/files/{up['id']}/mapping", json=up["proposed_mapping"])
    assert run_next()
    body = client.get(f"/api/jobs/{job.json()['id']}").json()
    assert body["status"] == "failed"
    assert body["error"] == "embedding service down"
    assert client.get(f"/api/projects/{pid}/rows").json()["total"] == 0


def test_other_users_cannot_touch_files_jobs_rows(client: TestClient, client_as, make_user):
    pid = new_project(client)
    up = upload(client, pid, "qa.csv").json()
    job = client.post(f"/api/projects/{pid}/files/{up['id']}/mapping", json=up["proposed_mapping"])

    bob = client_as(make_user("bob@example.com"))
    assert upload(bob, pid, "qa.csv").status_code == 404
    assert bob.get(f"/api/projects/{pid}/rows").status_code == 404
    assert bob.get(f"/api/jobs/{job.json()['id']}").status_code == 404
    bob_pid = new_project(bob)
    # Bob can't confirm Alice's file via his own project either.
    assert (
        bob.post(
            f"/api/projects/{bob_pid}/files/{up['id']}/mapping", json={"input": ["question"]}
        ).status_code
        == 404
    )
