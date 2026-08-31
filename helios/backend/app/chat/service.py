import asyncio
import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..llm_gateway.client import LLMClient, LLMProviderError
from ..llm_gateway.tools import Tool, ToolRegistry
from ..memory.service import add_memory, search_memories
from ..models import Message, User
from ..rag.service import search_documents as search_documents_service
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

SYSTEM_PROMPT = (
    "You are Helios, a personal AI assistant. Be warm, concise, and helpful.\n\n"
    "You have tools to look up stored facts about the user and save new facts "
    "to long-term memory. Use them whenever relevant:\n"
    "- search_memory: call when the user asks about something they told you "
    "before, or when recalling a stored fact would help answer.\n"
    "- save_memory: call when the user shares a personal fact, preference, or "
    "detail worth remembering for future conversations.\n"
    "- search_documents: call when the user asks about documents, notes, or "
    "web pages they saved to their knowledge base. Search their personal "
    "documents and answer from the retrieved content with a short source "
    "attribution.\n\n"
    "You also manage the user's tasks and reminders:\n"
    "- create_task: parse the title, due date, and recurrence from the user's "
    "request. ALWAYS confirm the parsed details with the user before calling "
    "this tool.\n"
    "- list_tasks: call when the user asks what tasks or reminders are pending "
    "or what's on their plate.\n"
    "- complete_task: call when the user says they finished a task.\n"
    "- update_task: call to change a task's details.\n"
    "- delete_task: call to remove a task.\n\n"
    "When you use a tool, keep your final answer short and natural."
)


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
    db: AsyncSession, user: User, user_message: str, llm: LLMClient, model: str | None = None
) -> tuple[str, list[dict], str | None]:
    history = await recent_history(db, user.id)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": user_message},
    ]
    registry = build_registry(db, user.id, llm)
    try:
        final, tool_events, used_model = await _run_tool_loop(
            db, user.id, messages, registry, llm, model=model
        )
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
