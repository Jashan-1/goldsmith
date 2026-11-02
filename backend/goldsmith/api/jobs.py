import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from goldsmith.api.deps import current_user
from goldsmith.db import get_db
from goldsmith.models import Job, Project, User
from goldsmith.schemas import JobOut

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> Job:
    job = db.get(Job, job_id)
    if job is None or db.get_one(Project, job.project_id).owner_id != user.id:
        raise HTTPException(404, "Job not found")
    return job
