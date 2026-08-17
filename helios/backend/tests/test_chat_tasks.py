import json

import pytest_asyncio
from sqlalchemy import select

from app.deps import get_llm
from app.llm_gateway.client import ChatResult, LLMClient, ToolCall
from app.main import app
from app.models import Task


class TaskLLM(LLMClient):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[list[dict]] = []
        self.schemas: list[list[dict]] = []
        self.pending_tool: tuple[str, str] | None = None

    def _tool_result(self, name: str, arguments: str) -> ChatResult:
        return ChatResult(
            content=None,
            tool_calls=[ToolCall(id="call_t", name=name, arguments=arguments)],
            assistant_message={
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_t",
                        "type": "function",
                        "function": {"name": name, "arguments": arguments},
                    }
                ],
            },
        )

    async def complete(self, messages, tools=None):
        self.calls.append(messages)
        if tools:
            self.schemas.append(tools)
        last = messages[-1]
        if last["role"] == "tool":
            return ChatResult(
                content="Created the task for you.",
                tool_calls=[],
                assistant_message={"role": "assistant", "content": "Created the task for you."},
            )
        if self.pending_tool is not None:
            name, arguments = self.pending_tool
            self.pending_tool = None
            return self._tool_result(name, arguments)
        if last["role"] == "user" and "create a task" in last["content"].lower():
            return self._tool_result(
                "create_task",
                '{"title": "call Ravi", "priority": "high", "reminder_at": "2026-08-17T08:00:00"}',
            )
        return ChatResult(
            content=f"Echo: {last['content']}",
            tool_calls=[],
            assistant_message={"role": "assistant", "content": f"Echo: {last['content']}"},
        )

    async def embed(self, text):
        return [1.0, 0.0]


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "ct@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest_asyncio.fixture
async def task_llm(client):
    fake = TaskLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


async def test_chat_creates_task_via_tool(authed_client, task_llm, db_session):
    client, headers = authed_client
    resp = await client.post(
        "/api/chat", json={"message": "create a task"}, headers=headers
    )
    assert resp.status_code == 200
    assert any(e["name"] == "create_task" for e in resp.json()["tool_events"])
    tasks = (await db_session.execute(select(Task))).scalars().all()
    assert len(tasks) == 1
    assert tasks[0].title == "call Ravi"
    assert tasks[0].priority == "high"


async def test_chat_registry_exposes_all_task_tools(authed_client, task_llm):
    client, headers = authed_client
    assert task_llm.schemas == []
    await client.post("/api/chat", json={"message": "hi"}, headers=headers)
    schema = task_llm.schemas[0]
    names = [t["function"]["name"] for t in schema]
    assert names[-5:] == ["create_task", "list_tasks", "complete_task", "update_task", "delete_task"]


async def test_chat_create_task_rejects_invalid_datetime(authed_client, task_llm, db_session):
    client, headers = authed_client
    task_llm.pending_tool = ("create_task", '{"title": "bad", "reminder_at": "not-a-date"}')
    resp = await client.post("/api/chat", json={"message": "make a task"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["tool_events"][0]["name"] == "create_task"
    tasks = (await db_session.execute(select(Task))).scalars().all()
    assert len(tasks) == 0
    assert len(task_llm.calls) >= 1
    tool_msgs = [m for m in task_llm.calls[-1] if m.get("role") == "tool"]
    assert len(tool_msgs) == 1
    payload = json.loads(tool_msgs[-1]["content"])
    assert payload["created"] is False
    assert "error" in payload


async def test_chat_delete_missing_task_returns_error(authed_client, task_llm):
    client, headers = authed_client
    task_llm.pending_tool = ("delete_task", '{"task_id": 999}')
    resp = await client.post("/api/chat", json={"message": "delete it"}, headers=headers)
    assert resp.status_code == 200
    tool_msgs = [m for m in task_llm.calls[-1] if m.get("role") == "tool"]
    assert len(tool_msgs) == 1
    payload = json.loads(tool_msgs[-1]["content"])
    assert payload["deleted"] is False
    assert payload["error"] == "task not found"
