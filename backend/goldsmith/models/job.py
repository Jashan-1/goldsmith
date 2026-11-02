import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from goldsmith.db import Entity


class Job(Entity):
    __tablename__ = "jobs"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(10), default="queued", index=True)
    progress: Mapped[int] = mapped_column(default=0)
    error: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
