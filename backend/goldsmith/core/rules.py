import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from goldsmith.models import RuleSet


def current_rule_set(db: Session, project_id: uuid.UUID) -> RuleSet | None:
    query = (
        select(RuleSet)
        .where(RuleSet.project_id == project_id)
        .order_by(RuleSet.version.desc())
        .limit(1)
    )
    return db.scalar(query)


def assign_rule_ids(rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep existing ids (stable across versions); give new rules the next free `rN`."""
    used = {r["id"] for r in rules if r.get("id")}
    numbers = [int(i[1:]) for i in used if i[:1] == "r" and i[1:].isdigit()]
    next_n = max(numbers, default=0) + 1
    out = []
    for r in rules:
        if not r.get("id"):
            r = {**r, "id": f"r{next_n}"}
            next_n += 1
        out.append(r)
    return out
