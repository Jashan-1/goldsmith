from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from goldsmith.api.deps import owned_project
from goldsmith.db import get_db
from goldsmith.models import Project, Row
from goldsmith.schemas import ClusterCount, RowOut, RowsPage

router = APIRouter(prefix="/api/projects/{project_id}/rows", tags=["rows"])


@router.get("", response_model=RowsPage)
def list_rows(
    cluster: int | None = None,
    duplicates: Literal["include", "exclude", "only"] = "include",
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    project: Project = Depends(owned_project),
    db: Session = Depends(get_db),
) -> RowsPage:
    # shortcut: status filter arrives with labels in M4.
    query = select(Row).where(Row.project_id == project.id)
    if cluster is not None:
        query = query.where(Row.cluster_id == cluster)
    if duplicates == "exclude":
        query = query.where(Row.duplicate_of.is_(None))
    elif duplicates == "only":
        query = query.where(Row.duplicate_of.is_not(None))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    page = db.scalars(query.order_by(Row.created_at, Row.row_index).offset(offset).limit(limit))

    project_rows = Row.project_id == project.id
    counts = db.execute(
        select(Row.cluster_id, func.count())
        .where(project_rows, Row.cluster_id.is_not(None))
        .group_by(Row.cluster_id)
        .order_by(Row.cluster_id)
    ).all()
    dup_count = db.scalar(select(func.count()).where(project_rows, Row.duplicate_of.is_not(None)))
    return RowsPage(
        items=[RowOut.model_validate(r) for r in page],
        total=total,
        clusters=[ClusterCount(cluster_id=c, count=n) for c, n in counts],
        duplicates=dup_count or 0,
    )
