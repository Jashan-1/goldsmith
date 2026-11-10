"""Repeatable benchmark, after FT-Dojo's fixed-task, fixed-budget setup (arXiv 2603.01712).

Hides the gold column from Goldsmith, labels the seeds from it as the expert would, labels the
rest, then compares review strategies on that one labelled run with the same review budget:
  goldsmith: review the most uncertain rows
  random:    review random rows (expected value, so no sampling noise)
  none:      no review
A reviewed row counts as correct, as if a perfect reviewer fixed it.

    cd backend && uv run --env-file ../.env python -m goldsmith.bench FILE --gold label
"""

import argparse
import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from goldsmith.config import settings
from goldsmith.worker.runner import run_next


def score_arms(items: list[tuple[float, bool]], budget: int) -> dict[str, Any]:
    """items: (uncertainty, model_was_right) for each LLM-labelled row."""
    n = len(items)
    wrong = sum(not ok for _, ok in items)
    budget = min(budget, n)
    ranked = sorted(items, key=lambda x: -x[0])[:budget]
    caught = {
        "none": 0.0,
        "goldsmith": float(sum(not ok for _, ok in ranked)),
        "random": budget * wrong / n if n else 0.0,
    }
    return {
        "rows": n,
        "model_errors": wrong,
        "budget": budget,
        "arms": {
            name: {
                "errors_caught": round(c, 2),
                "accuracy": round((n - wrong + c) / n, 4) if n else None,
            }
            for name, c in caught.items()
        },
    }


def _ok(res: Any) -> Any:
    if res.status_code >= 400:
        raise RuntimeError(f"{res.request.method} {res.request.url.path}: {res.text}")
    return res.json()


def _wait(client: TestClient, job: dict[str, Any]) -> None:
    while run_next():
        pass
    done = _ok(client.get(f"/api/jobs/{job['id']}"))
    if done["status"] != "done":
        raise RuntimeError(f"{job['kind']} job failed: {done['error']}")


def run(
    client: TestClient, path: Path, gold: str, budget: int, seeds: int = 10, cheap: bool = False
) -> dict[str, Any]:
    # shortcut: classification only (exact match); text tasks need a graded comparison.
    project = {"name": f"Bench · {path.name}", "task_type": "classification"}
    pid = _ok(client.post("/api/projects", json=project))["id"]
    up = _ok(
        client.post(f"/api/projects/{pid}/files", files={"file": (path.name, path.read_bytes())})
    )
    if gold not in up["columns"]:
        raise RuntimeError(f"No column {gold!r}; columns are {up['columns']}")
    m = up["proposed_mapping"]
    mapping = {
        # Gold goes to metadata: the model never sees it, and it is not a reference signal.
        "input": [c for c in m["input"] if c != gold],
        "reference_output": None,
        "metadata": [c for c in m["metadata"] if c != gold] + [gold],
    }
    _wait(client, _ok(client.post(f"/api/projects/{pid}/files/{up['id']}/mapping", json=mapping)))

    for seed in _ok(client.post(f"/api/projects/{pid}/seeds/select", json={"count": seeds})):
        row = seed["row"]
        body = {"expected_output": str(row["metadata"][gold])}
        _ok(client.post(f"/api/projects/{pid}/seeds/{row['id']}", json=body))
    _wait(client, _ok(client.post(f"/api/projects/{pid}/label", json={"cheap": cheap})))

    items, offset = [], 0
    while True:
        page = _ok(client.get(f"/api/projects/{pid}/rows?limit=200&offset={offset}"))
        for row in page["items"]:
            label = row["label"]
            if label and label["source"] == "llm":
                same = str(label["expected_output"]).strip().lower()
                items.append((label["uncertainty"], same == str(row["metadata"][gold]).lower()))
        offset += len(page["items"])
        if not page["items"] or offset >= page["total"]:
            break
    return {
        "file": path.name,
        "project_id": pid,
        "seeds": seeds,
        "samples": 1 if cheap else settings.label_samples,
        "model": settings.openai_model,
        **score_arms(items, budget),
    }


def main() -> None:
    from goldsmith.api.deps import current_user
    from goldsmith.db import SessionLocal
    from goldsmith.main import create_app
    from goldsmith.models import User

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("file", type=Path, help="CSV or JSONL with a human gold-label column")
    p.add_argument("--gold", required=True, help="name of the gold-label column")
    p.add_argument("--budget", type=int, default=20, help="rows a human may review")
    p.add_argument("--seeds", type=int, default=10)
    p.add_argument("--cheap", action="store_true", help="1 sample per row")
    args = p.parse_args()

    with SessionLocal() as db:
        email = "bench@goldsmith.local"
        user = db.query(User).filter_by(email=email).first()
        if user is None:
            user = User(email=email, name="Benchmark", google_sub="bench")
            db.add(user)
            db.commit()
        db.expunge(user)
    app = create_app()
    app.dependency_overrides[current_user] = lambda: user
    result = run(TestClient(app), args.file, args.gold, args.budget, args.seeds, args.cheap)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
