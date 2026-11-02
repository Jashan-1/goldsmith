import re

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from goldsmith.core.labelling import build_instructions, label_schema
from goldsmith.models import Correction, Label, Row, User
from goldsmith.worker.runner import run_next
from tests.fake_provider import FakeProvider
from tests.helpers import ingest, new_project

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


@pytest.fixture
def labelled_project(client: TestClient, fake_llm: FakeProvider) -> str:
    """100 tickets, rules saved, 10 seeds labelled from the reference column."""
    fake_llm.responses["LabelOutput"] = fake_label
    pid, _ = ingest(client, "tickets_100.csv", task_type="classification")
    client.put(
        f"/api/projects/{pid}/rules",
        json={"rules": [{"text": "Refund requests are billing.", "kind": "criterion"}]},
    )
    for seed in client.post(f"/api/projects/{pid}/seeds/select").json():
        row = seed["row"]
        client.post(
            f"/api/projects/{pid}/seeds/{row['id']}",
            json={"expected_output": row["reference_output"]},
        )
    return pid


def run_label_job(client: TestClient, pid: str, cheap: bool = False) -> dict:
    res = client.post(f"/api/projects/{pid}/label", json={"cheap": cheap})
    assert res.status_code == 202, res.text
    assert run_next()
    return client.get(f"/api/jobs/{res.json()['id']}").json()


def test_label_schema_restricts_classification_labels():
    schema = label_schema(["billing", "bug"])
    base = {"rationale": "", "rules_applied": [], "rule_concerns": [], "confidence": 1}
    assert schema.model_validate({**base, "expected_output": "bug"}).expected_output == "bug"
    with pytest.raises(ValidationError):
        schema.model_validate({**base, "expected_output": "shipping"})
    assert label_schema(None).model_fields["expected_output"].annotation is str


def test_instructions_include_rules_labels_and_seeds():
    row = Row(input={"text": "charged twice"})
    rules = [{"id": "r1", "kind": "guardrail", "text": "No medical dosing."}]
    text = build_instructions("classification", rules, [(row, "billing")], ["billing", "bug"])
    assert "[r1] (guardrail) No medical dosing." in text
    assert "from: billing, bug" in text
    assert "charged twice" in text and "Expected output: billing" in text
    assert "<!--" not in text  # credit header is stripped


def test_labels_100_rows_end_to_end(client: TestClient, labelled_project: str, fake_llm):
    pid = labelled_project
    job = run_label_job(client, pid)
    assert job["status"] == "done", job["error"]
    assert job["error"] is None

    rows = client.get(f"/api/projects/{pid}/rows?limit=200").json()["items"]
    assert len(rows) == 100
    for r in rows:
        label = r["label"]
        assert label is not None, r
        if r["is_seed"]:
            assert label["source"] == "human_seed"
            continue
        assert label["source"] == "llm"
        assert label["status"] in ("auto_accepted", "needs_review")
        assert 0 <= label["uncertainty"] <= 1
        b = label["uncertainty_breakdown"]
        assert set(b["signals"]) == {
            "reference",
            "disagreement",
            "rule_concerns",
            "novelty",
            "confidence",
        }
        assert len(b["samples"]) == 3
        assert label["expected_output"] in {"billing", "shipping", "account", "bug"}
        # Disagreeing with the uploaded reference alone sends a row to review.
        mismatch = label["expected_output"] != r["reference_output"]
        assert b["signals"]["reference"] == float(mismatch)
        if mismatch:
            assert label["status"] == "needs_review"

    # 3 samples per non-seed row, first at temperature 0.
    llm_calls = [c for c in fake_llm.calls if "## Row to label" in c[1]]
    assert len(llm_calls) == 90 * 3
    assert sorted({c[2] for c in llm_calls}) == [0, 0.7]

    assert any(r["label"]["status"] == "needs_review" for r in rows)
    # Questions disagreed across samples and should rank as more uncertain.
    question = next(r for r in rows if not r["is_seed"] and "?" in r["input"]["text"])
    assert question["label"]["uncertainty_breakdown"]["signals"]["disagreement"] > 0


def test_threshold_moves_counts_without_llm_calls(client, labelled_project, fake_llm):
    pid = labelled_project
    run_label_job(client, pid)
    calls = len(fake_llm.calls)
    stats = client.get(f"/api/projects/{pid}/label/stats").json()
    assert len(stats["uncertainties"]) == 90
    assert stats["counts"]["approved"] == 10  # the seeds
    assert stats["counts"]["unlabelled"] == 0

    def needs_review() -> int:
        s = client.get(f"/api/projects/{pid}/label/stats").json()
        return s["counts"].get("needs_review", 0)

    client.patch(f"/api/projects/{pid}", json={"review_threshold": 0.0})
    assert needs_review() == 90
    client.patch(f"/api/projects/{pid}", json={"review_threshold": 1.0})
    expected = sum(u >= 1.0 for u in stats["uncertainties"])
    assert needs_review() == expected
    client.patch(f"/api/projects/{pid}", json={"review_threshold": 0.3})
    assert needs_review() == sum(u >= 0.3 for u in stats["uncertainties"])
    assert len(fake_llm.calls) == calls

    page = client.get(f"/api/projects/{pid}/rows?status=needs_review&limit=200").json()
    assert page["total"] == needs_review()


def test_cheap_mode_uses_one_sample(client, labelled_project, fake_llm):
    job = run_label_job(client, labelled_project, cheap=True)
    assert job["status"] == "done"
    llm_calls = [c for c in fake_llm.calls if "## Row to label" in c[1]]
    assert len(llm_calls) == 90
    row = next(
        r
        for r in client.get(f"/api/projects/{labelled_project}/rows?limit=200").json()["items"]
        if not r["is_seed"]
    )
    assert row["label"]["uncertainty_breakdown"]["signals"]["disagreement"] is None


def test_relabel_keeps_human_labels_and_uses_corrections(
    client, labelled_project, fake_llm, db: Session
):
    pid = labelled_project
    run_label_job(client, pid, cheap=True)
    rows = client.get(f"/api/projects/{pid}/rows?limit=200").json()["items"]
    target = next(r for r in rows if not r["is_seed"])

    # Simulate an M5 review: a human edit plus its correction record.
    label = db.scalar(select(Label).where(Label.is_current, Label.row_id == target["id"]))
    label.is_current = False
    human = Label(
        row_id=label.row_id,
        rule_set_version=1,
        expected_output="account",
        source="human_review",
        status="edited",
    )
    db.add(human)
    db.flush()
    row = db.get(Row, label.row_id)
    db.add(
        Correction(
            row_id=row.id,
            label_id=human.id,
            action="edit",
            before=label.expected_output,
            after="account",
            embedding=row.embedding,
            reviewer_id=db.scalar(select(User.id)),
        )
    )
    db.commit()

    fake_llm.calls.clear()
    run_label_job(client, pid, cheap=True)
    llm_calls = [c for c in fake_llm.calls if "## Row to label" in c[1]]
    assert len(llm_calls) == 89  # the human-reviewed row is skipped
    assert all("changed it to: account" in c[1] for c in llm_calls)

    after = client.get(f"/api/projects/{pid}/rows?limit=200").json()["items"]
    reviewed = next(r for r in after if r["id"] == target["id"])
    assert reviewed["label"]["source"] == "human_review"
    # Old LLM labels were retired, not duplicated.
    assert db.scalar(select(Label).where(Label.row_id == row.id, Label.is_current)).id == human.id


def test_partial_failure_is_reported(client, labelled_project, fake_llm):
    def flaky(user, temperature):
        if "Atlas" in row_of(user):
            raise RuntimeError("model overloaded")
        return fake_label(user, temperature)

    fake_llm.responses["LabelOutput"] = flaky
    job = run_label_job(client, labelled_project, cheap=True)
    assert job["status"] == "done"
    assert "rows failed to label" in job["error"] and "model overloaded" in job["error"]
    stats = client.get(f"/api/projects/{labelled_project}/label/stats").json()
    assert stats["counts"]["unlabelled"] > 0


def test_total_failure_fails_job(client, labelled_project, fake_llm):
    fake_llm.responses["LabelOutput"] = lambda u, t: (_ for _ in ()).throw(RuntimeError("down"))
    job = run_label_job(client, labelled_project, cheap=True)
    assert job["status"] == "failed"
    assert "down" in job["error"]


def test_label_preconditions(client: TestClient, client_as, make_user):
    pid, _ = ingest(client, "qa.csv")
    assert client.post(f"/api/projects/{pid}/label").status_code == 409  # no seeds labelled
    seed = client.post(f"/api/projects/{pid}/seeds/select", json={"count": 5}).json()[0]
    client.post(f"/api/projects/{pid}/seeds/{seed['row']['id']}", json={"expected_output": "x"})
    assert client.post(f"/api/projects/{pid}/label").status_code == 202
    assert client.post(f"/api/projects/{pid}/label").status_code == 409  # already queued

    bob = client_as(make_user("bob@example.com"))
    assert bob.post(f"/api/projects/{pid}/label").status_code == 404
    assert bob.get(f"/api/projects/{pid}/label/stats").status_code == 404
    assert client.get(f"/api/projects/{new_project(client)}/label/stats").json()["counts"] == {
        "unlabelled": 0
    }


def test_text_tasks_compare_with_reference_by_embedding(client, fake_llm):
    """QA rows: an answer far from the uploaded reference answer is flagged."""
    fake_llm.responses["LabelOutput"] = lambda user, t: {
        "expected_output": "Refunds are available within 30 days of purchase."
        if "refund" in row_of(user).lower()
        else "I am not sure.",
        "rationale": "",
        "rules_applied": [],
        "rule_concerns": [],
        "confidence": 0.9,
    }
    pid, _ = ingest(client, "qa.csv")
    seed = client.post(f"/api/projects/{pid}/seeds/select", json={"count": 5}).json()[0]["row"]
    client.post(f"/api/projects/{pid}/seeds/{seed['id']}", json={"expected_output": "x"})
    assert run_label_job(client, pid, cheap=True)["status"] == "done"
    rows = client.get(f"/api/projects/{pid}/rows").json()["items"]
    refs = {
        r["input"]["question"]: r["label"]["uncertainty_breakdown"]["signals"]["reference"]
        for r in rows
        if r["label"] and r["label"]["source"] == "llm"
    }
    assert refs.get("What is the refund window?", 0) == 0  # identical answer (unless it's a seed)
    assert max(refs.values()) == 1.0  # "I am not sure." vs a real answer
