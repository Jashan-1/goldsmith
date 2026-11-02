"""Background worker: polls the `jobs` table. Run with `python -m goldsmith.worker`."""

import logging
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from goldsmith.core.labelling import run_labelling
from goldsmith.db import SessionLocal
from goldsmith.ingest.job import run_ingest
from goldsmith.models import Job

logger = logging.getLogger(__name__)

Handler = Callable[[Session, Job, Callable[[int], None]], None]
HANDLERS: dict[str, Handler] = {"ingest": run_ingest, "label": run_labelling}


def claim_next(db: Session) -> Job | None:
    # shortcut: jobs left "running" by a crashed worker stay stuck; add a locked_at timeout if seen.
    job = db.scalar(
        select(Job)
        .where(Job.status == "queued")
        .order_by(Job.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if job is not None:
        job.status, job.locked_at = "running", datetime.now(UTC)
        db.commit()
    return job


def _set_progress(job_id: uuid.UUID, pct: int) -> None:
    # Separate session so progress is visible while the job's own transaction is still open.
    with SessionLocal() as s:
        s.execute(update(Job).where(Job.id == job_id).values(progress=min(pct, 99)))
        s.commit()


def run_job(db: Session, job: Job) -> None:
    job_id = job.id
    try:
        HANDLERS[job.kind](db, job, lambda pct: _set_progress(job_id, pct))
        job.status, job.progress = "done", 100
        db.commit()
    except Exception as e:
        logger.exception("job %s (%s) failed", job_id, job.kind)
        db.rollback()
        failed = db.get_one(Job, job_id)
        failed.status, failed.error = "failed", str(e)[:1000] or type(e).__name__
        db.commit()


def run_next() -> bool:
    """Run one queued job if there is one. Returns whether a job ran."""
    with SessionLocal() as db:
        job = claim_next(db)
        if job is None:
            return False
        run_job(db, job)
        return True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logger.info("worker started")
    while True:
        if not run_next():
            time.sleep(1)
