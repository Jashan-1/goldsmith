import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from goldsmith.api.deps import owned_project
from goldsmith.db import get_db
from goldsmith.ingest.parse import MAX_BYTES, FieldMapping, IngestError, parse_file
from goldsmith.llm.mapping import suggest_mapping
from goldsmith.models import Job, Project, SourceFile
from goldsmith.schemas import JobOut, UploadOut

router = APIRouter(prefix="/api/projects/{project_id}/files", tags=["files"])


@router.post("", response_model=UploadOut, status_code=201)
async def upload_file(
    file: UploadFile, project: Project = Depends(owned_project), db: Session = Depends(get_db)
) -> UploadOut:
    content = await file.read(MAX_BYTES + 1)
    filename = file.filename or "upload"
    try:
        parsed = parse_file(filename, content)
    except IngestError as e:
        raise HTTPException(413 if len(content) > MAX_BYTES else 400, str(e)) from e

    source = SourceFile(
        project_id=project.id,
        filename=filename[:255],
        format=parsed.format,
        row_count=len(parsed.records),
        content=content,
    )
    db.add(source)
    db.commit()
    return UploadOut(
        id=source.id,
        filename=source.filename,
        format=parsed.format,
        row_count=source.row_count,
        columns=parsed.columns,
        preview=parsed.records[:5],
        proposed_mapping=suggest_mapping(parsed),
    )


@router.post("/{file_id}/mapping", response_model=JobOut, status_code=202)
def confirm_mapping(
    file_id: uuid.UUID,
    mapping: FieldMapping,
    project: Project = Depends(owned_project),
    db: Session = Depends(get_db),
) -> Job:
    source = db.get(SourceFile, file_id)
    if source is None or source.project_id != project.id:
        raise HTTPException(404, "File not found")
    if source.field_mapping is not None:
        raise HTTPException(409, "The mapping for this file is already confirmed.")
    problems = mapping.problems(parse_file(source.filename, source.content).columns)
    if problems:
        raise HTTPException(422, " ".join(problems))

    source.field_mapping = mapping.model_dump()
    job = Job(project_id=project.id, kind="ingest", payload={"source_file_id": str(source.id)})
    db.add(job)
    db.commit()
    return job
