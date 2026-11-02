from collections.abc import Sequence

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from goldsmith.api.deps import current_user, owned_project
from goldsmith.core.labelling import apply_threshold
from goldsmith.db import get_db
from goldsmith.models import Project, User
from goldsmith.schemas import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> Sequence[Project]:
    query = select(Project).where(Project.owner_id == user.id).order_by(Project.created_at.desc())
    return db.scalars(query).all()


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(
    body: ProjectCreate, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> Project:
    project = Project(owner_id=user.id, **body.model_dump())
    db.add(project)
    db.commit()
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project: Project = Depends(owned_project)) -> Project:
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    body: ProjectUpdate,
    project: Project = Depends(owned_project),
    db: Session = Depends(get_db),
) -> Project:
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in changes.items():
        setattr(project, key, value)
    if "review_threshold" in changes:
        apply_threshold(db, project)
    db.commit()
    return project
