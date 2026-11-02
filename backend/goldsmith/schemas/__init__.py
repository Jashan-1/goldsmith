import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from goldsmith.ingest.parse import FieldMapping

TaskType = Literal["classification", "qa", "chat"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    task_type: TaskType


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    review_threshold: float | None = Field(default=None, ge=0, le=1)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    task_type: TaskType
    status: str
    review_threshold: float
    created_at: datetime
    updated_at: datetime


class UploadOut(BaseModel):
    id: uuid.UUID
    filename: str
    format: str
    row_count: int
    columns: list[str]
    preview: list[dict[str, Any]]
    proposed_mapping: FieldMapping


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    status: str
    progress: int
    error: str | None


class RowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    row_index: int
    input: dict[str, Any]
    reference_output: Any | None
    metadata: dict[str, Any] = Field(validation_alias="meta")
    cluster_id: int | None
    duplicate_of: uuid.UUID | None
    is_seed: bool


class ClusterCount(BaseModel):
    cluster_id: int
    count: int


class RowsPage(BaseModel):
    items: list[RowOut]
    total: int
    clusters: list[ClusterCount]
    duplicates: int


class Rule(BaseModel):
    id: str | None = Field(default=None, max_length=20)
    text: str = Field(min_length=1, max_length=1000)
    kind: Literal["criterion", "guardrail", "rubric"]


class RulesIn(BaseModel):
    rules: list[Rule] = Field(max_length=50)


class RulesOut(BaseModel):
    version: int  # 0 means no rules saved yet
    rules: list[Rule]


class SeedSelectIn(BaseModel):
    count: int = Field(default=10, ge=5, le=50)


class SeedLabelIn(BaseModel):
    expected_output: str = Field(min_length=1, max_length=20000)


class SeedOut(BaseModel):
    row: RowOut
    expected_output: Any | None  # the human label, if saved
