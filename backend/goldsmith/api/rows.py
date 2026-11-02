from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from goldsmith.api.deps import owned_project
from goldsmith.db import get_db
from goldsmith.models import Label, Project, Row
from goldsmith.schemas import ClusterCount, LabelInfo, RowOut, RowsPage

router = APIRouter(prefix="/api/projects/{project_id}/rows", tags=["rows"])

Status = Literal[
    "unlabelled", "pending", "auto_accepted", "needs_review", "approved", "rejected", "edited"
]


@router.get("", response_model=RowsPage)
def list_rows(
    cluster: int | None = None,
    duplicates: Literal["include", "exclude", "only"] = "include",
    status: Status | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    project: Project = Depends(owned_project),
    db: Session = Depends(get_db),
) -> RowsPage:
    query = select(Row).where(Row.project_id == project.id)
    if status == "unlabelled":
        query = query.where(Row.id.not_in(select(Label.row_id).where(Label.is_current)))
    elif status is not None:
        current = select(Label.row_id).where(Label.is_current, Label.status == status)
        query = query.where(Row.id.in_(current))
    if cluster is not None:
        query = query.where(Row.cluster_id == cluster)
    if duplicates == "exclude":
        query = query.where(Row.duplicate_of.is_(None))
    elif duplicates == "only":
        query = query.where(Row.duplicate_of.is_not(None))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    page = db.scalars(
        query.order_by(Row.created_at, Row.row_index).offset(offset).limit(limit)
    ).all()
    labels = {
        label.row_id: label
        for label in db.scalars(
            select(Label).where(Label.row_id.in_([r.id for r in page]), Label.is_current)
        )
    }

    project_rows = Row.project_id == project.id
    counts = db.execute(
        select(Row.cluster_id, func.count())
        .where(project_rows, Row.cluster_id.is_not(None))
        .group_by(Row.cluster_id)
        .order_by(Row.cluster_id)
    ).all()
    dup_count = db.scalar(select(func.count()).where(project_rows, Row.duplicate_of.is_not(None)))
    return RowsPage(
        items=[
            RowOut.model_validate(r).model_copy(
                update={"label": LabelInfo.model_validate(labels[r.id]) if r.id in labels else None}
            )
            for r in page
        ],
        total=total,
        clusters=[ClusterCount(cluster_id=c, count=n) for c, n in counts],
        duplicates=dup_count or 0,
    )
