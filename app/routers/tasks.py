from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Task, Stage, TaskType
from app.schemas import TaskCreate, TaskUpdate, TaskOut

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _subtask_loader():
    """Chain selectinload 4 levels deep for subtasks + current_stage at each level."""
    sl = selectinload(Task.subtasks).selectinload(Task.current_stage)
    l2 = selectinload(Task.subtasks).selectinload(Task.subtasks).selectinload(Task.current_stage)
    l3 = (
        selectinload(Task.subtasks)
        .selectinload(Task.subtasks)
        .selectinload(Task.subtasks)
        .selectinload(Task.current_stage)
    )
    l4 = (
        selectinload(Task.subtasks)
        .selectinload(Task.subtasks)
        .selectinload(Task.subtasks)
        .selectinload(Task.subtasks)
        .selectinload(Task.current_stage)
    )
    return [
        selectinload(Task.current_stage),
        sl,
        l2,
        l3,
        l4,
    ]


@router.get("/", response_model=list[TaskOut])
async def list_tasks(
    category_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Task)
        .where(Task.category_id == category_id, Task.parent_task_id.is_(None))
        .order_by(Task.position)
        .options(*_subtask_loader())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=TaskOut, status_code=201)
async def create_task(body: TaskCreate, db: AsyncSession = Depends(get_db)):
    # Resolve first stage of the task type
    stages_result = await db.execute(
        select(Stage)
        .where(Stage.task_type_id == body.task_type_id)
        .order_by(Stage.position)
        .limit(1)
    )
    first_stage = stages_result.scalar_one_or_none()

    # Position within category (or under parent)
    max_pos = await db.scalar(
        select(func.max(Task.position)).where(
            Task.category_id == body.category_id,
            Task.parent_task_id == body.parent_task_id,
        )
    ) or -1

    task = Task(
        title=body.title,
        category_id=body.category_id,
        task_type_id=body.task_type_id,
        current_stage_id=first_stage.id if first_stage else None,
        parent_task_id=body.parent_task_id,
        position=max_pos + 1,
    )
    db.add(task)
    await db.commit()

    stmt = (
        select(Task)
        .where(Task.id == task.id)
        .options(*_subtask_loader())
    )
    result = await db.execute(stmt)
    return result.scalar_one()


@router.put("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int, body: TaskUpdate, db: AsyncSession = Depends(get_db)
):
    stmt = select(Task).where(Task.id == task_id).options(*_subtask_loader())
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if body.title is not None:
        task.title = body.title
    if body.current_stage_id is not None:
        task.current_stage_id = body.current_stage_id
    await db.commit()
    result = await db.execute(stmt)
    return result.scalar_one()


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()


@router.post("/{task_id}/advance-stage", response_model=TaskOut)
async def advance_stage(task_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Task).where(Task.id == task_id).options(*_subtask_loader())
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Get all stages for this task's type, ordered by position
    stages_result = await db.execute(
        select(Stage)
        .where(Stage.task_type_id == task.task_type_id)
        .order_by(Stage.position)
    )
    stages = stages_result.scalars().all()
    if not stages:
        raise HTTPException(status_code=400, detail="Task type has no stages")

    ids = [s.id for s in stages]
    try:
        current_idx = ids.index(task.current_stage_id)
    except ValueError:
        current_idx = -1

    next_idx = (current_idx + 1) % len(ids)
    task.current_stage_id = ids[next_idx]
    await db.commit()

    result = await db.execute(stmt)
    return result.scalar_one()
