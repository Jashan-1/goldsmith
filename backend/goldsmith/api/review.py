import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from goldsmith.api.deps import current_user, owned_project
from goldsmith.core.labelling import LabellingError
from goldsmith.core.review import (
    ReviewError,
    current_label,
    next_card,
    preview_instruction,
    queue_counts,
    queue_similar_relabel,
    submit_review,
)
from goldsmith.db import get_db
from goldsmith.models import Project, Row, User
from goldsmith.schemas import (
    InstructIn,
    InstructOut,
    JobOut,
    LabelInfo,
    ReviewCard,
    ReviewIn,
    ReviewOut,
    RowOut,
)

router = APIRouter(prefix="/api/projects/{project_id}/review", tags=["review"])


def _row(db: Session, project: Project, row_id: uuid.UUID) -> Row:
    row = db.get(Row, row_id)
    if row is None or row.project_id != project.id:
        raise HTTPException(404, "Row not found")
    return row


@router.get("/next", response_model=ReviewCard)
def review_next(
    project: Project = Depends(owned_project), db: Session = Depends(get_db)
) -> ReviewCard:
    card = next_card(db, project)
    row = (
        RowOut.model_validate(card[0]).model_copy(
            update={"label": LabelInfo.model_validate(card[1])}
        )
        if card
        else None
    )
    return ReviewCard(row=row, counts=queue_counts(db, project))


@router.post("/{row_id}/instruct", response_model=InstructOut)
def instruct(
    row_id: uuid.UUID,
    body: InstructIn,
    project: Project = Depends(owned_project),
    db: Session = Depends(get_db),
) -> InstructOut:
    row = _row(db, project, row_id)
    if current_label(db, row.id) is None:
        raise HTTPException(409, "This row has no label to review yet.")
    try:
        out = preview_instruction(db, project, row, body.instruction)
    except LabellingError as e:
        raise HTTPException(409, str(e)) from e
    return InstructOut(expected_output=out.expected_output, rationale=out.rationale)


@router.post("/{row_id}", response_model=ReviewOut)
def review_row(
    row_id: uuid.UUID,
    body: ReviewIn,
    project: Project = Depends(owned_project),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ReviewOut:
    row = _row(db, project, row_id)
    try:
        label = submit_review(
            db,
            project,
            row,
            user.id,
            body.action,
            expected_output=body.expected_output,
            instruction=body.instruction,
            seconds_spent=body.seconds_spent,
        )
    except ReviewError as e:
        raise HTTPException(422, str(e)) from e
    job = None
    if body.apply_to_similar and body.action == "instruction" and body.instruction:
        job = queue_similar_relabel(db, project, row, body.instruction.strip())
    db.commit()
    return ReviewOut(
        label=LabelInfo.model_validate(label),
        similar_job=JobOut.model_validate(job) if job else None,
    )
