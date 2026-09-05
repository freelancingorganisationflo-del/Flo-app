import asyncio
import json
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..llm_gateway.client import LLMClient, LLMProviderError
from ..llm_gateway.tools import Tool, ToolRegistry
from ..memory.service import add_memory, search_memories
from ..models import Message, User
from ..rag.service import search_documents as search_documents_service
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

_SKIP_WEB = re.compile(
    r"^(hi|hello|hey|thanks|thank you|ok|okay|yo|gm|good morning|"
    r"good afternoon|good evening)\b",
    re.I,
)
_PERSONAL = re.compile(
    r"\b(remind me|create a task|add a task|my tasks|remember that|"
    r"save (a |this )?memory|what do you remember|on my plate|"
    r"mark .+ done|delete (the |this )?task|my documents|knowledge base)\b",
    re.I,
)
_ASK = re.compile(
    r"\?|\b(who|what|when|where|why|how|which|latest|news|today|current|"
    r"price|weather|score|stock|explain|define|search|find|look up|"
    r"tell me|kya|kaun|kab|kahan|kyun|kaise)\b",
    re.I,
)


def should_web_search(message: str) -> bool:
    text = message.strip()
    if len(text) < 4:
        return False
    if _SKIP_WEB.search(text) and len(text) < 24:
        return False
    if _PERSONAL.search(text):
        return False
    if _ASK.search(text):
        return True
    return len(text.split()) >= 5


def _system_prompt() -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return (
        "You are Helios, a personal AI assistant. Be warm, concise, and accurate.\n"
        f"Today's date is {today} (UTC).\n\n"
        "Ground factual answers in live web evidence. If web search results or "
        "fetched pages are already in this conversation, use them. Do not invent "
        "facts, dates, names, or numbers. If sources disagree or are thin, say so.\n"
        "Cite 2-4 sources as markdown links at the end of factual answers.\n\n"
        "Tools:\n"
        "- web_search: use for current events, news, facts, prices, people, "
        "places, or anything you are not certain about. Prefer a focused query.\n"
        "- fetch_url: after web_search, read the 1-2 most relevant pages before "
        "answering in depth.\n"
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


async def prefetch_web_evidence(query: str) -> tuple[list[dict], list[dict]]:
    """Run web search + top pages so the model answers from live sources."""
    extra_messages: list[dict] = []
    tool_events: list[dict] = []
    try:
        results = await search_web(query, max_results=5)
    except SearchError:
        return extra_messages, tool_events
    if not results:
        return extra_messages, tool_events
    payload = json.dumps({"found": True, "results": results})
    extra_messages.append(
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "prefetch_web_search",
                    "type": "function",
                    "function": {"name": "web_search", "arguments": json.dumps({"query": query})},
                }
            ],
        }
    )
    extra_messages.append(
        {"role": "tool", "tool_call_id": "prefetch_web_search", "content": payload}
    )
    tool_events.append({"name": "web_search", "arguments": json.dumps({"query": query})})

    async def _one(item: dict) -> tuple[str, dict] | None:
        url = item.get("url") or ""
        try:
            page = await fetch_page(url, max_chars=3500)
        except SearchError:
            return None
        return url, page

    fetched = await asyncio.gather(*[_one(item) for item in results[:2]])
    for i, item in enumerate(fetched):
        if item is None:
            continue
        url, page = item
        call_id = f"prefetch_fetch_{i}"
        extra_messages.append(
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": call_id,
                        "type": "function",
                        "function": {"name": "fetch_url", "arguments": json.dumps({"url": url})},
                    }
                ],
            }
        )
        extra_messages.append(
            {"role": "tool", "tool_call_id": call_id, "content": json.dumps({"ok": True, **page})}
        )
        tool_events.append({"name": "fetch_url", "arguments": json.dumps({"url": url})})
    return extra_messages, tool_events


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
    db: AsyncSession, user: User, user_message: str, llm: LLMClient, model: str | None = None
) -> tuple[str, list[dict], str | None]:
    history = await recent_history(db, user.id)
    messages = [
        {"role": "system", "content": _system_prompt()},
        *history,
        {"role": "user", "content": user_message},
    ]
    registry = build_registry(db, user.id, llm)
    seeded_events: list[dict] = []
    if should_web_search(user_message):
        extra, seeded_events = await prefetch_web_evidence(user_message)
        messages.extend(extra)
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
    db: AsyncSession, user: User, user_message: str, llm: LLMClient, model: str | None = None
) -> tuple[str, list[dict], str | None]:
    return await _run_and_persist(db, user, user_message, llm, model=model)


async def stream_chat(
    db: AsyncSession, user: User, user_message: str, llm: LLMClient, model: str | None = None
):
    final, tool_events, used_model = await _run_and_persist(db, user, user_message, llm, model=model)

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
