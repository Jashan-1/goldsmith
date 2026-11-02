import re
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from goldsmith.api.deps import owned_project
from goldsmith.core.report import build_report, export_zip, start_audit
from goldsmith.db import get_db
from goldsmith.models import Project

router = APIRouter(prefix="/api/projects/{project_id}", tags=["report"])


@router.get("/report")
def report(project: Project = Depends(owned_project), db: Session = Depends(get_db)) -> Any:
    return build_report(db, project)


@router.post("/audit")
def audit(project: Project = Depends(owned_project), db: Session = Depends(get_db)) -> Any:
    sampled = start_audit(db, project)
    if not sampled:
        raise HTTPException(409, "No auto-accepted rows to audit.")
    db.commit()
    return {"sampled": sampled}


@router.get("/export")
def export(
    format: Literal["jsonl", "csv"] = "jsonl",
    project: Project = Depends(owned_project),
    db: Session = Depends(get_db),
) -> Response:
    slug = re.sub(r"[^a-z0-9]+", "-", project.name.lower()).strip("-") or "dataset"
    return Response(
        export_zip(db, project, format),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{slug}-{format}.zip"'},
    )
