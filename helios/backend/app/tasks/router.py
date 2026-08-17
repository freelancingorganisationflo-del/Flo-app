from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status as http_status
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import User
from .service import (
    complete_task,
    create_task,
    delete_task,
    ensure_utc,
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

    @field_validator("due_at", "reminder_at")
    @classmethod
    def _ensure_utc(cls, value):
        return ensure_utc(value)


class UpdateTaskRequest(BaseModel):
    title: str | None = None
    notes: str | None = None
    due_at: datetime | None = None
    priority: str | None = None
    status: str | None = None
    reminder_at: datetime | None = None
    recurrence: dict | None = None

    @field_validator("due_at", "reminder_at")
    @classmethod
    def _ensure_utc(cls, value):
        return ensure_utc(value)


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
