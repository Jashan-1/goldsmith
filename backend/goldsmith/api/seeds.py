import uuid

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from goldsmith.api.deps import owned_project
from goldsmith.core.rules import current_rule_set
from goldsmith.core.seeds import select_seeds
from goldsmith.db import get_db
from goldsmith.models import Label, Project, Row
from goldsmith.schemas import RowOut, SeedLabelIn, SeedOut, SeedSelectIn

router = APIRouter(prefix="/api/projects/{project_id}/seeds", tags=["seeds"])


def _seed_labels(db: Session, row_ids: list[uuid.UUID]) -> dict[uuid.UUID, Label]:
    labels = db.scalars(
        select(Label).where(
            Label.row_id.in_(row_ids), Label.is_current, Label.source == "human_seed"
        )
    )
    return {label.row_id: label for label in labels}


def _seeds(db: Session, project: Project) -> list[SeedOut]:
    rows = db.scalars(
        select(Row)
        .where(Row.project_id == project.id, Row.is_seed)
        .order_by(Row.cluster_id, Row.created_at, Row.row_index)
    ).all()
    labels = _seed_labels(db, [r.id for r in rows])
    return [
        SeedOut(
            row=RowOut.model_validate(r),
            expected_output=labels[r.id].expected_output if r.id in labels else None,
        )
        for r in rows
    ]


@router.get("", response_model=list[SeedOut])
def list_seeds(
    project: Project = Depends(owned_project), db: Session = Depends(get_db)
) -> list[SeedOut]:
    return _seeds(db, project)


@router.post("/select", response_model=list[SeedOut])
def select_seed_rows(
    body: SeedSelectIn | None = None,
    project: Project = Depends(owned_project),
    db: Session = Depends(get_db),
) -> list[SeedOut]:
    """(Re)select seeds. Seeds the user already labelled are kept."""
    candidates = db.scalars(
        select(Row)
        .where(Row.project_id == project.id, Row.duplicate_of.is_(None), Row.embedding.is_not(None))
        .order_by(Row.created_at, Row.row_index)
    ).all()
    if not candidates:
        raise HTTPException(409, "Upload data before selecting seeds.")

    labelled = _seed_labels(db, [r.id for r in candidates])
    keep = [i for i, r in enumerate(candidates) if r.id in labelled]
    chosen = set(
        select_seeds(
            np.array([r.embedding for r in candidates]),
            [r.cluster_id or 0 for r in candidates],
            (body or SeedSelectIn()).count,
            keep,
        )
    )
    db.execute(update(Row).where(Row.project_id == project.id).values(is_seed=False))
    for i, row in enumerate(candidates):
        row.is_seed = i in chosen
    db.commit()
    return _seeds(db, project)


@router.post("/{row_id}", response_model=SeedOut)
def label_seed(
    row_id: uuid.UUID,
    body: SeedLabelIn,
    project: Project = Depends(owned_project),
    db: Session = Depends(get_db),
) -> SeedOut:
    row = db.get(Row, row_id)
    if row is None or row.project_id != project.id or not row.is_seed:
        raise HTTPException(404, "Seed not found")
    rule_set = current_rule_set(db, project.id)
    # Retire the old current label first; the partial unique index allows only one.
    db.execute(
        update(Label).where(Label.row_id == row.id, Label.is_current).values(is_current=False)
    )
    db.add(
        Label(
            row_id=row.id,
            rule_set_version=rule_set.version if rule_set else 0,
            expected_output=body.expected_output,
            source="human_seed",
            status="approved",
        )
    )
    db.commit()
    return SeedOut(row=RowOut.model_validate(row), expected_output=body.expected_output)
