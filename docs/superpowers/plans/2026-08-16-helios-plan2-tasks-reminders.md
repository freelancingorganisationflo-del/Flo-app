# Helios — Plan 2: Tasks & Reminders

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Tasks & Reminders module (Module 3 of the design spec) to the Helios backend: a `tasks` table with CRUD + REST router, a recurrence engine, a crash-safe reminder worker that runs inside the app lifespan, and the five task tools (`create_task`, `list_tasks`, `complete_task`, `update_task`, `delete_task`) wired into the existing chat tool registry.

**Architecture:** Follows the Plan 1 modular-monolith pattern. `app/tasks/` holds the module: `service.py` (CRUD), `recurrence.py` (next-occurrence math, pure + unit-testable), `worker.py` (poll loop + single-pass fire logic), `router.py` (REST). The chat module stays untouched in code but its `build_registry` gains the five task tools and the `SYSTEM_PROMPT` is extended. The worker runs as an `asyncio` task started in the app lifespan and delivers fired reminders as `role="system"` messages in the user's existing `messages` stream (the chat-banner source; PWA push is a later frontend plan).

**Tech Stack:** Same as Plan 1 — Python 3.11, FastAPI, SQLAlchemy 2.0 async, pytest + pytest-asyncio. DB via `DATABASE_URL` (SQLite/aiosqlite dev+tests, Postgres/asyncpg production).

## Global Constraints

- **LLM keys:** Only `USER_LLM_API_KEY`, `USER_LLM_BASE_URL`, `USER_LLM_MODEL`, `USER_LLM_EMBEDDING_MODEL` are read, from env or `.env`. Never read, print, or hardcode Agent-runtime keys. `.env.example` holds placeholders only.
- **Database portability:** All SQLAlchemy models must work on both SQLite (aiosqlite) and Postgres (asyncpg). The `recurrence` column uses SQLAlchemy `JSON` (TEXT on SQLite, JSON on Postgres) — never query inside the JSON, only store/retrieve whole dicts. No Postgres-only SQL. Timezone comparisons happen in Python (fetch rows, filter in code), not in SQL, to avoid naive/aware mismatches on SQLite.
- **Additive schema only:** Plan 2 adds the `tasks` table; `users`, `messages`, `memories` are unchanged. `Chat + Memory` module code is untouched except for adding tools to `build_registry` and the prompt.
- **Tool-calling routing:** Tasks are exposed as LLM tools (`create_task`, `list_tasks`, `complete_task`, `update_task`, `delete_task`), never keyword-matched by the chat code.
- **Reminder worker is single-instance** (spec MVP): one app instance runs one worker. Multi-instance safety (DB lock / `FOR UPDATE SKIP LOCKED` / Celery) is out of scope and documented in the plan's self-review notes.
- **`recurrence` rule shape (spec):** `{"freq": "daily"|"weekly"|"monthly", "interval": 1, "by_day": [1,5], "time": "08:00"}`. `by_day` is 1-based for weekdays (1=Monday … 7=Sunday); for monthly it is the 1-based day-of-month. `time` is `"HH:MM"` treated as UTC in this plan (timezone support is a later plan).
- Python 3.11+; packages installed globally via `pip --break-system-packages`.
- No comments in code unless they explain "why".

---

### Task 1: `Task` model + config + service CRUD

**Files:**
- Modify: `backend/app/config.py` (add `reminder_poll_seconds`)
- Modify: `backend/app/models.py` (add `Task`)
- Create: `backend/app/tasks/__init__.py`
- Create: `backend/app/tasks/service.py`
- Test: `backend/tests/test_tasks.py`

**Interfaces:**
- Consumes: `app.db.Base`, `app.models.utcnow`, `app.config.settings`.
- Produces:
  - `app.config.settings.reminder_poll_seconds: float` (default `30.0`).
  - `app.models.Task` — columns: `id`, `user_id`, `title`, `notes`, `due_at`, `priority`, `status`, `created_at`, `reminder_at`, `recurrence` (JSON), `completed_at`, `reminded_at`, `updated_at`.
  - `app.tasks.service.create_task(db, user_id, title, notes=None, due_at=None, priority="medium", reminder_at=None, recurrence=None) -> Task`
  - `app.tasks.service.list_tasks(db, user_id, status=None) -> list[Task]`
  - `app.tasks.service.get_task(db, user_id, task_id) -> Task | None`
  - `app.tasks.service.update_task(db, user_id, task_id, **fields) -> Task | None`
  - `app.tasks.service.complete_task(db, user_id, task_id) -> Task | None`
  - `app.tasks.service.delete_task(db, user_id, task_id) -> bool`

- [ ] **Step 1: Add `reminder_poll_seconds` to `backend/app/config.py`**

Add after the `memory_top_k` line:

```python
    memory_top_k: int = 5

    reminder_poll_seconds: float = 30.0
```

- [ ] **Step 2: Add the `Task` model to `backend/app/models.py`**

Change the import line and append the model:

```python
from sqlalchemy import JSON, DateTime, String, Text
```

```python
class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(index=True)
    title: Mapped[str] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    status: Mapped[str] = mapped_column(String(10), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    reminder_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recurrence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
```

- [ ] **Step 3: Create `backend/app/tasks/__init__.py`**

```python
```

- [ ] **Step 4: Create `backend/app/tasks/service.py`**

```python
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Task, utcnow


async def create_task(
    db: AsyncSession,
    user_id: int,
    title: str,
    notes: str | None = None,
    due_at: datetime | None = None,
    priority: str = "medium",
    reminder_at: datetime | None = None,
    recurrence: dict | None = None,
) -> Task:
    task = Task(
        user_id=user_id,
        title=title,
        notes=notes,
        due_at=due_at,
        priority=priority,
        reminder_at=reminder_at,
        recurrence=recurrence,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def list_tasks(
    db: AsyncSession, user_id: int, status: str | None = None
) -> list[Task]:
    stmt = select(Task).where(Task.user_id == user_id)
    if status:
        stmt = stmt.where(Task.status == status)
    stmt = stmt.order_by(Task.id.desc())
    return (await db.execute(stmt)).scalars().all()


async def get_task(db: AsyncSession, user_id: int, task_id: int) -> Task | None:
    task = await db.get(Task, task_id)
    if task is None or task.user_id != user_id:
        return None
    return task


async def update_task(
    db: AsyncSession, user_id: int, task_id: int, **fields
) -> Task | None:
    task = await get_task(db, user_id, task_id)
    if task is None:
        return None
    for key, value in fields.items():
        setattr(task, key, value)
    await db.commit()
    await db.refresh(task)
    return task


async def complete_task(db: AsyncSession, user_id: int, task_id: int) -> Task | None:
    task = await get_task(db, user_id, task_id)
    if task is None:
        return None
    task.status = "done"
    task.completed_at = utcnow()
    await db.commit()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, user_id: int, task_id: int) -> bool:
    task = await get_task(db, user_id, task_id)
    if task is None:
        return False
    await db.delete(task)
    await db.commit()
    return True
```

- [ ] **Step 5: Create `backend/tests/test_tasks.py`** (service-level tests; router tests come in Task 3)

```python
from sqlalchemy import select

from app.models import Task
from app.tasks.service import (
    complete_task,
    create_task,
    delete_task,
    get_task,
    list_tasks,
    update_task,
)


async def test_create_and_get_task(db_session):
    task = await create_task(db_session, user_id=1, title="call Ravi", priority="high")
    assert task.id is not None
    assert task.status == "pending"
    fetched = await get_task(db_session, 1, task.id)
    assert fetched is not None
    assert fetched.title == "call Ravi"
    assert await get_task(db_session, 2, task.id) is None


async def test_list_filters_by_status(db_session):
    await create_task(db_session, 1, "one")
    done = await create_task(db_session, 1, "two")
    await complete_task(db_session, 1, done.id)
    await create_task(db_session, 2, "other user's task")

    all_tasks = await list_tasks(db_session, 1)
    assert len(all_tasks) == 2
    pending = await list_tasks(db_session, 1, status="pending")
    assert [t.title for t in pending] == ["one"]
    assert [t.title for t in await list_tasks(db_session, 2)] == ["other user's task"]


async def test_update_task(db_session):
    task = await create_task(db_session, 1, "buy milk")
    updated = await update_task(db_session, 1, task.id, title="buy oat milk", priority="low")
    assert updated is not None
    assert updated.title == "buy oat milk"
    assert updated.priority == "low"
    assert await update_task(db_session, 9, task.id, title="x") is None


async def test_complete_task(db_session):
    task = await create_task(db_session, 1, "water plants")
    done = await complete_task(db_session, 1, task.id)
    assert done is not None
    assert done.status == "done"
    assert done.completed_at is not None
    assert await complete_task(db_session, 9, task.id) is None


async def test_delete_task(db_session):
    task = await create_task(db_session, 1, "temp")
    assert await delete_task(db_session, 1, task.id) is True
    assert await delete_task(db_session, 1, task.id) is False
    rows = (await db_session.execute(select(Task))).scalars().all()
    assert len(rows) == 0
```

- [ ] **Step 6: Run the tests**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/test_tasks.py -v`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend
git commit -m "feat(tasks): add Task model and CRUD service"
```

---

### Task 2: Recurrence engine

**Files:**
- Create: `backend/app/tasks/recurrence.py`
- Test: `backend/tests/test_recurrence.py`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `app.tasks.recurrence.next_occurrence(recurrence: dict, after: datetime) -> datetime` — raises `ValueError` for an unsupported `freq`. `by_day` is 1-based (1=Monday … 7=Sunday); for `weekly` it picks weekdays, for `monthly` `by_day[0]` is the day-of-month. Result preserves `after.tzinfo` (UTC in production, naive in SQLite tests).

- [ ] **Step 1: Create `backend/app/tasks/recurrence.py`**

```python
import calendar
from datetime import datetime, time, timedelta

_WEEKDAYS = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6}


def next_occurrence(recurrence: dict, after: datetime) -> datetime:
    freq = recurrence.get("freq")
    if freq == "daily":
        return _next_daily(recurrence, after)
    if freq == "weekly":
        return _next_weekly(recurrence, after)
    if freq == "monthly":
        return _next_monthly(recurrence, after)
    raise ValueError(f"unsupported recurrence freq: {freq!r}")


def _next_daily(recurrence, after):
    when = _clock_time(recurrence)
    day = after.date() + timedelta(days=max(1, int(recurrence.get("interval", 1))))
    return datetime.combine(day, when, tzinfo=after.tzinfo)


def _next_weekly(recurrence, after):
    targets = {_WEEKDAYS[d] for d in _by_day(recurrence) if d in _WEEKDAYS}
    when = _clock_time(recurrence)
    today = after.date()
    if today.weekday() in targets and (after.hour, after.minute) < (when.hour, when.minute):
        return datetime.combine(today, when, tzinfo=after.tzinfo)
    day = today + timedelta(days=1)
    advanced = 1
    while day.weekday() not in targets:
        day += timedelta(days=1)
        advanced += 1
    interval = max(1, int(recurrence.get("interval", 1)))
    if (advanced - 1) // 7 % interval != 0:
        day += timedelta(days=7 * (interval - ((advanced - 1) // 7 % interval)))
    return datetime.combine(day, when, tzinfo=after.tzinfo)


def _next_monthly(recurrence, after):
    by_day = recurrence.get("by_day")
    day = max(1, min(31, int(by_day[0] if by_day else after.day)))
    interval = max(1, int(recurrence.get("interval", 1)))
    when = _clock_time(recurrence)
    year, month = _add_months(after.year, after.month, interval)
    for _ in range(interval * 2 + 1):
        last_day = calendar.monthrange(year, month)[1]
        candidate = datetime.combine(
            datetime(year, month, min(day, last_day)).date(), when, tzinfo=after.tzinfo
        )
        if candidate > after:
            return candidate
        year, month = _add_months(year, month, interval)
    raise ValueError("could not compute next monthly occurrence")


def _by_day(recurrence: dict) -> list[int]:
    return [int(d) for d in (recurrence.get("by_day") or [])]


def _clock_time(recurrence: dict) -> time:
    raw = recurrence.get("time", "00:00")
    hour, minute = 0, 0
    if isinstance(raw, str) and ":" in raw:
        parts = raw.split(":")
        hour = int(parts[0]) if parts[0].isdigit() else 0
        minute = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    return time(hour % 24, minute % 60)


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    total = year * 12 + (month - 1) + delta
    return total // 12, total % 12 + 1
```

- [ ] **Step 2: Create `backend/tests/test_recurrence.py`**

```python
from datetime import datetime

import pytest

from app.tasks.recurrence import next_occurrence


def test_daily_default_midnight():
    after = datetime(2026, 8, 16, 10, 0)
    assert next_occurrence({"freq": "daily"}, after) == datetime(2026, 8, 17, 0, 0)


def test_daily_with_time_and_interval():
    after = datetime(2026, 8, 16, 10, 0)
    rule = {"freq": "daily", "interval": 2, "time": "08:00"}
    assert next_occurrence(rule, after) == datetime(2026, 8, 18, 8, 0)


def test_weekly_skips_to_next_matching_day():
    after = datetime(2026, 8, 17, 9, 0)  # Monday
    rule = {"freq": "weekly", "by_day": [1], "time": "08:00"}
    assert next_occurrence(rule, after) == datetime(2026, 8, 24, 8, 0)


def test_weekly_same_day_before_time():
    after = datetime(2026, 8, 17, 7, 0)  # Monday, before 08:00
    rule = {"freq": "weekly", "by_day": [1], "time": "08:00"}
    assert next_occurrence(rule, after) == datetime(2026, 8, 17, 8, 0)


def test_weekly_multiple_days_picks_nearest():
    after = datetime(2026, 8, 19, 12, 0)  # Wednesday
    rule = {"freq": "weekly", "by_day": [1, 5], "time": "00:00"}
    assert next_occurrence(rule, after) == datetime(2026, 8, 21, 0, 0)  # Friday


def test_monthly():
    after = datetime(2026, 8, 16, 12, 0)
    rule = {"freq": "monthly", "by_day": [1], "time": "09:00"}
    assert next_occurrence(rule, after) == datetime(2026, 9, 1, 9, 0)


def test_monthly_clamps_short_months():
    after = datetime(2026, 1, 31, 12, 0)
    rule = {"freq": "monthly", "by_day": [31], "time": "00:00"}
    assert next_occurrence(rule, after) == datetime(2026, 2, 28, 0, 0)


def test_unsupported_freq_raises():
    with pytest.raises(ValueError):
        next_occurrence({"freq": "yearly"}, datetime(2026, 1, 1))
```

- [ ] **Step 3: Run the tests**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/test_recurrence.py -v`
Expected: 8 passed.

- [ ] **Step 4: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend
git commit -m "feat(tasks): add recurrence engine"
```

---

### Task 3: Tasks REST router

**Files:**
- Create: `backend/app/tasks/router.py`
- Modify: `backend/app/main.py` (include tasks router)
- Test: `backend/tests/test_tasks_router.py`

**Interfaces:**
- Consumes: `app.db.get_db`, `app.deps.get_current_user`, `app.models.User`, `app.tasks.service.*`.
- Produces: Router `app.tasks.router` with `POST /api/tasks` (201), `GET /api/tasks` (optional `?status=`), `GET /api/tasks/{id}` (404 when missing/not owned), `PATCH /api/tasks/{id}` (partial update), `POST /api/tasks/{id}/complete`, `DELETE /api/tasks/{id}` (204, 404).

- [ ] **Step 1: Create `backend/app/tasks/router.py`**

```python
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status as http_status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import User
from .service import (
    complete_task,
    create_task,
    delete_task,
    get_task,
    list_tasks,
    update_task,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class CreateTaskRequest(BaseModel):
    title: str
    notes: str | None = None
    due_at: datetime | None = None
    priority: str = "medium"
    reminder_at: datetime | None = None
    recurrence: dict | None = None


class UpdateTaskRequest(BaseModel):
    title: str | None = None
    notes: str | None = None
    due_at: datetime | None = None
    priority: str | None = None
    status: str | None = None
    reminder_at: datetime | None = None
    recurrence: dict | None = None


def _to_dict(task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "notes": task.notes,
        "due_at": task.due_at.isoformat() if task.due_at else None,
        "priority": task.priority,
        "status": task.status,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "reminder_at": task.reminder_at.isoformat() if task.reminder_at else None,
        "recurrence": task.recurrence,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "reminded_at": task.reminded_at.isoformat() if task.reminded_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


@router.post("", status_code=http_status.HTTP_201_CREATED)
async def create(
    req: CreateTaskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    task = await create_task(
        db, user.id, req.title, req.notes, req.due_at, req.priority, req.reminder_at, req.recurrence
    )
    return _to_dict(task)


@router.get("")
async def list_all(
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    tasks = await list_tasks(db, user.id, status)
    return [_to_dict(t) for t in tasks]


@router.get("/{task_id}")
async def read_one(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    task = await get_task(db, user.id, task_id)
    if task is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Task not found")
    return _to_dict(task)


@router.patch("/{task_id}")
async def patch(
    task_id: int,
    req: UpdateTaskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    fields = req.model_dump(exclude_unset=True)
    task = await update_task(db, user.id, task_id, **fields)
    if task is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Task not found")
    return _to_dict(task)


@router.post("/{task_id}/complete")
async def mark_complete(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    task = await complete_task(db, user.id, task_id)
    if task is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Task not found")
    return _to_dict(task)


@router.delete("/{task_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def remove(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not await delete_task(db, user.id, task_id):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Task not found")
```

- [ ] **Step 2: Update `backend/app/main.py`**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .auth.router import router as auth_router
from .chat.router import router as chat_router
from .db import Base, engine
from .memory.router import router as memory_router
from .tasks.router import router as tasks_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Helios", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(memory_router)
app.include_router(chat_router)
app.include_router(tasks_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 3: Create `backend/tests/test_tasks_router.py`**

```python
import pytest_asyncio


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "t@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


async def test_router_crud_lifecycle(authed_client):
    client, headers = authed_client
    resp = await client.post(
        "/api/tasks",
        json={"title": "buy milk", "priority": "high", "reminder_at": "2026-08-17T08:00:00"},
        headers=headers,
    )
    assert resp.status_code == 201
    task_id = resp.json()["id"]
    assert resp.json()["reminder_at"] == "2026-08-17T08:00:00"

    resp = await client.get("/api/tasks", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "buy milk"

    resp = await client.get(f"/api/tasks/{task_id}", headers=headers)
    assert resp.status_code == 200

    resp = await client.patch(f"/api/tasks/{task_id}", json={"priority": "low"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["priority"] == "low"

    resp = await client.post(f"/api/tasks/{task_id}/complete", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"

    resp = await client.get("/api/tasks", params={"status": "done"}, headers=headers)
    assert len(resp.json()) == 1
    resp = await client.get("/api/tasks", params={"status": "pending"}, headers=headers)
    assert len(resp.json()) == 0

    resp = await client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert resp.status_code == 204
    resp = await client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert resp.status_code == 404


async def test_router_ownership(authed_client):
    client, headers = authed_client
    created = await client.post("/api/tasks", json={"title": "mine"}, headers=headers)
    task_id = created.json()["id"]

    resp = await client.post("/api/auth/signup", json={"email": "other@h.com", "password": "secret123"})
    other_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    assert (await client.get(f"/api/tasks/{task_id}", headers=other_headers)).status_code == 404
    assert (await client.delete(f"/api/tasks/{task_id}", headers=other_headers)).status_code == 404
    listed = await client.get("/api/tasks", headers=other_headers)
    assert len(listed.json()) == 0


async def test_router_requires_auth(client):
    assert (await client.get("/api/tasks")).status_code == 401
```

- [ ] **Step 4: Run the tests**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/test_tasks_router.py -v`
Expected: 3 passed.

- [ ] **Step 5: Run the full suite so far**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/ -v`
Expected: all pass (33 existing + tasks 5 + recurrence 8 + tasks_router 3 = 49).

- [ ] **Step 6: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend
git commit -m "feat(tasks): add tasks REST router"
```

---

### Task 4: Reminder worker + lifespan wiring

**Files:**
- Create: `backend/app/tasks/worker.py`
- Modify: `backend/app/main.py` (start/stop worker in lifespan)
- Test: `backend/tests/test_worker.py`

**Interfaces:**
- Consumes: `app.config.settings.reminder_poll_seconds`, `app.db.SessionLocal`, `app.models.{Message, Task}`, `app.tasks.recurrence.next_occurrence`.
- Produces:
  - `app.tasks.worker.fire_due_reminders(db: AsyncSession, now=None) -> list[int]` — one pass: finds due tasks (`reminder_at <= now`, `status = "pending"`, not already reminded), writes a `role="system"` `Message` (`content=f"Reminder: {title}"`) into the user's stream, sets `reminded_at = now`, and for recurring tasks advances `reminder_at` to `next_occurrence(recurrence, now)`. Returns fired task ids.
  - `app.tasks.worker.run_reminder_worker(stop_event: asyncio.Event, interval: float | None = None)` — loop that calls `fire_due_reminders` every `interval` seconds (default `settings.reminder_poll_seconds`) until `stop_event` is set; uses its own session from `SessionLocal`; logs and continues on per-pass errors.
  - `app.main.lifespan` — starts the worker task on startup, stops and awaits it on shutdown.

- [ ] **Step 1: Create `backend/app/tasks/worker.py`**

```python
import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import SessionLocal
from ..models import Message, Task
from .recurrence import next_occurrence

logger = logging.getLogger(__name__)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _is_due(task: Task, now: datetime) -> bool:
    reminder = _aware(task.reminder_at)
    reminded = _aware(task.reminded_at)
    if reminder is None or task.status != "pending":
        return False
    if reminded is not None and reminder <= reminded:
        return False
    return reminder <= now


async def fire_due_reminders(db: AsyncSession, now: datetime | None = None) -> list[int]:
    now = now or datetime.now(timezone.utc)
    # Fetch-and-filter in Python keeps datetime comparisons working on both
    # SQLite (naive reads) and Postgres (aware reads) without SQL-side tz issues.
    tasks = (await db.execute(select(Task))).scalars().all()
    fired: list[int] = []
    for task in tasks:
        if not _is_due(task, now):
            continue
        db.add(
            Message(user_id=task.user_id, role="system", content=f"Reminder: {task.title}")
        )
        task.reminded_at = now
        if task.recurrence:
            task.reminder_at = next_occurrence(task.recurrence, now)
        fired.append(task.id)
    if fired:
        await db.commit()
    return fired


async def run_reminder_worker(
    stop_event: asyncio.Event, interval: float | None = None
) -> None:
    interval = interval or settings.reminder_poll_seconds
    while not stop_event.is_set():
        try:
            async with SessionLocal() as db:
                await fire_due_reminders(db)
        except Exception:
            logger.exception("reminder worker error")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
```

- [ ] **Step 2: Update `backend/app/main.py` to start/stop the worker**

```python
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .auth.router import router as auth_router
from .chat.router import router as chat_router
from .db import Base, engine
from .memory.router import router as memory_router
from .tasks.router import router as tasks_router
from .tasks.worker import run_reminder_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    stop_event = asyncio.Event()
    worker_task = asyncio.create_task(run_reminder_worker(stop_event))
    yield
    stop_event.set()
    await worker_task


app = FastAPI(title="Helios", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(memory_router)
app.include_router(chat_router)
app.include_router(tasks_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 3: Create `backend/tests/test_worker.py`**

```python
import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import Message
from app.tasks.recurrence import next_occurrence
from app.tasks.service import create_task
from app.tasks.worker import fire_due_reminders, run_reminder_worker


def _now() -> datetime:
    return datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc)


async def test_fire_one_time_reminder(db_session):
    now = _now()
    task = await create_task(
        db_session, 1, "water plants", reminder_at=now - timedelta(minutes=5)
    )
    fired = await fire_due_reminders(db_session, now)
    assert fired == [task.id]

    rows = (await db_session.execute(select(Message))).scalars().all()
    assert len(rows) == 1
    assert rows[0].role == "system"
    assert rows[0].content == "Reminder: water plants"

    again = await fire_due_reminders(db_session, now + timedelta(minutes=1))
    assert again == []


async def test_fire_recurring_reminder_advances(db_session):
    now = _now()
    rule = {"freq": "weekly", "by_day": [1], "time": "08:00"}
    task = await create_task(
        db_session, 1, "standup", reminder_at=now - timedelta(hours=1), recurrence=rule
    )
    fired = await fire_due_reminders(db_session, now)
    assert fired == [task.id]
    expected = next_occurrence(rule, now)
    assert _aware_dt(task.reminder_at) == expected


async def test_missed_reminder_fires_after_restart(db_session):
    now = _now()
    task = await create_task(db_session, 1, "missed", reminder_at=now - timedelta(days=2))
    assert await fire_due_reminders(db_session, now) == [task.id]
    assert task.reminded_at is not None


async def test_non_pending_task_not_fired(db_session):
    now = _now()
    task = await create_task(db_session, 1, "cancelled", reminder_at=now - timedelta(minutes=1))
    task.status = "cancelled"
    await db_session.commit()
    assert await fire_due_reminders(db_session, now) == []


async def test_worker_loop_stops_cleanly():
    stop_event = asyncio.Event()
    stop_event.set()
    await run_reminder_worker(stop_event, interval=0.01)


def _aware_dt(dt):
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt
```

- [ ] **Step 4: Run the tests**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/test_worker.py -v`
Expected: 5 passed.

- [ ] **Step 5: Run the full suite**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/ -v`
Expected: 54 passed (49 + 5).

- [ ] **Step 6: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend
git commit -m "feat(tasks): add reminder worker with lifespan wiring"
```

---

### Task 5: Task tools in the chat registry + prompt

**Files:**
- Modify: `backend/app/chat/service.py` (imports, `SYSTEM_PROMPT`, `build_registry` task tools, `_parse_dt` helper)
- Test: `backend/tests/test_chat_tasks.py`

**Interfaces:**
- Consumes: `app.tasks.service.{create_task, list_tasks, complete_task, update_task, delete_task}`, `app.models.Task`.
- Produces:
  - `app.chat.service.SYSTEM_PROMPT` — extended to describe the task tools and to instruct the assistant to confirm parsed task details before calling `create_task`.
  - `app.chat.service.build_registry(db, user_id, llm)` — now also registers `create_task`, `list_tasks`, `complete_task`, `update_task`, `delete_task`.
  - `app.chat.service._parse_dt(value: str | None) -> datetime | None` — `datetime.fromisoformat` wrapper returning `None` on bad input.

- [ ] **Step 1: Update imports and add `_parse_dt` in `backend/app/chat/service.py`**

At the top of the file, change the imports to:

```python
import asyncio
import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..llm_gateway.client import LLMClient
from ..llm_gateway.tools import Tool, ToolRegistry
from ..memory.service import add_memory, search_memories
from ..models import Message, User
from ..tasks.service import (
    complete_task as complete_task_service,
    create_task as create_task_service,
    delete_task as delete_task_service,
    list_tasks as list_tasks_service,
    update_task as update_task_service,
)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None
```

- [ ] **Step 2: Update `SYSTEM_PROMPT`**

Replace the current `SYSTEM_PROMPT` with:

```python
SYSTEM_PROMPT = (
    "You are Helios, a personal AI assistant. Be warm, concise, and helpful.\n\n"
    "You have tools to look up stored facts about the user and save new facts "
    "to long-term memory. Use them whenever relevant:\n"
    "- search_memory: call when the user asks about something they told you "
    "before, or when recalling a stored fact would help answer.\n"
    "- save_memory: call when the user shares a personal fact, preference, or "
    "detail worth remembering for future conversations.\n\n"
    "You also manage the user's tasks and reminders:\n"
    "- create_task: parse the title, due date, and recurrence from the user's "
    "request. ALWAYS confirm the parsed details with the user before calling "
    "this tool.\n"
    "- list_tasks: call when the user asks what tasks or reminders are pending "
    "or what's on their plate.\n"
    "- complete_task: call when the user says they finished a task.\n"
    "- update_task: call to change a task's details.\n"
    "- delete_task: call to remove a task.\n\n"
    "When you use a tool, keep your final answer short and natural."
)
```

- [ ] **Step 3: Register the task tools in `build_registry`**

Inside `build_registry`, after the existing `save_memory_handler` definition, add these handlers:

```python
    async def create_task_handler(
        title: str,
        notes: str | None = None,
        due_at: str | None = None,
        priority: str = "medium",
        reminder_at: str | None = None,
        recurrence: dict | None = None,
    ) -> str:
        task = await create_task_service(
            db,
            user_id,
            title,
            notes=notes,
            due_at=_parse_dt(due_at),
            priority=priority,
            reminder_at=_parse_dt(reminder_at),
            recurrence=recurrence,
        )
        return json.dumps({"created": True, "id": task.id, "title": task.title})

    async def list_tasks_handler(task_status: str | None = None) -> str:
        tasks = await list_tasks_service(db, user_id, task_status)
        return json.dumps(
            [
                {
                    "id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "due_at": t.due_at.isoformat() if t.due_at else None,
                    "reminder_at": t.reminder_at.isoformat() if t.reminder_at else None,
                }
                for t in tasks
            ]
        )

    async def complete_task_handler(task_id: int) -> str:
        task = await complete_task_service(db, user_id, task_id)
        if task is None:
            return json.dumps({"completed": False, "error": "task not found"})
        return json.dumps({"completed": True, "id": task.id})

    async def update_task_handler(
        task_id: int,
        title: str | None = None,
        notes: str | None = None,
        due_at: str | None = None,
        priority: str | None = None,
        task_status: str | None = None,
        reminder_at: str | None = None,
        recurrence: dict | None = None,
    ) -> str:
        fields: dict = {}
        if title is not None:
            fields["title"] = title
        if notes is not None:
            fields["notes"] = notes
        if due_at is not None:
            fields["due_at"] = _parse_dt(due_at)
        if priority is not None:
            fields["priority"] = priority
        if task_status is not None:
            fields["status"] = task_status
        if reminder_at is not None:
            fields["reminder_at"] = _parse_dt(reminder_at)
        if recurrence is not None:
            fields["recurrence"] = recurrence
        task = await update_task_service(db, user_id, task_id, **fields)
        if task is None:
            return json.dumps({"updated": False, "error": "task not found"})
        return json.dumps({"updated": True, "id": task.id, "title": task.title})

    async def delete_task_handler(task_id: int) -> str:
        deleted = await delete_task_service(db, user_id, task_id)
        return json.dumps({"deleted": deleted, "id": task_id})
```

Then, at the end of `build_registry` (after the `save_memory` registration, before `return registry`), add the five registrations:

```python
    registry.register(
        Tool(
            name="create_task",
            description="Create a task or reminder for the user.",
            parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "The task title"},
                    "notes": {"type": "string", "description": "Optional details"},
                    "due_at": {"type": "string", "description": "ISO 8601 due datetime"},
                    "priority": {"enum": ["high", "medium", "low"]},
                    "reminder_at": {"type": "string", "description": "ISO 8601 reminder datetime"},
                    "recurrence": {
                        "type": "object",
                        "description": 'e.g. {"freq": "weekly", "by_day": [1], "time": "08:00"}',
                    },
                },
                "required": ["title"],
            },
            handler=create_task_handler,
        )
    )
    registry.register(
        Tool(
            name="list_tasks",
            description="List the user's tasks.",
            parameters={
                "type": "object",
                "properties": {
                    "task_status": {
                        "type": "string",
                        "enum": ["pending", "done", "cancelled"],
                        "description": "Filter by status",
                    }
                },
            },
            handler=list_tasks_handler,
        )
    )
    registry.register(
        Tool(
            name="complete_task",
            description="Mark a task as done.",
            parameters={
                "type": "object",
                "properties": {"task_id": {"type": "integer"}},
                "required": ["task_id"],
            },
            handler=complete_task_handler,
        )
    )
    registry.register(
        Tool(
            name="update_task",
            description="Update a task's details.",
            parameters={
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "title": {"type": "string"},
                    "notes": {"type": "string"},
                    "due_at": {"type": "string"},
                    "priority": {"enum": ["high", "medium", "low"]},
                    "task_status": {"enum": ["pending", "done", "cancelled"]},
                    "reminder_at": {"type": "string"},
                    "recurrence": {"type": "object"},
                },
                "required": ["task_id"],
            },
            handler=update_task_handler,
        )
    )
    registry.register(
        Tool(
            name="delete_task",
            description="Delete a task.",
            parameters={
                "type": "object",
                "properties": {"task_id": {"type": "integer"}},
                "required": ["task_id"],
            },
            handler=delete_task_handler,
        )
    )
```

- [ ] **Step 4: Create `backend/tests/test_chat_tasks.py`**

```python
import pytest_asyncio
from sqlalchemy import select

from app.deps import get_llm
from app.llm_gateway.client import ChatResult, LLMClient, ToolCall
from app.main import app
from app.models import Task


class TaskLLM(LLMClient):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[list[dict]] = []
        self.schemas: list[list[dict]] = []

    async def complete(self, messages, tools=None):
        self.calls.append(messages)
        if tools:
            self.schemas.append(tools)
        last = messages[-1]
        if last["role"] == "user" and "create a task" in last["content"].lower():
            return ChatResult(
                content=None,
                tool_calls=[
                    ToolCall(
                        id="call_t",
                        name="create_task",
                        arguments='{"title": "call Ravi", "priority": "high", "reminder_at": "2026-08-17T08:00:00"}',
                    )
                ],
                assistant_message={
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_t",
                            "type": "function",
                            "function": {
                                "name": "create_task",
                                "arguments": '{"title": "call Ravi", "priority": "high", "reminder_at": "2026-08-17T08:00:00"}',
                            },
                        }
                    ],
                },
            )
        if last["role"] == "tool":
            return ChatResult(
                content="Created the task for you.",
                tool_calls=[],
                assistant_message={"role": "assistant", "content": "Created the task for you."},
            )
        return ChatResult(
            content=f"Echo: {last['content']}",
            tool_calls=[],
            assistant_message={"role": "assistant", "content": f"Echo: {last['content']}"},
        )

    async def embed(self, text):
        return [1.0, 0.0]


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "ct@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest_asyncio.fixture
async def task_llm(client):
    fake = TaskLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


async def test_chat_creates_task_via_tool(authed_client, task_llm, db_session):
    client, headers = authed_client
    resp = await client.post(
        "/api/chat", json={"message": "create a task"}, headers=headers
    )
    assert resp.status_code == 200
    assert any(e["name"] == "create_task" for e in resp.json()["tool_events"])
    tasks = (await db_session.execute(select(Task))).scalars().all()
    assert len(tasks) == 1
    assert tasks[0].title == "call Ravi"
    assert tasks[0].priority == "high"


async def test_chat_registry_exposes_all_task_tools(authed_client, task_llm):
    client, headers = authed_client
    assert task_llm.schemas == []
    await client.post("/api/chat", json={"message": "hi"}, headers=headers)
    schema = task_llm.schemas[0]
    names = [t["function"]["name"] for t in schema]
    assert names[-5:] == ["create_task", "list_tasks", "complete_task", "update_task", "delete_task"]
```

- [ ] **Step 5: Run the new tests**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/test_chat_tasks.py -v`
Expected: 2 passed.

- [ ] **Step 6: Run the full suite**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/ -v`
Expected: 56 passed, no warnings.

- [ ] **Step 7: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend
git commit -m "feat(chat): expose task tools in the chat tool registry"
```

---

### Task 6: Update README + final integration check

**Files:**
- Modify: `backend/README.md` (endpoint list)
- Test: full suite

**Interfaces:**
- Consumes: everything from Tasks 1-5.

- [ ] **Step 1: Update `backend/README.md`**

Add the tasks endpoints after the chat endpoints:

```markdown
- `POST   /api/tasks` — create a task/reminder (201)
- `GET    /api/tasks` — list tasks (optional `?status=pending|done|cancelled`)
- `GET    /api/tasks/{id}` — get one task
- `PATCH  /api/tasks/{id}` — partially update a task
- `POST   /api/tasks/{id}/complete` — mark a task done
- `DELETE /api/tasks/{id}` — delete a task (204)
```

And update the Plan 1 reference line near the top to mention Tasks:

```markdown
Backend (Plans 1-2): FastAPI + SQLAlchemy async + JWT auth + LLM Gateway +
Chat + Memory + Tasks & Reminders. Frontend (PWA) and RAG / Voice modules
come in later plans.
```

- [ ] **Step 2: Run the full suite**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/ -v`
Expected: 56 passed, zero warnings.

- [ ] **Step 3: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend/README.md
git commit -m "docs: document tasks API in backend README"
```

---

## Self-Review Notes

- **Spec coverage:** `tasks` table fields (title, notes, due_at, priority, status, created_at, reminder_at, recurrence, completed_at, reminded_at, updated_at) — Task 1. Reminder worker poll + fire + recurring advance + crash-safe reminded flag + single-instance lifespan task — Task 4. Natural-language routing via the five LLM tools, with prompt-level "confirm before create" — Task 5. REST CRUD — Task 3. Recurrence shapes from the spec examples (`{"freq":"weekly","by_day":[1],"time":"08:00"}`) — Task 2. Compatibility (Chat+Memory untouched; additive schema) — all tasks. Reminder delivery as a system message in the `messages` stream gives the chat UI its banner source; PWA push + daily summary remain frontend-only (out of scope, noted).
- **Deviations / decisions to flag in review:**
  - `recurrence` is stored as SQLAlchemy `JSON` (TEXT on SQLite, native JSON on Postgres) rather than Postgres-only `JSONB` — required for DB portability; no queries inside the JSON.
  - "Confirm before saving" is enforced at the prompt level (SYSTEM_PROMPT instructs the assistant to confirm parsed details before calling `create_task`), not via a hard two-phase protocol — keeps the single-round tool loop intact.
  - `time` values in recurrence rules are treated as UTC in this plan; user-local timezone support is deferred.
  - Worker is single-instance (spec MVP). `FOR UPDATE SKIP LOCKED` / external scheduler is required before running >1 instance (documented in spec).
  - Reminder worker fetches all rows and filters in Python to sidestep SQLite naive-vs-aware datetime comparisons; acceptable at MVP scale.
- **Placeholder scan:** every step carries complete code and exact commands; no TBDs.
- **Type consistency:** tool handler params use `task_status` (not `status`) to avoid shadowing `fastapi.status`; router query param is `status` with `http_status` alias. `update_task` service accepts `**fields` keyed by model attribute names, which match the router's pydantic field names (`status`) and the tool handler's mapped names (`status` via `task_status`). All cross-task signatures match.
