import uuid
from typing import Any

from sqlalchemy import JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from goldsmith.db import Entity


class RuleSet(Entity):
    """Append-only: each edit is a new version, so old labels keep the rules they used."""

    __tablename__ = "rule_sets"
    __table_args__ = (UniqueConstraint("project_id", "version"),)

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    version: Mapped[int]
    rules: Mapped[list[dict[str, Any]]] = mapped_column(JSON)  # [{id, text, kind}]
