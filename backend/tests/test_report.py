import csv
import io
import json
import zipfile

from fastapi.testclient import TestClient

from tests.helpers import run_label_job


def test_audit_report_and_export(client: TestClient, labelled_project: str):
    pid = labelled_project
    run_label_job(client, pid, cheap=True)
    client.patch(f"/api/projects/{pid}", json={"review_threshold": 1.0})
    before = client.get(f"/api/projects/{pid}/report").json()
    assert before["seeds"] == 10
    assert before["audit"] == {"sampled": 0, "reviewed": 0, "changed": 0}

    assert client.post(f"/api/projects/{pid}/audit").json() == {"sampled": 10}
    # Re-applying the threshold must not pull audit rows out of the queue.
    client.patch(f"/api/projects/{pid}", json={"review_threshold": 1.0})
    actions = [{"action": "reject"}, {"action": "edit", "expected_output": "other"}]
    for i in range(10):
        card = client.get(f"/api/projects/{pid}/review/next").json()
        assert card["row"]["label"]["source"] == "audit"
        body = {**(actions[i] if i < 2 else {"action": "approve"}), "seconds_spent": 30}
        res = client.post(f"/api/projects/{pid}/review/{card['row']['id']}", json=body)
        assert res.status_code == 200, res.text
    assert client.get(f"/api/projects/{pid}/review/next").json()["row"] is None

    rep = client.get(f"/api/projects/{pid}/report").json()
    assert rep["audit"] == {"sampled": 10, "reviewed": 10, "changed": 2}
    assert rep["reviewed"] == 10 and rep["judge"] == {"rows": 0, "mean_score": None}
    assert rep["review_rate"] == 0.2
    assert rep["human_minutes"] == 5.0
    assert rep["status"]["rejected"] == 1 and rep["status"]["approved"] == 8
    assert sum(c["rows"] for c in rep["coverage"]) == rep["total_rows"] - rep["duplicates"]
    kept = rep["total_rows"] - rep["duplicates"] - rep["unlabelled"] - 1

    res = client.get(f"/api/projects/{pid}/export?format=jsonl")
    assert res.headers["content-type"] == "application/zip"
    zf = zipfile.ZipFile(io.BytesIO(res.content))
    lines = [json.loads(x) for x in zf.read("dataset.jsonl").decode().splitlines()]
    assert len(lines) == kept
    assert all(r["status"] != "rejected" for r in lines)
    assert set(lines[0]) >= {"input", "expected_output", "label_source", "cluster_id"}
    manifest = json.loads(zf.read("manifest.json"))
    assert manifest["counts"]["total"] == kept and manifest["rule_set"]["version"] == 1

    zf = zipfile.ZipFile(io.BytesIO(client.get(f"/api/projects/{pid}/export?format=csv").content))
    rows = list(csv.DictReader(io.StringIO(zf.read("dataset.csv").decode())))
    assert len(rows) == kept and "rule_set_version" in rows[0]

    assert client.get(f"/api/projects/{pid}/export?format=xml").status_code == 422
