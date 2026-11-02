import uuid

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from goldsmith.db import get_db
from goldsmith.models import Project, User


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user_id = request.session.get("user_id")
    user = db.get(User, uuid.UUID(user_id)) if user_id else None
    if user is None:
        raise HTTPException(401, "Not signed in")
    return user


def owned_project(
    project_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Project:
    """Every project-scoped route goes through this, so users only reach their own data."""
    project = db.get(Project, project_id)
    # 404 rather than 403 so other users' project ids aren't confirmed to exist.
    if project is None or project.owner_id != user.id:
        raise HTTPException(404, "Project not found")
    return project
