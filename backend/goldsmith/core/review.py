"""Human review of LLM labels. Independent of FastAPI so scripts and an MCP server can call it."""

import uuid
from typing import Any, Literal

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from goldsmith.core.labelling import (
    DECIDABLE,
    LabelOutput,
    labelling_context,
    similar_corrections,
    user_message,
)
from goldsmith.ingest.parse import row_text
from goldsmith.llm.provider import get_provider
from goldsmith.models import Correction, Job, Label, Project, Row

Action = Literal["approve", "reject", "edit", "instruction"]
STATUS_FOR_ACTION = {
    "approve": "approved",
    "reject": "rejected",
    "edit": "edited",
    "instruction": "edited",
}
SIMILAR_ROWS = 10


class ReviewError(ValueError):
    pass


def current_label(db: Session, row_id: uuid.UUID) -> Label | None:
    return db.scalar(select(Label).where(Label.row_id == row_id, Label.is_current))


def next_card(db: Session, project: Project) -> tuple[Row, Label] | None:
    """The pending row the model is least sure about."""
    hit = db.execute(
        select(Row, Label)
        .join(Label, Label.row_id == Row.id)
        .where(Row.project_id == project.id, Label.is_current, Label.status == "needs_review")
        .order_by(Label.uncertainty.desc(), Row.created_at, Row.row_index)
        .limit(1)
    ).first()
    return (hit[0], hit[1]) if hit else None


def queue_counts(db: Session, project: Project) -> dict[str, int]:
    rows = select(Row.id).where(Row.project_id == project.id)
    return dict(
        db.execute(
            select(Label.status, func.count())
            .where(Label.is_current, Label.row_id.in_(rows))
            .group_by(Label.status)
        ).all()
    )


def preview_instruction(db: Session, project: Project, row: Row, instruction: str) -> LabelOutput:
    """Relabel one row following the reviewer's instruction. Nothing is saved."""
    label = current_label(db, row.id)
    ctx = labelling_context(db, project)
    message = user_message(
        row,
        similar_corrections(db, project.id, row.embedding),
        instruction=instruction,
        current=label.expected_output if label else None,
    )
    return get_provider().structured(ctx.instructions, message, ctx.schema, temperature=0)


def submit_review(
    db: Session,
    project: Project,
    row: Row,
    reviewer_id: uuid.UUID,
    action: Action,
    expected_output: str | None = None,
    instruction: str | None = None,
    seconds_spent: int = 0,
) -> Label:
    """Record a review as a new human label plus a correction. Caller commits."""
    before = current_label(db, row.id)
    if before is None:
        raise ReviewError("This row has no label to review yet.")
    if action in ("edit", "instruction") and not (expected_output and expected_output.strip()):
        raise ReviewError("An edit needs the new expected output.")
    if action == "instruction" and not (instruction and instruction.strip()):
        raise ReviewError("An instruction review needs the instruction text.")

    after = (
        expected_output.strip() if action in ("edit", "instruction") and expected_output else None
    )
    new_output = after if after is not None else before.expected_output

    db.execute(update(Label).where(Label.id == before.id).values(is_current=False))
    label = Label(
        row_id=row.id,
        rule_set_version=before.rule_set_version,
        expected_output=new_output,
        rationale=before.rationale if after is None else None,
        source="human_review",
        status=STATUS_FOR_ACTION[action],
        uncertainty=before.uncertainty,
        uncertainty_breakdown=before.uncertainty_breakdown,
    )
    db.add(label)
    db.flush()
    db.add(
        Correction(
            row_id=row.id,
            label_id=label.id,
            action=action,
            before=before.expected_output,
            after=new_output if action != "reject" else None,
            instruction_text=instruction.strip() if instruction else None,
            embedding=get_provider().embed(
                [_correction_text(row, action, new_output, instruction)]
            )[0],
            reviewer_id=reviewer_id,
            seconds_spent=max(0, min(seconds_spent, 3600)),
        )
    )
    return label


def _correction_text(row: Row, action: str, output: Any, instruction: str | None) -> str:
    """Input plus correction, embedded so later labelling can retrieve similar lessons."""
    detail = f"instruction: {instruction}" if instruction else f"{action}: {output}"
    return f"{row_text(row.input)}\nCorrection {detail}"


def similar_pending_rows(
    db: Session, project: Project, row: Row, k: int = SIMILAR_ROWS
) -> list[Row]:
    """The k rows most like this one whose LLM label nobody has reviewed yet."""
    pending = select(Label.row_id).where(
        Label.is_current, Label.source == "llm", Label.status.in_(DECIDABLE)
    )
    return list(
        db.scalars(
            select(Row)
            .where(Row.project_id == project.id, Row.id != row.id, Row.id.in_(pending))
            .order_by(Row.embedding.cosine_distance(row.embedding))
            .limit(k)
        )
    )


def queue_similar_relabel(db: Session, project: Project, row: Row, instruction: str) -> Job | None:
    rows = similar_pending_rows(db, project, row)
    if not rows:
        return None
    job = Job(
        project_id=project.id,
        kind="label",
        payload={"row_ids": [str(r.id) for r in rows], "instruction": instruction},
    )
    db.add(job)
    return job
