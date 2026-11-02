from collections.abc import Callable

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from goldsmith.config import settings
from goldsmith.ingest.parse import FieldMapping, build_row_fields, parse_file, row_text
from goldsmith.ingest.similarity import cluster, find_duplicates
from goldsmith.llm.provider import get_provider
from goldsmith.models import Job, Row, SourceFile

EMBED_BATCH = 100


def run_ingest(db: Session, job: Job, progress: Callable[[int], None]) -> None:
    source = db.get_one(SourceFile, job.payload["source_file_id"])
    parsed = parse_file(source.filename, source.content)
    mapping = FieldMapping.model_validate(source.field_mapping)

    rows = [
        Row(project_id=source.project_id, source_file_id=source.id, row_index=i, **fields)
        for i, fields in enumerate(build_row_fields(parsed, mapping))
    ]
    texts = [row_text(r.input) for r in rows]
    provider = get_provider()
    for start in range(0, len(rows), EMBED_BATCH):
        batch = rows[start : start + EMBED_BATCH]
        for row, vec in zip(batch, provider.embed(texts[start : start + EMBED_BATCH]), strict=True):
            row.embedding = vec
        progress(int(90 * (start + len(batch)) / len(rows)))
    db.add_all(rows)
    db.flush()
    recompute_duplicates_and_clusters(db, source.project_id)


def recompute_duplicates_and_clusters(db: Session, project_id: object) -> None:
    """Runs over the whole project so rows from several files dedupe against each other."""
    rows = db.scalars(
        select(Row).where(Row.project_id == project_id).order_by(Row.created_at, Row.row_index)
    ).all()
    if not rows:
        return
    vectors = np.array([r.embedding for r in rows], dtype=np.float32)
    dup = find_duplicates(vectors, settings.dedupe_threshold)
    keep = [i for i, d in enumerate(dup) if d is None]
    labels = dict(zip(keep, cluster(vectors[keep]), strict=True))
    for i, row in enumerate(rows):
        original = dup[i]
        row.duplicate_of = rows[original].id if original is not None else None
        # Duplicates share their original's cluster so they show up together.
        row.cluster_id = labels[original if original is not None else i]
