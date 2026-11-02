import uuid
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from goldsmith.db import Entity
from goldsmith.models.row import EMBEDDING_DIM


class Correction(Entity):
    """A reviewer action on a label. Retrieved by similarity as context for later labelling."""

    __tablename__ = "corrections"

    row_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rows.id"), index=True)
    label_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("labels.id"))
    action: Mapped[str] = mapped_column(String(20))  # approve | reject | edit | instruction
    before: Mapped[Any | None] = mapped_column(JSON)
    after: Mapped[Any | None] = mapped_column(JSON)
    instruction_text: Mapped[str | None] = mapped_column(Text)
    embedding: Mapped[Any | None] = mapped_column(Vector(EMBEDDING_DIM))
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    seconds_spent: Mapped[int] = mapped_column(default=0)
