import re
from pathlib import Path

from fastapi.testclient import TestClient

from goldsmith.worker.runner import run_next

FIXTURES = Path(__file__).parent / "fixtures"


def new_project(client: TestClient, task_type: str = "qa") -> str:
    body = {"name": "p", "task_type": task_type}
    return client.post("/api/projects", json=body).json()["id"]


def upload(client: TestClient, pid: str, name: str, content: bytes | None = None):
    data = content if content is not None else (FIXTURES / name).read_bytes()
    return client.post(f"/api/projects/{pid}/files", files={"file": (name, data)})


def ingest(client: TestClient, name: str, task_type: str = "qa") -> tuple[str, dict]:
    pid = new_project(client, task_type)
    up = upload(client, pid, name).json()
    res = client.post(f"/api/projects/{pid}/files/{up['id']}/mapping", json=up["proposed_mapping"])
    assert res.status_code == 202
    assert run_next()
    job = client.get(f"/api/jobs/{res.json()['id']}").json()
    assert job["status"] == "done", job["error"]
    assert job["progress"] == 100
    return pid, client.get(f"/api/projects/{pid}/rows?limit=200").json()


KEYWORDS = {
    "billing": r"charg|refund|invoice|bill|pay|price|card|tax|receipt|discount|vat|quote|renew",
    "shipping": r"order|ship|deliver|parcel|package|courier|track|customs|box|driver|pick up",
    "account": r"log|account|password|email|username|sign|team|profile|authenticat",
}


def row_of(user: str) -> str:
    return re.search(r"## Row to label\n```\n(.*?)\n```", user, re.S).group(1)


def fake_label(user: str, temperature: float | None) -> dict:
    text = row_of(user).lower()
    label = next((k for k, pat in KEYWORDS.items() if re.search(pat, text)), "bug")
    if temperature and "?" in text:
        label = "bug" if label != "bug" else "account"  # questions make the samples disagree
    return {
        "expected_output": label,
        "rationale": f"Mentions {label} topics.",
        "rules_applied": ["r1"],
        "rule_concerns": ["r1"] if "refund" in text else [],
        "confidence": 0.5 if "?" in text else 0.9,
    }


def run_label_job(client: TestClient, pid: str, cheap: bool = False) -> dict:
    res = client.post(f"/api/projects/{pid}/label", json={"cheap": cheap})
    assert res.status_code == 202, res.text
    assert run_next()
    return client.get(f"/api/jobs/{res.json()['id']}").json()
