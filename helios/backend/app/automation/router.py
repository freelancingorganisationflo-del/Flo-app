from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_automation_llm, get_current_user
from ..llm_gateway.client import LLMClient
from ..models import Automation, AutomationRun, User, utcnow
from .actions import ACTION_TYPES
from .service import (
    TRIGGER_TYPES,
    create_automation,
    delete_automation,
    get_automation,
    list_automations,
    list_runs,
    run_automation,
    update_automation,
)

router = APIRouter(prefix="/api/automations", tags=["automations"])


class CreateAutomationRequest(BaseModel):
    name: str
    trigger_type: str = "schedule"
    trigger_config: dict = {}
    conditions: dict | None = None
    action_type: str
    action_config: dict | None = None
    enabled: bool = True

    @field_validator("trigger_type")
    @classmethod
    def _valid_trigger(cls, value: str) -> str:
        if value not in TRIGGER_TYPES:
            raise ValueError(f"trigger_type must be one of {TRIGGER_TYPES}")
        return value

    @field_validator("action_type")
    @classmethod
    def _valid_action(cls, value: str) -> str:
        if value not in ACTION_TYPES:
            raise ValueError(f"action_type must be one of {ACTION_TYPES}")
        return value


class UpdateAutomationRequest(BaseModel):
    name: str | None = None
    trigger_type: str | None = None
    trigger_config: dict | None = None
    conditions: dict | None = None
    action_type: str | None = None
    action_config: dict | None = None
    enabled: bool | None = None

    @field_validator("trigger_type")
    @classmethod
    def _valid_trigger(cls, value: str | None) -> str | None:
        if value is not None and value not in TRIGGER_TYPES:
            raise ValueError(f"trigger_type must be one of {TRIGGER_TYPES}")
        return value

    @field_validator("action_type")
    @classmethod
    def _valid_action(cls, value: str | None) -> str | None:
        if value is not None and value not in ACTION_TYPES:
            raise ValueError(f"action_type must be one of {ACTION_TYPES}")
        return value


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _automation_out(automation: Automation) -> dict:
    return {
        "id": automation.id,
        "name": automation.name,
        "trigger_type": automation.trigger_type,
        "trigger_config": automation.trigger_config or {},
        "conditions": automation.conditions,
        "action_type": automation.action_type,
        "action_config": automation.action_config or {},
        "enabled": automation.enabled,
        "last_run_at": _iso(automation.last_run_at),
        "next_run_at": _iso(automation.next_run_at),
        "created_at": _iso(automation.created_at),
        "updated_at": _iso(automation.updated_at),
    }


def _run_out(run: AutomationRun) -> dict:
    return {
        "id": run.id,
        "automation_id": run.automation_id,
        "status": run.status,
        "result_summary": run.result_summary,
        "error": run.error,
        "run_at": _iso(run.run_at),
    }


async def _owned(
    db: AsyncSession, user: User, automation_id: int
) -> Automation:
    automation = await get_automation(db, user.id, automation_id)
    if automation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")
    return automation


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(
    req: CreateAutomationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    automation = await create_automation(
        db,
        user.id,
        req.name,
        req.trigger_type,
        req.trigger_config,
        req.conditions,
        req.action_type,
        req.action_config,
        req.enabled,
    )
    return _automation_out(automation)


@router.get("")
async def list_all(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return [_automation_out(a) for a in await list_automations(db, user.id)]


@router.get("/{automation_id}")
async def read_one(
    automation_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    automation = await _owned(db, user, automation_id)
    return _automation_out(automation)


@router.patch("/{automation_id}")
async def patch(
    automation_id: int,
    req: UpdateAutomationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    automation = await _owned(db, user, automation_id)
    updated = await update_automation(
        db, automation, **req.model_dump(exclude_unset=True)
    )
    return _automation_out(updated)


@router.delete("/{automation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(
    automation_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    automation = await _owned(db, user, automation_id)
    await delete_automation(db, automation)


@router.post("/{automation_id}/run")
async def run_now(
    automation_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_automation_llm),
) -> dict:
    automation = await _owned(db, user, automation_id)
    automation.last_run_at = utcnow()
    run = await run_automation(db, automation, llm)
    return _run_out(run)


@router.get("/{automation_id}/runs")
async def run_history(
    automation_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await _owned(db, user, automation_id)
    return [_run_out(r) for r in await list_runs(db, user.id, automation_id)]
