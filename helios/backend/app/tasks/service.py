from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Task, utcnow


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None or dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=timezone.utc)


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


_EDITABLE_FIELDS = {"title", "notes", "due_at", "priority", "status", "reminder_at", "recurrence"}


async def update_task(
    db: AsyncSession, user_id: int, task_id: int, **fields
) -> Task | None:
    task = await get_task(db, user_id, task_id)
    if task is None:
        return None
    for key, value in fields.items():
        if key in _EDITABLE_FIELDS:
            setattr(task, key, value)
    if "status" in fields:
        if fields["status"] == "done":
            task.completed_at = task.completed_at or utcnow()
        else:
            task.completed_at = None
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
