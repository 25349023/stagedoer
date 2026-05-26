"""
StageDoer — WASM Demo Backend

Runs entirely in the browser via Pyodide (Python WebAssembly).
Data lives in an in-memory SQLite database — private per tab, wiped on close.

Design notes
============
* Synchronous SQLAlchemy + built-in sqlite3 are used intentionally.
  aiosqlite internally spawns a thread, which is not supported in the
  standard (non-pthreads) Pyodide build.
* All FastAPI route handlers are declared ``async`` so that Starlette
  dispatches them directly in the event loop rather than offloading to a
  thread pool (anyio.to_thread.run_sync).
* Calling synchronous SQLAlchemy code inside an async function briefly
  blocks the event loop; this is acceptable in a single-user browser demo.
* The browser bridge uses a lightweight custom async ASGI caller instead of
  starlette.testclient.TestClient, which also relies on threads.
"""

import os
import json as _json
from datetime import datetime
from typing import List, Optional

# ---------------------------------------------------------------------------
# WASM-mode detection
# ---------------------------------------------------------------------------
WASM_MODE = os.environ.get("WASM_MODE") == "1"

# ---------------------------------------------------------------------------
# Synchronous SQLAlchemy — works with Pyodide's built-in sqlite3 (no threads)
# ---------------------------------------------------------------------------
from sqlalchemy import (                         # noqa: E402
    Column, DateTime, ForeignKey, Integer, String,
    create_engine, func,
    select as sa_select,
)
from sqlalchemy.orm import DeclarativeBase, relationship, selectinload, sessionmaker

DATABASE_URL = (
    "sqlite:///:memory:"
    if WASM_MODE
    else "sqlite:///./stagedoer_demo.db"
)

# check_same_thread=False is required for SQLite when accessed from a
# single Python thread that is *not* the thread that created the connection.
# In Pyodide there is only one thread, so this is safe.
_engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)
_Session = sessionmaker(bind=_engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# ORM models (mirrors the production app's schema)
# ---------------------------------------------------------------------------

class Category(Base):
    __tablename__ = "categories"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(120), nullable=False)
    position   = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    tasks = relationship(
        "Task",
        back_populates="category",
        cascade="all, delete-orphan",
        foreign_keys="[Task.category_id]",
    )


class TaskType(Base):
    __tablename__ = "task_types"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    stages = relationship(
        "Stage",
        back_populates="task_type",
        cascade="all, delete-orphan",
        order_by="Stage.position",
    )
    tasks = relationship("Task", back_populates="task_type")


class Stage(Base):
    __tablename__ = "stages"

    id           = Column(Integer, primary_key=True, index=True)
    task_type_id = Column(
        Integer, ForeignKey("task_types.id", ondelete="CASCADE"), nullable=False
    )
    name       = Column(String(120), nullable=False)
    position   = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    task_type = relationship("TaskType", back_populates="stages")


class Task(Base):
    __tablename__ = "tasks"

    id               = Column(Integer, primary_key=True, index=True)
    title            = Column(String(500), nullable=False)
    category_id      = Column(Integer, ForeignKey("categories.id",  ondelete="CASCADE"), nullable=False)
    task_type_id     = Column(Integer, ForeignKey("task_types.id"),  nullable=False)
    current_stage_id = Column(Integer, ForeignKey("stages.id"),      nullable=True)
    parent_task_id   = Column(Integer, ForeignKey("tasks.id",        ondelete="CASCADE"), nullable=True)
    position         = Column(Integer, default=0)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category      = relationship("Category", back_populates="tasks", foreign_keys=[category_id])
    task_type     = relationship("TaskType", back_populates="tasks")
    current_stage = relationship("Stage", foreign_keys=[current_stage_id])

    # Self-referential: remote_side points to the id Column object defined above.
    parent = relationship(
        "Task",
        back_populates="subtasks",
        remote_side=id,                  # id is the Column object, not the int value
        foreign_keys=[parent_task_id],
    )
    subtasks = relationship(
        "Task",
        back_populates="parent",
        cascade="all, delete-orphan",
        foreign_keys=[parent_task_id],
        order_by="Task.position",
    )


# ---------------------------------------------------------------------------
# Pydantic schemas — compatible with both pydantic v1 and v2
# ---------------------------------------------------------------------------
import pydantic as _pydantic
_V2 = int(_pydantic.VERSION.split(".")[0]) >= 2

from pydantic import BaseModel                   # noqa: E402


# Base class that enables ORM-mode serialisation regardless of pydantic version
if _V2:
    class _OrmBase(BaseModel):
        model_config = {"from_attributes": True}

    def _from_orm(cls, obj):
        return cls.model_validate(obj)

    def _rebuild(cls):
        cls.model_rebuild()
else:
    class _OrmBase(BaseModel):
        class Config:
            orm_mode = True

    def _from_orm(cls, obj):
        return cls.from_orm(obj)

    def _rebuild(cls):
        cls.update_forward_refs()


class StageOut(_OrmBase):
    id:           int
    task_type_id: int
    name:         str
    position:     int
    created_at:   datetime


class CategoryCreate(BaseModel):
    name: str


class CategoryOut(_OrmBase):
    id:         int
    name:       str
    position:   int
    created_at: datetime


class TaskTypeOut(_OrmBase):
    id:         int
    name:       str
    stages:     List[StageOut] = []
    created_at: datetime


class TaskCreate(BaseModel):
    title:          str
    category_id:    int
    task_type_id:   int
    parent_task_id: Optional[int] = None



class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None

class TaskTypeCreate(BaseModel):
    name: str
    stages: List[str] = []

class TaskTypeUpdate(BaseModel):
    name: str

class StageUpdate(BaseModel):
    id: Optional[int] = None
    name: str
    position: int

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    current_stage_id: Optional[int] = None
    task_type_id: Optional[int] = None
    position: Optional[int] = None

class TaskOut(_OrmBase):
    id:               int
    title:            str
    category_id:      int
    task_type_id:     int
    current_stage_id: Optional[int]   = None
    parent_task_id:   Optional[int]   = None
    position:         int
    created_at:       datetime
    updated_at:       datetime
    current_stage:    Optional[StageOut] = None
    subtasks:         List["TaskOut"]    = []


# Forward-ref resolution (self-referential subtasks)
_rebuild(TaskOut)


# ---------------------------------------------------------------------------
# Demo seed data
# ---------------------------------------------------------------------------

def _seed() -> None:
    """Populate the in-memory database with sample tasks on first run."""
    with _Session() as db:
        if db.execute(sa_select(Category).limit(1)).scalar_one_or_none():
            return  # already seeded

        cat1 = Category(name="Work",     position=0)
        cat2 = Category(name="Personal", position=1000)
        cat3 = Category(name="Learning", position=2000)
        db.add_all([cat1, cat2, cat3])
        db.flush()

        tt1 = TaskType(name="Simple")
        tt2 = TaskType(name="Project")
        db.add_all([tt1, tt2])
        db.flush()

        # Stages for "Simple" workflow
        s_todo = Stage(task_type_id=tt1.id, name="Todo",        position=0)
        s_prog = Stage(task_type_id=tt1.id, name="In Progress", position=1)
        s_done = Stage(task_type_id=tt1.id, name="Done",        position=2)
        # Stages for "Project" workflow
        p_back = Stage(task_type_id=tt2.id, name="Backlog", position=0)
        p_dev  = Stage(task_type_id=tt2.id, name="In Dev",  position=1)
        p_rev  = Stage(task_type_id=tt2.id, name="Review",  position=2)
        p_done = Stage(task_type_id=tt2.id, name="Done",    position=3)
        db.add_all([s_todo, s_prog, s_done, p_back, p_dev, p_rev, p_done])
        db.flush()

        db.add_all([
            Task(title="Set up CI/CD pipeline",       category_id=cat1.id, task_type_id=tt1.id, current_stage_id=s_done.id, position=0),
            Task(title="Write API documentation",     category_id=cat1.id, task_type_id=tt2.id, current_stage_id=p_rev.id,  position=1000),
            Task(title="Fix authentication bug",      category_id=cat1.id, task_type_id=tt1.id, current_stage_id=s_prog.id, position=2000),
            Task(title="Buy groceries",               category_id=cat2.id, task_type_id=tt1.id, current_stage_id=s_todo.id, position=0),
            Task(title="Schedule dentist appointment",category_id=cat2.id, task_type_id=tt1.id, current_stage_id=s_todo.id, position=1000),
            Task(title="Read 'Clean Code'",           category_id=cat3.id, task_type_id=tt1.id, current_stage_id=s_prog.id, position=0),
            Task(title="Complete Pyodide tutorial",   category_id=cat3.id, task_type_id=tt2.id, current_stage_id=p_dev.id,  position=1000),
        ])
        db.commit()


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
from fastapi import FastAPI, HTTPException, Query      # noqa: E402

app = FastAPI(title="StageDoer Demo", redirect_slashes=False)


def _task_opts():
    """Eager-load options that prevent DetachedInstanceError after session close."""
    return [
        selectinload(Task.current_stage),
        selectinload(Task.subtasks).selectinload(Task.current_stage),
    ]


# ── Categories ──────────────────────────────────────────────────────────────

@app.get("/api/categories/", response_model=List[CategoryOut])
async def list_categories():
    with _Session() as db:
        rows = db.execute(sa_select(Category).order_by(Category.position)).scalars().all()
        return [_from_orm(CategoryOut, r) for r in rows]


@app.post("/api/categories/", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryCreate):
    with _Session() as db:
        max_pos = db.scalar(sa_select(func.max(Category.position))) or 0
        cat = Category(name=body.name, position=max_pos + 2000)
        db.add(cat)
        db.commit()
        db.refresh(cat)
        return _from_orm(CategoryOut, cat)


@app.delete("/api/categories/{cat_id}", status_code=204)
async def delete_category(cat_id: int):
    with _Session() as db:
        cat = db.get(Category, cat_id)
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")
        db.delete(cat)
        db.commit()


# ── Task types ──────────────────────────────────────────────────────────────

@app.get("/api/task-types/", response_model=List[TaskTypeOut])
async def list_task_types():
    with _Session() as db:
        rows = db.execute(
            sa_select(TaskType)
            .options(selectinload(TaskType.stages))
            .order_by(TaskType.id)
        ).scalars().all()
        return [_from_orm(TaskTypeOut, r) for r in rows]



@app.put("/api/categories/{cat_id}", response_model=CategoryOut)
async def update_category(cat_id: int, body: CategoryUpdate):
    with _Session() as db:
        cat = db.get(Category, cat_id)
        if not cat: raise HTTPException(status_code=404)
        if body.name is not None: cat.name = body.name
        if body.position is not None: cat.position = body.position
        db.commit()
        db.refresh(cat)
        return _from_orm(CategoryOut, cat)


@app.post("/api/task-types/", response_model=TaskTypeOut, status_code=201)
async def create_task_type(body: TaskTypeCreate):
    with _Session() as db:
        tt = TaskType(name=body.name)
        db.add(tt)
        db.flush()
        for i, s_name in enumerate(body.stages):
            db.add(Stage(task_type_id=tt.id, name=s_name, position=i))
        db.commit()
        row = db.execute(sa_select(TaskType).where(TaskType.id == tt.id).options(selectinload(TaskType.stages))).scalar_one()
        return _from_orm(TaskTypeOut, row)


@app.put("/api/task-types/{type_id}", response_model=TaskTypeOut)
async def update_task_type(type_id: int, body: TaskTypeUpdate):
    with _Session() as db:
        tt = db.get(TaskType, type_id)
        if not tt: raise HTTPException(status_code=404)
        tt.name = body.name
        db.commit()
        row = db.execute(sa_select(TaskType).where(TaskType.id == type_id).options(selectinload(TaskType.stages))).scalar_one()
        return _from_orm(TaskTypeOut, row)


@app.put("/api/task-types/{type_id}/stages", response_model=TaskTypeOut)
async def update_task_type_stages(type_id: int, body: List[StageUpdate]):
    with _Session() as db:
        tt = db.get(TaskType, type_id)
        if not tt: raise HTTPException(status_code=404)
        
        # Remove old stages
        db.execute(Stage.__table__.delete().where(Stage.task_type_id == type_id))
        db.flush()
        
        # Add new stages
        for s in body:
            db.add(Stage(task_type_id=type_id, name=s.name, position=s.position))
            
        db.commit()
        row = db.execute(sa_select(TaskType).where(TaskType.id == type_id).options(selectinload(TaskType.stages))).scalar_one()
        return _from_orm(TaskTypeOut, row)


@app.delete("/api/task-types/{type_id}", status_code=204)
async def delete_task_type(type_id: int):
    with _Session() as db:
        tt = db.get(TaskType, type_id)
        if not tt: raise HTTPException(status_code=404)
        db.delete(tt)
        db.commit()


@app.put("/api/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: int, body: TaskUpdate):
    with _Session() as db:
        task = db.get(Task, task_id)
        if not task: raise HTTPException(status_code=404)
        
        if body.title is not None: task.title = body.title
        if body.current_stage_id is not None: task.current_stage_id = body.current_stage_id
        if body.task_type_id is not None: task.task_type_id = body.task_type_id
        if body.position is not None: task.position = body.position
        
        db.commit()
        row = db.execute(sa_select(Task).where(Task.id == task_id).options(*_task_opts())).scalar_one()
        return _from_orm(TaskOut, row)


# ── Tasks ───────────────────────────────────────────────────────────────────

@app.get("/api/tasks/", response_model=List[TaskOut])
async def list_tasks(category_id: int = Query(...)):
    with _Session() as db:
        stmt = (
            sa_select(Task)
            .where(Task.category_id == category_id, Task.parent_task_id.is_(None))
            .order_by(Task.position)
            .options(*_task_opts())
        )
        rows = db.execute(stmt).scalars().all()
        return [_from_orm(TaskOut, r) for r in rows]


@app.post("/api/tasks/", response_model=TaskOut, status_code=201)
async def create_task(body: TaskCreate):
    with _Session() as db:
        first_stage = db.scalar(
            sa_select(Stage)
            .where(Stage.task_type_id == body.task_type_id)
            .order_by(Stage.position)
            .limit(1)
        )
        max_pos = db.scalar(
            sa_select(func.max(Task.position)).where(
                Task.category_id == body.category_id,
                Task.parent_task_id == body.parent_task_id,
            )
        ) or 0
        task = Task(
            title=body.title,
            category_id=body.category_id,
            task_type_id=body.task_type_id,
            current_stage_id=first_stage.id if first_stage else None,
            parent_task_id=body.parent_task_id,
            position=max_pos + 2000,
        )
        db.add(task)
        db.commit()
        row = db.execute(
            sa_select(Task).where(Task.id == task.id).options(*_task_opts())
        ).scalar_one()
        return _from_orm(TaskOut, row)


@app.delete("/api/tasks/{task_id}", status_code=204)
async def delete_task(task_id: int):
    with _Session() as db:
        task = db.get(Task, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        db.delete(task)
        db.commit()


@app.post("/api/tasks/{task_id}/advance-stage", response_model=TaskOut)
async def advance_stage(task_id: int):
    with _Session() as db:
        task = db.execute(sa_select(Task).where(Task.id == task_id)).scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        stages = db.execute(
            sa_select(Stage)
            .where(Stage.task_type_id == task.task_type_id)
            .order_by(Stage.position)
        ).scalars().all()

        if not stages:
            raise HTTPException(status_code=400, detail="Task type has no stages")

        ids = [s.id for s in stages]
        try:
            idx = ids.index(task.current_stage_id)
        except ValueError:
            idx = -1

        task.current_stage_id = ids[(idx + 1) % len(ids)]
        db.commit()

        row = db.execute(
            sa_select(Task).where(Task.id == task_id).options(*_task_opts())
        ).scalar_one()
        return _from_orm(TaskOut, row)


# ---------------------------------------------------------------------------
# Initialise (create tables + seed) — called via top-level await
# ---------------------------------------------------------------------------

async def _init() -> None:
    """Create schema and seed demo data. Safe to call multiple times."""
    Base.metadata.create_all(_engine)
    _seed()


# ---------------------------------------------------------------------------
# Browser bridge — async ASGI caller (thread-free, Pyodide-compatible)
#
# Uses a hand-rolled minimal ASGI test-client so that no OS threads are
# needed (starlette.testclient.TestClient uses anyio.to_thread under the hood,
# which requires real threads).  The SPEC's "provided the function is achieved"
# clause covers this deviation from TestClient.
# ---------------------------------------------------------------------------

async def handle_browser_request(
    method: str,
    path: str,
    json_body_str: Optional[str] = None,
) -> str:
    """
    Callable from JavaScript via ``await pyodide.runPythonAsync(...)``.

    Dispatches a synthetic HTTP request directly to the FastAPI ASGI
    application without any OS threads.

    Returns a JSON string: ``{"status": <int>, "data": <any>}``

    Security: path and method are trusted internal values set by the
    JavaScript wrapper, not raw user input; they are validated by FastAPI's
    router. The body is deserialized by Pydantic inside FastAPI.
    """
    from urllib.parse import urlparse

    method    = method.upper()
    body_dict = _json.loads(json_body_str) if json_body_str else None

    parsed    = urlparse(path)
    url_path  = parsed.path
    query_str = parsed.query.encode() if parsed.query else b""

    body_bytes: bytes = _json.dumps(body_dict).encode() if body_dict is not None else b""

    req_headers: list = []
    if body_bytes:
        req_headers = [
            (b"content-type",   b"application/json"),
            (b"content-length", str(len(body_bytes)).encode()),
        ]

    scope = {
        "type":         "http",
        "asgi":         {"version": "3.0"},
        "http_version": "1.1",
        "method":       method,
        "headers":      req_headers,
        "path":         url_path,
        "query_string": query_str,
        "root_path":    "",
        "scheme":       "http",
        "server":       ("test", 80),
    }

    status_code: int = 500
    resp_body:   bytes = b""
    _done = False

    async def receive() -> dict:
        nonlocal _done
        if not _done:
            _done = True
            return {"type": "http.request", "body": body_bytes, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message: dict) -> None:
        nonlocal status_code, resp_body
        if message["type"] == "http.response.start":
            status_code = message["status"]
        elif message["type"] == "http.response.body":
            resp_body += message.get("body", b"")

    try:
        await app(scope, receive, send)
        try:
            data = _json.loads(resp_body) if resp_body else None
        except Exception:
            data = resp_body.decode(errors="replace")
    except Exception as exc:
        # Generic error — do not expose internal stack traces to the UI
        return _json.dumps({"status": 500, "data": {"detail": "Internal server error"}})

    return _json.dumps({"status": status_code, "data": data}, default=str)


# ---------------------------------------------------------------------------
# Top-level await — pyodide.runPythonAsync() supports this natively
# ---------------------------------------------------------------------------
await _init()
