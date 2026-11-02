from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from goldsmith.api.deps import owned_project
from goldsmith.core.rules import assign_rule_ids, current_rule_set
from goldsmith.db import get_db
from goldsmith.models import Project, RuleSet
from goldsmith.schemas import Rule, RulesIn, RulesOut

router = APIRouter(prefix="/api/projects/{project_id}/rules", tags=["rules"])


def _out(rule_set: RuleSet | None) -> RulesOut:
    if rule_set is None:
        return RulesOut(version=0, rules=[])
    return RulesOut(version=rule_set.version, rules=[Rule(**r) for r in rule_set.rules])


@router.get("", response_model=RulesOut)
def get_rules(project: Project = Depends(owned_project), db: Session = Depends(get_db)) -> RulesOut:
    return _out(current_rule_set(db, project.id))


@router.put("", response_model=RulesOut)
def put_rules(
    body: RulesIn, project: Project = Depends(owned_project), db: Session = Depends(get_db)
) -> RulesOut:
    rules = assign_rule_ids([r.model_dump() for r in body.rules])
    if len({r["id"] for r in rules}) != len(rules):
        raise HTTPException(422, "Rule ids must be unique.")
    current = current_rule_set(db, project.id)
    if current is not None and current.rules == rules:
        return _out(current)  # unchanged: no new version
    new = RuleSet(
        project_id=project.id, version=(current.version if current else 0) + 1, rules=rules
    )
    db.add(new)
    db.commit()
    return _out(new)
