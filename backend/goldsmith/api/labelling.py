from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from goldsmith.api.deps import owned_project
from goldsmith.core.labelling import DECIDABLE
from goldsmith.db import get_db
from goldsmith.models import Job, Label, Project, Row
from goldsmith.schemas import JobOut, LabelIn, LabelStats

router = APIRouter(prefix="/api/projects/{project_id}", tags=["labelling"])


@router.post("/label", response_model=JobOut, status_code=202)
def start_labelling(
    body: LabelIn | None = None,
    project: Project = Depends(owned_project),
    db: Session = Depends(get_db),
) -> Job:
    has_seed = db.scalar(
        select(func.count())
        .select_from(Label)
        .join(Row, Label.row_id == Row.id)
        .where(Row.project_id == project.id, Label.is_current, Label.source == "human_seed")
    )
    if not has_seed:
        raise HTTPException(409, "Label at least one seed first.")
    running = db.scalar(
        select(Job.id).where(
            Job.project_id == project.id,
            Job.kind == "label",
            Job.status.in_(("queued", "running")),
        )
    )
    if running:
        raise HTTPException(409, "A labelling job is already running for this project.")
    job = Job(project_id=project.id, kind="label", payload={"cheap": (body or LabelIn()).cheap})
    db.add(job)
    db.commit()
    return job


@router.get("/label/stats", response_model=LabelStats)
def label_stats(
    project: Project = Depends(owned_project), db: Session = Depends(get_db)
) -> LabelStats:
    rows = select(Row.id).where(Row.project_id == project.id, Row.duplicate_of.is_(None))
    current = Label.is_current & Label.row_id.in_(rows)
    counts = dict(
        db.execute(select(Label.status, func.count()).where(current).group_by(Label.status)).all()
    )
    total = db.scalar(select(func.count()).select_from(rows.subquery())) or 0
    counts["unlabelled"] = total - sum(counts.values())
    uncertainties = db.scalars(
        select(Label.uncertainty).where(current, Label.source == "llm", Label.status.in_(DECIDABLE))
    ).all()
    return LabelStats(
        counts=counts,
        uncertainties=[u for u in uncertainties if u is not None],
        threshold=project.review_threshold,
    )
