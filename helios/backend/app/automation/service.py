"""Automation engine: scheduling, condition evaluation, persistence, runner."""

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..llm_gateway.client import LLMClient
from ..models import Automation, AutomationRun, Message, Task, utcnow
from .actions import ACTION_TYPES, execute_action

logger = logging.getLogger(__name__)

TRIGGER_TYPES = ("schedule",)
FREQUENCIES = ("interval", "hourly", "daily")

__all__ = ["ACTION_TYPES", "TRIGGER_TYPES", "FREQUENCIES"]


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# --------------------------------------------------------------------------- #
# Scheduling
# --------------------------------------------------------------------------- #


def compute_next_run(trigger_config: dict, now: datetime | None = None) -> datetime:
    """Return the next UTC run time for a schedule trigger config."""
    now = _aware(now) or utcnow()
    config = trigger_config or {}
    frequency = str(config.get("frequency") or "interval").strip().lower()

    if frequency == "hourly":
        return now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

    if frequency == "daily":
        raw_time = str(config.get("time") or "08:00")
        try:
            hour, minute = (int(part) for part in raw_time.split(":", 1))
        except (ValueError, TypeError):
            hour, minute = 8, 0
        tz = ZoneInfo(settings.default_timezone)
        local_now = now.astimezone(tz)
        candidate = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate <= local_now:
            candidate += timedelta(days=1)
        return candidate.astimezone(timezone.utc)

    minutes = config.get("minutes")
    try:
        minutes = int(minutes) if minutes is not None else 60
    except (ValueError, TypeError):
        minutes = 60
    minutes = max(1, minutes)
    return now + timedelta(minutes=minutes)


# --------------------------------------------------------------------------- #
# Conditions
# --------------------------------------------------------------------------- #


def evaluate_condition(condition: dict | None, context: dict) -> bool:
    """Evaluate a simple condition dict against the run context."""
    if not condition:
        return True
    ctype = str(condition.get("type") or "always_true").strip().lower()

    if ctype == "always_true":
        return True

    if ctype == "deadline_within_hours":
        try:
            hours = float(condition.get("value") or 24)
        except (ValueError, TypeError):
            hours = 24.0
        now = context["now"]
        horizon = now + timedelta(hours=hours)
        for task in context.get("tasks", []):
            due = _aware(task.get("due_at"))
            if due is not None and now <= due <= horizon:
                return True
        return False

    if ctype == "keyword_match":
        keyword = str(condition.get("value") or "").strip().lower()
        return bool(keyword) and keyword in str(context.get("text", "")).lower()

    logger.warning("unknown condition type %r; treating as always true", ctype)
    return True


async def build_context(
    db: AsyncSession, user_id: int, now: datetime
) -> dict:
    tasks = (
        (
            await db.execute(
                select(Task).where(
                    Task.user_id == user_id, Task.status == "pending"
                )
            )
        )
        .scalars()
        .all()
    )
    return {
        "now": now,
        "text": "",
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "priority": t.priority,
                "due_at": _aware(t.due_at),
            }
            for t in tasks
        ],
    }


# --------------------------------------------------------------------------- #
# CRUD
# --------------------------------------------------------------------------- #


async def create_automation(
    db: AsyncSession,
    user_id: int,
    name: str,
    trigger_type: str,
    trigger_config: dict,
    conditions: dict | None,
    action_type: str,
    action_config: dict | None,
    enabled: bool = True,
) -> Automation:
    now = utcnow()
    automation = Automation(
        user_id=user_id,
        name=name,
        trigger_type=trigger_type,
        trigger_config=trigger_config,
        conditions=conditions,
        action_type=action_type,
        action_config=action_config,
        enabled=enabled,
        next_run_at=compute_next_run(trigger_config, now) if enabled else None,
    )
    db.add(automation)
    await db.commit()
    await db.refresh(automation)
    return automation


async def list_automations(db: AsyncSession, user_id: int) -> list[Automation]:
    stmt = (
        select(Automation)
        .where(Automation.user_id == user_id)
        .order_by(Automation.id.desc())
    )
    return (await db.execute(stmt)).scalars().all()


async def get_automation(
    db: AsyncSession, user_id: int, automation_id: int
) -> Automation | None:
    automation = await db.get(Automation, automation_id)
    if automation is None or automation.user_id != user_id:
        return None
    return automation


_EDITABLE_FIELDS = {
    "name",
    "trigger_type",
    "trigger_config",
    "conditions",
    "action_type",
    "action_config",
    "enabled",
}


async def update_automation(
    db: AsyncSession, automation: Automation, **fields
) -> Automation:
    for key, value in fields.items():
        if key in _EDITABLE_FIELDS:
            setattr(automation, key, value)
    # Recompute the schedule whenever it or the enabled flag changes. Disabling
    # clears next_run_at so the worker stops picking it up.
    if "trigger_config" in fields or "enabled" in fields:
        if automation.enabled:
            automation.next_run_at = compute_next_run(automation.trigger_config, utcnow())
        else:
            automation.next_run_at = None
    await db.commit()
    await db.refresh(automation)
    return automation


async def delete_automation(db: AsyncSession, automation: Automation) -> None:
    await db.delete(automation)
    await db.commit()


async def list_runs(
    db: AsyncSession, user_id: int, automation_id: int, limit: int = 50
) -> list[AutomationRun]:
    stmt = (
        select(AutomationRun)
        .where(
            AutomationRun.user_id == user_id,
            AutomationRun.automation_id == automation_id,
        )
        .order_by(AutomationRun.id.desc())
        .limit(limit)
    )
    return (await db.execute(stmt)).scalars().all()


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #


async def run_automation(
    db: AsyncSession,
    automation: Automation,
    llm: LLMClient,
    now: datetime | None = None,
) -> AutomationRun:
    """Execute one automation and persist its run record."""
    now = _aware(now) or utcnow()
    status = "success"
    summary: str | None = None
    error: str | None = None

    try:
        context = await build_context(db, automation.user_id, now)
        if not evaluate_condition(automation.conditions, context):
            status = "skipped_condition"
            summary = "Condition not met"
        else:
            result = await execute_action(
                automation.action_type,
                automation.action_config or {},
                llm,
                now,
                context["tasks"],
            )
            if result:
                db.add(
                    Message(
                        user_id=automation.user_id,
                        role="assistant",
                        content=result,
                    )
                )
                summary = result[:500]
            else:
                summary = "Nothing to report"
    except Exception as exc:  # noqa: BLE001 - a failed run must not stop the worker
        status = "failed"
        error = str(exc)
        logger.exception("automation %s failed", automation.id)

    run = AutomationRun(
        automation_id=automation.id,
        user_id=automation.user_id,
        status=status,
        result_summary=summary,
        error=error,
        run_at=now,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


async def run_due_automations(
    db: AsyncSession, llm: LLMClient, now: datetime | None = None
) -> list[int]:
    """Run every enabled automation whose next_run_at has passed.

    Datetimes are compared in Python so SQLite (naive reads) and Postgres
    (aware reads) behave the same. ``next_run_at`` is advanced before the action
    runs, so an overlapping tick cannot execute the same run twice.
    """
    now = _aware(now) or utcnow()
    automations = (
        (
            await db.execute(
                select(Automation).where(Automation.enabled == True)  # noqa: E712
            )
        )
        .scalars()
        .all()
    )

    ran: list[int] = []
    for automation in automations:
        next_run = _aware(automation.next_run_at)
        if next_run is None:
            automation.next_run_at = compute_next_run(automation.trigger_config, now)
            await db.commit()
            continue
        if next_run > now:
            continue

        automation.next_run_at = compute_next_run(automation.trigger_config, now)
        automation.last_run_at = now
        await db.commit()

        await run_automation(db, automation, llm, now=now)
        ran.append(automation.id)
    return ran
