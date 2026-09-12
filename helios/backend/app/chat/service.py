import asyncio
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..llm_gateway.client import LLMClient, LLMProviderError
from ..llm_gateway.tools import Tool, ToolRegistry
from ..memory.service import add_memory, search_memories
from ..models import Message, User
from ..rag.service import search_documents as search_documents_service
from ..search.decision import decide_web_search
from ..search.pipeline import gather_evidence
from ..search.service import SearchError, fetch_page, search_web
from ..tasks.service import (
    complete_task as complete_task_service,
    create_task as create_task_service,
    delete_task as delete_task_service,
    ensure_utc,
    list_tasks as list_tasks_service,
    update_task as update_task_service,
)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return ensure_utc(datetime.fromisoformat(value))
    except ValueError:
        return None


OUT_OF_STEPS_MESSAGE = (
    "I ran out of steps trying to help with that. Please try rephrasing."
)

# Extra guidance appended when the reply will be spoken aloud by the voice
# assistant: short, natural sentences, no symbols/emoji, and matching the
# user's language (Hinglish or English).
SPOKEN_RULES = (
    "\n\nVoice mode: reply as if speaking aloud to the user.\n"
    "- Keep it SHORT: 1-3 sentences, at most two short sentences for simple asks.\n"
    "- Speak in the same language the user used: Hinglish (Roman Hindi mixed with "
    "English) if the user writes Hinglish or Hindi, otherwise plain English.\n"
    "- Never use emojis, markdown, bullet points, headers, code, or URLs.\n"
    "- Say times, dates and numbers as a person would in conversation "
    "(for example '8 in the morning', not '08:00').\n"
    "- For task lists, name at most three tasks in a flowing sentence.\n"
)

def should_web_search(message: str) -> bool:
    """Backwards-compatible wrapper around the search decision engine (auto)."""
    return decide_web_search(message, "auto")


def _system_prompt() -> str:
    now = datetime.now(timezone.utc)
    clock = now.strftime("%A, %d %B %Y, %H:%M UTC")
    return (
        "You are Helios, a personal AI assistant. Be warm, concise, and accurate.\n"
        f"Current date and time: {clock}.\n\n"
        "ANSWER RULES (follow strictly):\n"
        "1. For any factual claim about the world (people, dates, events, prices, "
        "news, statistics), use ONLY the live evidence provided in a 'LIVE SOURCES' "
        "block or returned by the web_search / fetch_url tools in this conversation. "
        "Never rely on your own memory for these.\n"
        "2. Quote dates, numbers, and names exactly as they appear in the sources. "
        "Do not round, shift, or invent them.\n"
        "3. If the sources do not contain the answer, or are thin or conflicting, "
        "say clearly that you could not verify it from live sources. Do NOT guess.\n"
        "4. Cite 2-4 sources as markdown links at the end of factual answers.\n\n"
        "Tools:\n"
        "- web_search: focused query for current events, news, or facts.\n"
        "- fetch_url: after web_search, read the 1-2 most relevant pages.\n"
        "- current_datetime: the real current date/time. Use for 'what time/date is "
        "it' or a specific timezone; never guess the time.\n"
        "- search_memory / save_memory: personal facts about the user.\n"
        "- search_documents: the user's private knowledge base only.\n"
        "- create_task / list_tasks / complete_task / update_task / delete_task: "
        "tasks and reminders. Confirm details before creating a task.\n\n"
        "When you use a tool, keep the final answer short and natural."
    )


SYSTEM_PROMPT = _system_prompt()


def build_registry(db: AsyncSession, user_id: int, llm: LLMClient) -> ToolRegistry:
    registry = ToolRegistry()

    async def search_memory_handler(query: str) -> str:
        embedding = await llm.embed(query)
        memories = await search_memories(db, user_id, embedding)
        if not memories:
            return json.dumps({"found": False, "memories": []})
        return json.dumps({"found": True, "memories": [{"content": m.content} for m in memories]})

    async def save_memory_handler(content: str) -> str:
        embedding = await llm.embed(content)
        mem = await add_memory(db, user_id, content, embedding)
        return json.dumps({"saved": True, "id": mem.id})

    async def search_documents_handler(query: str) -> str:
        embedding = await llm.embed(query)
        results = await search_documents_service(db, user_id, embedding)
        if not results:
            return json.dumps({"found": False, "results": []})
        return json.dumps({"found": True, "results": results})

    async def web_search_handler(query: str) -> str:
        try:
            results = await search_web(query)
        except SearchError as exc:
            return json.dumps({"found": False, "error": str(exc), "results": []})
        if not results:
            return json.dumps({"found": False, "results": []})
        return json.dumps({"found": True, "results": results})

    async def fetch_url_handler(url: str) -> str:
        try:
            page = await fetch_page(url)
        except SearchError as exc:
            return json.dumps({"ok": False, "error": str(exc)})
        return json.dumps({"ok": True, **page})

    async def current_datetime_handler(timezone_name: str | None = None) -> str:
        tz = timezone.utc
        label = "UTC"
        if timezone_name:
            try:
                tz = ZoneInfo(timezone_name)
                label = timezone_name
            except Exception:
                tz = timezone.utc
                label = "UTC"
        now = datetime.now(tz)
        return json.dumps(
            {
                "iso": now.isoformat(),
                "human": now.strftime("%A, %d %B %Y, %I:%M %p %Z"),
                "timezone": label,
                "utc_offset": now.strftime("%z"),
            }
        )

    async def create_task_handler(
        title: str,
        notes: str | None = None,
        due_at: str | None = None,
        priority: str = "medium",
        reminder_at: str | None = None,
        recurrence: dict | None = None,
    ) -> str:
        due_at_dt = _parse_dt(due_at) if due_at is not None else None
        if due_at is not None and due_at_dt is None:
            return json.dumps({"created": False, "error": f"invalid due_at: {due_at!r}"})
        reminder_at_dt = _parse_dt(reminder_at) if reminder_at is not None else None
        if reminder_at is not None and reminder_at_dt is None:
            return json.dumps({"created": False, "error": f"invalid reminder_at: {reminder_at!r}"})
        task = await create_task_service(
            db,
            user_id,
            title,
            notes=notes,
            due_at=due_at_dt,
            priority=priority,
            reminder_at=reminder_at_dt,
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
        if due_at is not None:
            due_at_dt = _parse_dt(due_at)
            if due_at_dt is None:
                return json.dumps({"updated": False, "error": f"invalid due_at: {due_at!r}"})
            fields["due_at"] = due_at_dt
        if reminder_at is not None:
            reminder_at_dt = _parse_dt(reminder_at)
            if reminder_at_dt is None:
                return json.dumps(
                    {"updated": False, "error": f"invalid reminder_at: {reminder_at!r}"}
                )
            fields["reminder_at"] = reminder_at_dt
        if title is not None:
            fields["title"] = title
        if notes is not None:
            fields["notes"] = notes
        if priority is not None:
            fields["priority"] = priority
        if task_status is not None:
            fields["status"] = task_status
        if recurrence is not None:
            fields["recurrence"] = recurrence
        task = await update_task_service(db, user_id, task_id, **fields)
        if task is None:
            return json.dumps({"updated": False, "error": "task not found"})
        return json.dumps({"updated": True, "id": task.id, "title": task.title})

    async def delete_task_handler(task_id: int) -> str:
        deleted = await delete_task_service(db, user_id, task_id)
        if not deleted:
            return json.dumps({"deleted": False, "error": "task not found", "id": task_id})
        return json.dumps({"deleted": True, "id": task_id})

    registry.register(
        Tool(
            name="search_memory",
            description="Search stored facts about the user.",
            parameters={
                "type": "object",
                "properties": {"query": {"type": "string", "description": "The fact to look up"}},
                "required": ["query"],
            },
            handler=search_memory_handler,
        )
    )
    registry.register(
        Tool(
            name="save_memory",
            description="Save a personal fact about the user for future reference.",
            parameters={
                "type": "object",
                "properties": {"content": {"type": "string", "description": "The fact to remember"}},
                "required": ["content"],
            },
            handler=save_memory_handler,
        )
    )
    registry.register(
        Tool(
            name="search_documents",
            description="Search the user's saved documents and knowledge base.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The topic to search for"}
                },
                "required": ["query"],
            },
            handler=search_documents_handler,
        )
    )
    registry.register(
        Tool(
            name="web_search",
            description="Search the live public web. Always use for news, current events, facts you are unsure of, or anything not already covered by search results in this conversation.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query"}
                },
                "required": ["query"],
            },
            handler=web_search_handler,
        )
    )
    registry.register(
        Tool(
            name="fetch_url",
            description="Read a public web page and extract its text. After web_search, fetch the 1-2 best URLs before answering.",
            parameters={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The http(s) URL to fetch"}
                },
                "required": ["url"],
            },
            handler=fetch_url_handler,
        )
    )
    registry.register(
        Tool(
            name="current_datetime",
            description=(
                "Get the real current date and time. Use for any question about the "
                "current time or date, optionally for an IANA timezone such as "
                "'Asia/Kolkata' or 'America/New_York'. Never guess the time."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "timezone_name": {
                        "type": "string",
                        "description": "IANA timezone, e.g. 'Asia/Kolkata'. Defaults to UTC.",
                    }
                },
                "required": [],
            },
            handler=current_datetime_handler,
        )
    )
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
    return registry


async def recent_history(db: AsyncSession, user_id: int, limit: int = 20) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(Message)
                .where(Message.user_id == user_id)
                .order_by(Message.id.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    rows.reverse()
    return [
        {"role": m.role, "content": m.content}
        for m in rows
        if m.role in ("user", "assistant")
    ]


async def _run_tool_loop(
    db: AsyncSession,
    user_id: int,
    messages: list[dict],
    registry: ToolRegistry,
    llm: LLMClient,
    model: str | None = None,
) -> tuple[str, list[dict], str | None]:
    iterations = settings.llm_max_tool_iterations
    tool_events: list[dict] = []
    final: str | None = None
    used_model = model

    for _ in range(iterations):
        try:
            result = await llm.complete(
                messages,
                tools=registry.schema(),
                **({"model": used_model} if used_model else {}),
            )
        except LLMProviderError:
            if used_model is None:
                raise
            used_model = None
            result = await llm.complete(messages, tools=registry.schema())
        if result.tool_calls:
            if result.assistant_message:
                messages.append(result.assistant_message)
            for call in result.tool_calls:
                tool_events.append({"name": call.name, "arguments": call.arguments})
                output = await registry.execute(call.name, call.arguments)
                messages.append({"role": "tool", "tool_call_id": call.id, "content": output})
            continue
        final = result.content or ""
        if result.assistant_message:
            messages.append(result.assistant_message)
        break

    if final is None:
        final = OUT_OF_STEPS_MESSAGE
    return final, tool_events, used_model


async def _run_and_persist(
    db: AsyncSession,
    user: User,
    user_message: str,
    llm: LLMClient,
    model: str | None = None,
    *,
    spoken: bool = False,
    mode: str = "auto",
) -> tuple[str, list[dict], str | None]:
    history = await recent_history(db, user.id)
    system = _system_prompt() + (SPOKEN_RULES if spoken else "")
    registry = build_registry(db, user.id, llm)
    seeded_events: list[dict] = []
    if decide_web_search(user_message, mode, has_context=bool(history)):
        research = await gather_evidence(
            user_message,
            llm,
            history=history,
            search_fn=search_web,
            fetch_fn=fetch_page,
        )
        seeded_events = research["tool_events"]
        if research["evidence"]:
            system += (
                "\n\n"
                + research["evidence"]
                + "\n\nAnswer using ONLY the LIVE SOURCES above. If they do not "
                "contain the answer, say you could not verify it."
            )
    messages = [
        {"role": "system", "content": system},
        *history,
        {"role": "user", "content": user_message},
    ]
    try:
        final, tool_events, used_model = await _run_tool_loop(
            db, user.id, messages, registry, llm, model=model
        )
        tool_events = [*seeded_events, *tool_events]
    except Exception:
        await db.rollback()
        raise
    # On tool-loop exhaustion the assistant text is a fallback, not a real
    # reply, so persist nothing rather than orphan the user message.
    if final == OUT_OF_STEPS_MESSAGE:
        return final, tool_events, used_model
    db.add_all(
        [
            Message(user_id=user.id, role="user", content=user_message),
            Message(user_id=user.id, role="assistant", content=final),
        ]
    )
    await db.commit()
    return final, tool_events, used_model


async def run_chat(
    db: AsyncSession,
    user: User,
    user_message: str,
    llm: LLMClient,
    model: str | None = None,
    *,
    spoken: bool = False,
    mode: str = "auto",
) -> tuple[str, list[dict], str | None]:
    return await _run_and_persist(
        db, user, user_message, llm, model=model, spoken=spoken, mode=mode
    )


async def stream_chat(
    db: AsyncSession,
    user: User,
    user_message: str,
    llm: LLMClient,
    model: str | None = None,
    *,
    spoken: bool = False,
    mode: str = "auto",
):
    final, tool_events, used_model = await _run_and_persist(
        db, user, user_message, llm, model=model, spoken=spoken, mode=mode
    )

    for event in tool_events:
        yield {"type": "tool", "name": event["name"]}
    for token in _tokenize(final):
        yield {"type": "delta", "text": token}
        await asyncio.sleep(0.01)
    yield {"type": "done", "model": used_model or llm.model}


def _tokenize(text: str, chunk: int = 3):
    words = text.split()
    for i in range(0, len(words), chunk):
        yield " ".join(words[i : i + chunk]) + " "
