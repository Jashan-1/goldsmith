import uuid
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from goldsmith.db import Entity

EMBEDDING_DIM = 1536


class Row(Entity):
    __tablename__ = "rows"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    source_file_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("source_files.id"))
    row_index: Mapped[int]  # position in the source file, for stable ordering
    input: Mapped[dict[str, Any]] = mapped_column(JSON)
    reference_output: Mapped[Any | None] = mapped_column(JSON)
    # "metadata" is reserved on SQLAlchemy models, so the attribute is `meta`.
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    embedding: Mapped[Any | None] = mapped_column(Vector(EMBEDDING_DIM))
    cluster_id: Mapped[int | None]
    duplicate_of: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("rows.id"))
