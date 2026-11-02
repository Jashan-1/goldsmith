from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from goldsmith.models import Correction, Label
from goldsmith.worker.runner import run_next
from tests.fake_provider import FakeProvider
from tests.helpers import fake_label, ingest, run_label_job


def queue_everything(client: TestClient, pid: str) -> int:
    """Label all rows, then send every LLM label to review. Returns the queue size."""
    run_label_job(client, pid, cheap=True)
    client.patch(f"/api/projects/{pid}", json={"review_threshold": 0.0})
    return client.get(f"/api/projects/{pid}/review/next").json()["counts"]["needs_review"]


def test_clear_queue_with_every_action(client: TestClient, labelled_project: str, db: Session):
    pid = labelled_project
    assert queue_everything(client, pid) == 90
    actions = [
        {"action": "approve"},
        {"action": "reject"},
        {"action": "edit", "expected_output": "account"},
    ]
    last_uncertainty = 1.0
    reviewed = 0
    while (card := client.get(f"/api/projects/{pid}/review/next").json())["row"]:
        row = card["row"]
        # Highest uncertainty first.
        assert row["label"]["uncertainty"] <= last_uncertainty
        last_uncertainty = row["label"]["uncertainty"]
        body = {**actions[reviewed % 3], "seconds_spent": 7}
        res = client.post(f"/api/projects/{pid}/review/{row['id']}", json=body)
        assert res.status_code == 200, res.text
        assert res.json()["label"]["source"] == "human_review"
        reviewed += 1

    assert reviewed == 90
    counts = client.get(f"/api/projects/{pid}/review/next").json()["counts"]
    assert counts == {"approved": 10 + 30, "rejected": 30, "edited": 30}

    corrections = db.scalars(select(Correction)).all()
    assert len(corrections) == 90
    assert {c.action for c in corrections} == {"approve", "reject", "edit"}
    assert all(c.seconds_spent == 7 and c.embedding is not None for c in corrections)
    edit = next(c for c in corrections if c.action == "edit")
    assert edit.after == "account" and edit.before in {"billing", "shipping", "account", "bug"}
    reject = next(c for c in corrections if c.action == "reject")
    assert reject.after is None
    # One current label per row, history kept.
    assert db.scalar(select(Label).where(Label.id == edit.label_id)).is_current


def test_corrections_feed_later_labelling(client, labelled_project, fake_llm: FakeProvider):
    pid = labelled_project
    queue_everything(client, pid)
    row = client.get(f"/api/projects/{pid}/review/next").json()["row"]
    client.post(
        f"/api/projects/{pid}/review/{row['id']}",
        json={"action": "edit", "expected_output": "shipping"},
    )
    fake_llm.calls.clear()
    run_label_job(client, pid, cheap=True)
    prompts = [c[1] for c in fake_llm.calls if "## Row to label" in c[1]]
    assert len(prompts) == 89  # the reviewed row is not relabelled
    assert all("changed it to: shipping" in p for p in prompts)


def test_instruction_preview_then_accept_and_apply_to_similar(
    client, labelled_project, fake_llm: FakeProvider, db: Session
):
    pid = labelled_project
    queue_everything(client, pid)
    row = client.get(f"/api/projects/{pid}/review/next").json()["row"]

    def follows_instruction(user, temperature):
        out = fake_label(user, temperature)
        if "Reviewer instruction" in user:
            out["expected_output"] = "bug"
            out["rationale"] = "Following the instruction."
        return out

    fake_llm.responses["LabelOutput"] = follows_instruction
    url = f"/api/projects/{pid}/review/{row['id']}"
    preview = client.post(f"{url}/instruct", json={"instruction": "Crashes are always bug"})
    assert preview.json() == {"expected_output": "bug", "rationale": "Following the instruction."}
    message = fake_llm.calls[-1][1]
    assert "## Current label" in message and "Crashes are always bug" in message
    # Preview saves nothing.
    assert (
        db.scalar(select(Label).where(Label.row_id == row["id"], Label.is_current)).source == "llm"
    )

    res = client.post(
        url,
        json={
            "action": "instruction",
            "instruction": "Crashes are always bug",
            "expected_output": "bug",
            "apply_to_similar": True,
        },
    ).json()
    assert res["label"]["status"] == "edited"
    job = res["similar_job"]
    assert job and job["status"] == "queued"
    correction = db.scalar(select(Correction).where(Correction.row_id == row["id"]))
    assert correction.action == "instruction"
    assert correction.instruction_text == "Crashes are always bug"

    fake_llm.calls.clear()
    assert run_next()
    assert client.get(f"/api/jobs/{job['id']}").json()["status"] == "done"
    prompts = [c[1] for c in fake_llm.calls if "## Row to label" in c[1]]
    assert len(prompts) == 10 * 3  # 10 similar rows, default 3 samples
    assert all("Crashes are always bug" in p for p in prompts)


def test_review_validation(client, labelled_project):
    pid = labelled_project
    queue_everything(client, pid)
    row = client.get(f"/api/projects/{pid}/review/next").json()["row"]
    url = f"/api/projects/{pid}/review/{row['id']}"
    assert client.post(url, json={"action": "edit"}).status_code == 422
    assert client.post(url, json={"action": "edit", "expected_output": " "}).status_code == 422
    missing = {"action": "instruction", "expected_output": "bug"}
    assert client.post(url, json=missing).status_code == 422
    assert client.post(url, json={"action": "shrug"}).status_code == 422
    assert client.post(url, json={"action": "approve", "seconds_spent": -1}).status_code == 422
    # Very long dwell times are capped (someone left the tab open).
    assert client.post(url, json={"action": "approve", "seconds_spent": 99999}).status_code == 200


def test_review_needs_a_label_and_ownership(client, client_as, make_user, labelled_project):
    pid = labelled_project
    unlabelled_pid, page = ingest(client, "qa.csv")
    row_id = page["items"][0]["id"]
    res = client.post(f"/api/projects/{unlabelled_pid}/review/{row_id}", json={"action": "approve"})
    assert res.status_code == 422
    assert client.get(f"/api/projects/{unlabelled_pid}/review/next").json() == {
        "row": None,
        "counts": {},
    }
    # A row from another project can't be reviewed through this one.
    assert (
        client.post(f"/api/projects/{pid}/review/{row_id}", json={"action": "approve"}).status_code
        == 404
    )

    queue_everything(client, pid)
    row = client.get(f"/api/projects/{pid}/review/next").json()["row"]
    bob = client_as(make_user("bob@example.com"))
    assert bob.get(f"/api/projects/{pid}/review/next").status_code == 404
    assert (
        bob.post(f"/api/projects/{pid}/review/{row['id']}", json={"action": "approve"}).status_code
        == 404
    )
    instruct = f"/api/projects/{pid}/review/{row['id']}/instruct"
    assert bob.post(instruct, json={"instruction": "x"}).status_code == 404
