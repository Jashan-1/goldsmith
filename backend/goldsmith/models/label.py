import uuid
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from goldsmith.db import Entity


class Label(Entity):
    __tablename__ = "labels"
    # At most one current label per row; older ones are kept as history.
    __table_args__ = (
        Index("uq_labels_current_row", "row_id", unique=True, postgresql_where=text("is_current")),
    )

    row_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rows.id"), index=True)
    rule_set_version: Mapped[int]
    expected_output: Mapped[Any] = mapped_column(JSON)
    rationale: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(20))  # human_seed | llm | human_review
    # pending | auto_accepted | needs_review | approved | rejected | edited
    status: Mapped[str] = mapped_column(String(20))
    uncertainty: Mapped[float | None]
    uncertainty_breakdown: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    is_current: Mapped[bool] = mapped_column(default=True)
