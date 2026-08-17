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
        if task.recurrence:
            try:
                task.reminder_at = next_occurrence(task.recurrence, now)
            except (ValueError, TypeError):
                logger.warning(
                    "skipping task %s: malformed recurrence %r", task.id, task.recurrence
                )
                continue
        db.add(
            Message(user_id=task.user_id, role="system", content=f"Reminder: {task.title}")
        )
        task.reminded_at = now
        fired.append(task.id)
    if fired:
        await db.commit()
    return fired


async def run_reminder_worker(
    stop_event: asyncio.Event, interval: float | None = None
) -> None:
    interval = settings.reminder_poll_seconds if interval is None else interval
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
