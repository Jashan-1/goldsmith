"""Goldenness report, audit sample and export. Independent of FastAPI."""

import csv
import io
import json
import zipfile
from collections import Counter
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from goldsmith.core.rules import current_rule_set
from goldsmith.models import Correction, Label, Project, Row

AUDIT_SIZE = 10
REVIEWED = ("approved", "edited", "rejected")
EXPORT_FIELDS = (
    "id",
    "input",
    "expected_output",
    "rationale",
    "label_source",
    "status",
    "uncertainty",
    "rule_set_version",
    "cluster_id",
)


def _labelled(db: Session, project: Project) -> list[tuple[Row, Label | None]]:
    """Every non-duplicate row with its current label (None if unlabelled)."""
    return [
        (r, lab)
        for r, lab in db.execute(
            select(Row, Label)
            .outerjoin(Label, (Label.row_id == Row.id) & Label.is_current)
            .where(Row.project_id == project.id, Row.duplicate_of.is_(None))
            .order_by(Row.row_index)
        ).all()
    ]


def _is_audit(label: Label | None) -> bool:
    return bool(label and (label.uncertainty_breakdown or {}).get("audit"))


def build_report(db: Session, project: Project) -> dict[str, Any]:
    rows = _labelled(db, project)
    labels = [lab for _, lab in rows if lab]
    # Seeds are counted separately, not as "approved".
    status = Counter(lab.status for lab in labels if lab.source != "human_seed")
    reviewed = [lab for lab in labels if lab.source == "human_review"]
    changed = sum(1 for lab in reviewed if lab.status in ("edited", "rejected"))
    duplicates = db.scalar(
        select(func.count()).where(Row.project_id == project.id, Row.duplicate_of.is_not(None))
    )
    seconds = db.scalar(
        select(func.coalesce(func.sum(Correction.seconds_spent), 0))
        .join(Row, Correction.row_id == Row.id)
        .where(Row.project_id == project.id)
    )

    clusters: dict[int, dict[str, int]] = {}
    for row, lab in rows:
        if row.cluster_id is None:
            continue
        c = clusters.setdefault(row.cluster_id, {"rows": 0, "human": 0})
        c["rows"] += 1
        c["human"] += bool(lab and lab.source in ("human_seed", "human_review"))
    coverage = [
        # Flag clusters where fewer than 2 rows (or the whole cluster, if smaller) were checked.
        {"cluster_id": cid, **c, "flagged": c["human"] < min(2, c["rows"])}
        for cid, c in sorted(clusters.items())
    ]

    audit = [lab for lab in labels if _is_audit(lab)]
    audit_done = [lab for lab in audit if lab.source == "human_review"]
    return {
        "total_rows": len(rows) + (duplicates or 0),
        "duplicates": duplicates or 0,
        "seeds": sum(1 for r, _ in rows if r.is_seed),
        "unlabelled": len(rows) - len(labels),
        "status": dict(status),
        "reviewed": len(reviewed),
        "review_rate": changed / len(reviewed) if reviewed else None,
        "human_minutes": round((seconds or 0) / 60, 1),
        "coverage": coverage,
        "audit": {
            "sampled": len(audit),
            "reviewed": len(audit_done),
            "changed": sum(1 for lab in audit_done if lab.status in ("edited", "rejected")),
        },
    }


def start_audit(db: Session, project: Project, size: int = AUDIT_SIZE) -> int:
    """Send a random sample of auto-accepted rows to the review queue. Caller commits.

    The copies use source "audit" so re-applying the threshold leaves them in the queue,
    and the "audit" breakdown flag survives onto the human label for the report.
    """
    picks = db.scalars(
        select(Label)
        .join(Row, Label.row_id == Row.id)
        .where(Row.project_id == project.id, Label.is_current, Label.status == "auto_accepted")
        .order_by(func.random())
        .limit(size)
    ).all()
    for old in picks:
        db.execute(update(Label).where(Label.id == old.id).values(is_current=False))
        db.add(
            Label(
                row_id=old.row_id,
                rule_set_version=old.rule_set_version,
                expected_output=old.expected_output,
                rationale=old.rationale,
                source="audit",
                status="needs_review",
                uncertainty=old.uncertainty,
                uncertainty_breakdown={**(old.uncertainty_breakdown or {}), "audit": 1},
            )
        )
    db.flush()
    return len(picks)


def export_records(db: Session, project: Project) -> list[dict[str, Any]]:
    """Labelled rows, rejected ones excluded."""
    return [
        {
            "id": str(row.id),
            "input": row.input,
            "expected_output": lab.expected_output,
            "rationale": lab.rationale,
            "label_source": lab.source,
            "status": lab.status,
            "uncertainty": lab.uncertainty,
            "rule_set_version": lab.rule_set_version,
            "cluster_id": row.cluster_id,
        }
        for row, lab in _labelled(db, project)
        if lab and lab.status != "rejected"
    ]


def export_zip(db: Session, project: Project, fmt: str) -> bytes:
    records = export_records(db, project)
    if fmt == "jsonl":
        data = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records)
    else:
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=EXPORT_FIELDS)
        writer.writeheader()
        for r in records:
            # Structured cells (chat messages, dict inputs) are JSON-encoded.
            writer.writerow(
                {k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in r.items()}
            )
        data = buf.getvalue()

    rule_set = current_rule_set(db, project.id)
    manifest = {
        "project": project.name,
        "task_type": project.task_type,
        "rule_set": {"version": rule_set.version, "rules": rule_set.rules} if rule_set else None,
        "counts": dict(Counter(r["status"] for r in records), total=len(records)),
        "format": fmt,
        "exported_at": datetime.now(UTC).isoformat(),
    }
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"dataset.{fmt}", data)
        zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
    return out.getvalue()
