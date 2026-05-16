from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Stage
# ---------------------------------------------------------------------------

class StageIn(BaseModel):
    """Used in the stage-upsert endpoint. id is optional (no id = new stage)."""
    id: Optional[int] = None
    name: str
    position: int


class StageOut(BaseModel):
    id: int
    task_type_id: int
    name: str
    position: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

class CategoryCreate(BaseModel):
    name: str


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None


class CategoryOut(BaseModel):
    id: int
    name: str
    position: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# TaskType
# ---------------------------------------------------------------------------

class TaskTypeCreate(BaseModel):
    name: str
    stages: list[str]  # plain stage names; position = array index


class TaskTypeUpdate(BaseModel):
    name: Optional[str] = None


class TaskTypeOut(BaseModel):
    id: int
    name: str
    stages: list[StageOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------

class TaskCreate(BaseModel):
    title: str
    category_id: int
    task_type_id: int
    parent_task_id: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    current_stage_id: Optional[int] = None
    task_type_id: Optional[int] = None


class TaskOut(BaseModel):
    id: int
    title: str
    category_id: int
    task_type_id: int
    current_stage_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    position: int
    created_at: datetime
    updated_at: datetime
    current_stage: Optional[StageOut] = None
    subtasks: list["TaskOut"] = []

    model_config = {"from_attributes": True}


# Required for self-referential model
TaskOut.model_rebuild()
