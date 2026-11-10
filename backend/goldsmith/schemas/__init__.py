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
    label: "LabelInfo | None" = None


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


class LabelIn(BaseModel):
    cheap: bool = False  # 1 sample, no self-disagreement
    best_of: bool = False  # text tasks: a judge picks the best sample and scores it


class LabelInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    expected_output: Any
    rationale: str | None
    source: str
    status: str
    uncertainty: float | None
    uncertainty_breakdown: dict[str, Any] | None


class LabelStats(BaseModel):
    counts: dict[str, int]  # by label status, plus "unlabelled"
    uncertainties: list[float]  # LLM labels the threshold can still move
    threshold: float


RowOut.model_rebuild()


class ReviewCard(BaseModel):
    row: RowOut | None  # None when the queue is empty
    counts: dict[str, int]


class ReviewIn(BaseModel):
    action: Literal["approve", "reject", "edit", "instruction"]
    expected_output: str | None = Field(default=None, max_length=20000)
    instruction: str | None = Field(default=None, max_length=2000)
    seconds_spent: int = Field(default=0, ge=0)
    apply_to_similar: bool = False


class ReviewOut(BaseModel):
    label: LabelInfo
    similar_job: JobOut | None = None


class InstructIn(BaseModel):
    instruction: str = Field(min_length=1, max_length=2000)


class InstructOut(BaseModel):
    expected_output: str
    rationale: str
