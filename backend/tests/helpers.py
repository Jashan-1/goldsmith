from pathlib import Path

from fastapi.testclient import TestClient

from goldsmith.worker.runner import run_next

FIXTURES = Path(__file__).parent / "fixtures"


def new_project(client: TestClient) -> str:
    return client.post("/api/projects", json={"name": "p", "task_type": "qa"}).json()["id"]


def upload(client: TestClient, pid: str, name: str, content: bytes | None = None):
    data = content if content is not None else (FIXTURES / name).read_bytes()
    return client.post(f"/api/projects/{pid}/files", files={"file": (name, data)})


def ingest(client: TestClient, name: str) -> tuple[str, dict]:
    pid = new_project(client)
    up = upload(client, pid, name).json()
    res = client.post(f"/api/projects/{pid}/files/{up['id']}/mapping", json=up["proposed_mapping"])
    assert res.status_code == 202
    assert run_next()
    job = client.get(f"/api/jobs/{res.json()['id']}").json()
    assert job["status"] == "done", job["error"]
    assert job["progress"] == 100
    return pid, client.get(f"/api/projects/{pid}/rows?limit=200").json()
