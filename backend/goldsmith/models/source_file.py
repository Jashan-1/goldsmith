import uuid
from typing import Any

from sqlalchemy import JSON, ForeignKey, LargeBinary, String
from sqlalchemy.orm import Mapped, deferred, mapped_column

from goldsmith.db import Entity


class SourceFile(Entity):
    __tablename__ = "source_files"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    format: Mapped[str] = mapped_column(String(10))  # csv | jsonl | qa | chat
    row_count: Mapped[int]
    # Null until the user confirms it; confirming starts the ingest job.
    field_mapping: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    # Raw upload kept so ingest can run after the user confirms the mapping (max 10 MB).
    content: Mapped[bytes] = deferred(mapped_column(LargeBinary))
