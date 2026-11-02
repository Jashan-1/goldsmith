import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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
