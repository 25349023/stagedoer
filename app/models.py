from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    tasks: Mapped[list["Task"]] = relationship(
        "Task",
        back_populates="category",
        cascade="all, delete-orphan",
        foreign_keys="Task.category_id",
    )


class TaskType(Base):
    __tablename__ = "task_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    stages: Mapped[list["Stage"]] = relationship(
        "Stage",
        back_populates="task_type",
        cascade="all, delete-orphan",
        order_by="Stage.position",
    )
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="task_type")


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_type_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("task_types.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    task_type: Mapped["TaskType"] = relationship("TaskType", back_populates="stages")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    task_type_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("task_types.id"), nullable=False
    )
    current_stage_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("stages.id"), nullable=True
    )
    parent_task_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    category: Mapped["Category"] = relationship(
        "Category", back_populates="tasks", foreign_keys=[category_id]
    )
    task_type: Mapped["TaskType"] = relationship("TaskType", back_populates="tasks")
    current_stage: Mapped[Optional["Stage"]] = relationship(
        "Stage", foreign_keys=[current_stage_id]
    )
    parent: Mapped[Optional["Task"]] = relationship(
        "Task",
        back_populates="subtasks",
        remote_side="Task.id",
        foreign_keys=[parent_task_id],
    )
    subtasks: Mapped[list["Task"]] = relationship(
        "Task",
        back_populates="parent",
        cascade="all, delete-orphan",
        foreign_keys=[parent_task_id],
        order_by="Task.position",
    )
