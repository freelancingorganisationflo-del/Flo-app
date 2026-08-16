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
