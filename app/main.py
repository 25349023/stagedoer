import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.database import engine, AsyncSessionLocal, Base
from app.models import Category, TaskType, Stage
from app.routers import categories, task_types, tasks


# ---------------------------------------------------------------------------
# Lifespan: create tables + seed
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed initial data if empty
    async with AsyncSessionLocal() as db:
        cat_count = await db.scalar(select(Category).limit(1))
        if not cat_count:
            db.add(Category(name="General", position=0))
            await db.flush()

        tt_count = await db.scalar(select(TaskType).limit(1))
        if not tt_count:
            tt = TaskType(name="Simple")
            db.add(tt)
            await db.flush()
            db.add(Stage(task_type_id=tt.id, name="Todo", position=0))
            db.add(Stage(task_type_id=tt.id, name="Done", position=1))

        await db.commit()

    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="StageDoer", lifespan=lifespan, redirect_slashes=False)


# ---------------------------------------------------------------------------
# Token middleware — protects all /api/* routes
# ---------------------------------------------------------------------------

@app.middleware("http")
async def token_auth_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        expected = os.environ.get("STAGEDOER_TOKEN", "")
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.removeprefix("Bearer ").strip()
        if not expected or token != expected:
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized: invalid or missing token"},
            )
    return await call_next(request)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(categories.router)
app.include_router(task_types.router)
app.include_router(tasks.router)

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def index():
    return FileResponse("static/index.html")
