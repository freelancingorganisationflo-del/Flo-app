"""Automation actions — thin adapters that reuse existing modules.

Actions never re-implement capabilities. They read from the Tasks store and
reuse the Web Search pipeline / LLM client, then return a markdown string that
gets inserted into the chat timeline.
"""

import logging
from datetime import datetime, timedelta

from ..llm_gateway.client import LLMClient
from ..search.pipeline import answer_from_evidence, gather_evidence
from ..search.service import fetch_page, search_web

logger = logging.getLogger(__name__)


def _title_list(tasks: list[dict], limit: int = 5) -> str:
    shown = ", ".join(t["title"] for t in tasks[:limit])
    if len(tasks) > limit:
        shown += f" (+{len(tasks) - limit} more)"
    return shown


async def _deadline_briefing(
    tasks: list[dict], config: dict, now: datetime
) -> str:
    hours = float(config.get("within_hours") or 24)
    horizon = now + timedelta(hours=hours)
    overdue = [t for t in tasks if t["due_at"] and t["due_at"] < now]
    due = [
        t
        for t in tasks
        if t["due_at"] and now <= t["due_at"] <= horizon
    ]
    if not overdue and not due:
        return ""

    lines = ["**Deadline check**"]
    if overdue:
        lines.append(f"{len(overdue)} overdue: {_title_list(overdue)}")
    if due:
        lines.append(f"{len(due)} due within {int(hours)}h: {_title_list(due)}")
    return "\n".join(lines)


async def _morning_briefing(
    tasks: list[dict], config: dict, now: datetime
) -> str:
    if not tasks:
        return ""

    overdue = [t for t in tasks if t["due_at"] and t["due_at"] < now]
    lines = ["**Morning briefing**", f"You have {len(tasks)} pending task(s)."]
    if overdue:
        lines.append(f"{len(overdue)} overdue: {_title_list(overdue)}")

    upcoming = sorted(
        (t for t in tasks if t["due_at"]), key=lambda t: t["due_at"]
    )[:5]
    if upcoming:
        lines.append("Upcoming:")
        lines.extend(
            f"- {t['title']} (due {t['due_at'].isoformat()})" for t in upcoming
        )
    return "\n".join(lines)


async def _news_monitor(config: dict, llm: LLMClient) -> str:
    topic = str(config.get("topic") or "technology news").strip()
    max_items = int(config.get("max_items") or 5)
    query = f"latest news about {topic}"
    research = await gather_evidence(
        query, llm, search_fn=search_web, fetch_fn=fetch_page
    )
    if not research["searched"]:
        return ""
    answer = await answer_from_evidence(query, research["evidence"], llm)
    sources = (research.get("sources") or [])[:max_items]
    links = "\n".join(f"- [{s['title']}]({s['url']})" for s in sources)
    out = f"**News briefing: {topic}**\n{answer.strip()}"
    if links:
        out += f"\n\nSources:\n{links}"
    return out


ACTION_TYPES = ("deadline_briefing", "morning_briefing", "news_monitor")


async def execute_action(
    action_type: str,
    action_config: dict,
    llm: LLMClient,
    now: datetime,
    tasks: list[dict],
) -> str:
    """Run one action and return its markdown result (empty = nothing to say)."""
    if action_type == "deadline_briefing":
        return await _deadline_briefing(tasks, action_config, now)
    if action_type == "morning_briefing":
        return await _morning_briefing(tasks, action_config, now)
    if action_type == "news_monitor":
        return await _news_monitor(action_config, llm)
    raise ValueError(f"Unknown action_type: {action_type}")
