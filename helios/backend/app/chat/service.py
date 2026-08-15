import asyncio
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..llm_gateway.client import LLMClient
from ..llm_gateway.tools import Tool, ToolRegistry
from ..memory.service import add_memory, search_memories
from ..models import Message, User

SYSTEM_PROMPT = (
    "You are Helios, a personal AI assistant. Be warm, concise, and helpful.\n\n"
    "You have tools to look up stored facts about the user and save new facts "
    "to long-term memory. Use them whenever relevant:\n"
    "- search_memory: call when the user asks about something they told you "
    "before, or when recalling a stored fact would help answer.\n"
    "- save_memory: call when the user shares a personal fact, preference, or "
    "detail worth remembering for future conversations.\n\n"
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


async def save_user_message(db: AsyncSession, user_id: int, content: str) -> Message:
    msg = Message(user_id=user_id, role="user", content=content)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def save_assistant_message(db: AsyncSession, user_id: int, content: str) -> Message:
    msg = Message(user_id=user_id, role="assistant", content=content)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def _run_tool_loop(
    db: AsyncSession,
    user_id: int,
    messages: list[dict],
    registry: ToolRegistry,
    llm: LLMClient,
) -> tuple[str, list[dict]]:
    iterations = settings.llm_max_tool_iterations
    tool_events: list[dict] = []
    final: str | None = None

    for _ in range(iterations):
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
        final = "I ran out of steps trying to help with that. Please try rephrasing."
    return final, tool_events


async def run_chat(
    db: AsyncSession, user: User, user_message: str, llm: LLMClient
) -> tuple[str, list[dict]]:
    await save_user_message(db, user.id, user_message)
    history = await recent_history(db, user.id)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *history]
    registry = build_registry(db, user.id, llm)
    final, tool_events = await _run_tool_loop(db, user.id, messages, registry, llm)
    await save_assistant_message(db, user.id, final)
    return final, tool_events


async def stream_chat(
    db: AsyncSession, user: User, user_message: str, llm: LLMClient
):
    await save_user_message(db, user.id, user_message)
    history = await recent_history(db, user.id)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *history]
    registry = build_registry(db, user.id, llm)
    final, tool_events = await _run_tool_loop(db, user.id, messages, registry, llm)
    await save_assistant_message(db, user.id, final)

    for event in tool_events:
        yield {"type": "tool", "name": event["name"]}
    for token in _tokenize(final):
        yield {"type": "delta", "text": token}
        await asyncio.sleep(0.01)
    yield {"type": "done"}


def _tokenize(text: str, chunk: int = 3):
    words = text.split()
    for i in range(0, len(words), chunk):
        yield " ".join(words[i : i + chunk]) + " "
