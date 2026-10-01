"""In-process automation poller (mirrors the task reminder worker)."""

import asyncio
import logging

from ..config import settings
from ..db import SessionLocal
from ..llm_gateway.client import LLMClient
from .service import run_due_automations

logger = logging.getLogger(__name__)


async def run_automation_worker(
    stop_event: asyncio.Event, interval: float | None = None
) -> None:
    interval = settings.automation_poll_seconds if interval is None else interval
    while not stop_event.is_set():
        try:
            async with SessionLocal() as db:
                await run_due_automations(db, LLMClient(task="automation"))
        except Exception:
            logger.exception("automation worker error")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
