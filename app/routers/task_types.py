from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import TaskType, Stage, Task
from app.schemas import TaskTypeCreate, TaskTypeUpdate, TaskTypeOut, StageIn

router = APIRouter(prefix="/api/task-types", tags=["task_types"])


def _with_stages(stmt):
    return stmt.options(selectinload(TaskType.stages))


@router.get("/", response_model=list[TaskTypeOut])
async def list_task_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(_with_stages(select(TaskType).order_by(TaskType.id)))
    return result.scalars().all()


@router.post("/", response_model=TaskTypeOut, status_code=201)
async def create_task_type(body: TaskTypeCreate, db: AsyncSession = Depends(get_db)):
    tt = TaskType(name=body.name)
    db.add(tt)
    await db.flush()  # get tt.id before adding stages
    for idx, stage_name in enumerate(body.stages):
        db.add(Stage(task_type_id=tt.id, name=stage_name, position=idx))
    await db.commit()
    result = await db.execute(_with_stages(select(TaskType).where(TaskType.id == tt.id)))
    return result.scalar_one()


@router.put("/{tt_id}", response_model=TaskTypeOut)
async def update_task_type(
    tt_id: int, body: TaskTypeUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(_with_stages(select(TaskType).where(TaskType.id == tt_id)))
    tt = result.scalar_one_or_none()
    if not tt:
        raise HTTPException(status_code=404, detail="Task type not found")
    if body.name is not None:
        tt.name = body.name
    await db.commit()
    await db.refresh(tt)
    result = await db.execute(_with_stages(select(TaskType).where(TaskType.id == tt_id)))
    return result.scalar_one()


@router.delete("/{tt_id}", status_code=204)
async def delete_task_type(tt_id: int, db: AsyncSession = Depends(get_db)):
    # Blocked if any task still references this type
    in_use = await db.scalar(select(Task).where(Task.task_type_id == tt_id).limit(1))
    if in_use:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete task type while tasks reference it",
        )
    tt = await db.get(TaskType, tt_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Task type not found")
    await db.delete(tt)
    await db.commit()


@router.put("/{tt_id}/stages", response_model=TaskTypeOut)
async def upsert_stages(
    tt_id: int, body: list[StageIn], db: AsyncSession = Depends(get_db)
):
    result = await db.execute(_with_stages(select(TaskType).where(TaskType.id == tt_id)))
    tt = result.scalar_one_or_none()
    if not tt:
        raise HTTPException(status_code=404, detail="Task type not found")

    incoming_ids = {s.id for s in body if s.id is not None}
    existing_map = {s.id: s for s in tt.stages}

    # Delete stages not present in payload
    for stage_id, stage in list(existing_map.items()):
        if stage_id not in incoming_ids:
            await db.delete(stage)

    # Update or insert
    for s in body:
        if s.id and s.id in existing_map:
            existing_map[s.id].name = s.name
            existing_map[s.id].position = s.position
        else:
            db.add(Stage(task_type_id=tt_id, name=s.name, position=s.position))

    await db.commit()
    result = await db.execute(_with_stages(select(TaskType).where(TaskType.id == tt_id).execution_options(populate_existing=True)))
    return result.scalar_one()
