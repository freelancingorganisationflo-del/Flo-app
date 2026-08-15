import json

import pytest_asyncio
from sqlalchemy import select

from app.deps import get_llm
from app.llm_gateway.client import ChatResult, LLMClient, ToolCall
from app.main import app
from app.models import Memory


class FakeLLM(LLMClient):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[list[dict]] = []

    async def complete(self, messages, tools=None):
        self.calls.append(messages)
        last = messages[-1]
        if last["role"] == "user" and "remember" in last["content"].lower():
            return ChatResult(
                content=None,
                tool_calls=[ToolCall(id="call_1", name="save_memory", arguments='{"content": "likes coffee"}')],
                assistant_message={
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "save_memory", "arguments": '{"content": "likes coffee"}'},
                        }
                    ],
                },
            )
        if last["role"] == "tool":
            return ChatResult(
                content="Got it, I saved that.",
                tool_calls=[],
                assistant_message={"role": "assistant", "content": "Got it, I saved that."},
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
    resp = await client.post("/api/auth/signup", json={"email": "u@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest_asyncio.fixture
async def fake_llm(client):
    fake = FakeLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


async def test_chat_echo(authed_client, fake_llm):
    client, headers = authed_client
    resp = await client.post("/api/chat", json={"message": "hello"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["reply"] == "Echo: hello"


async def test_chat_empty_message_rejected(authed_client, fake_llm):
    client, headers = authed_client
    resp = await client.post("/api/chat", json={"message": "   "}, headers=headers)
    assert resp.status_code == 400


async def test_chat_saves_memory_via_tool(authed_client, fake_llm, db_session):
    client, headers = authed_client
    resp = await client.post(
        "/api/chat", json={"message": "remember that I like coffee"}, headers=headers
    )
    assert resp.status_code == 200
    assert "saved" in resp.json()["reply"].lower()
    assert any(e["name"] == "save_memory" for e in resp.json()["tool_events"])
    mems = (await db_session.execute(select(Memory))).scalars().all()
    assert len(mems) == 1
    assert mems[0].content == "likes coffee"


async def test_chat_persists_history(authed_client, fake_llm, db_session):
    client, headers = authed_client
    await client.post("/api/chat", json={"message": "first"}, headers=headers)
    await client.post("/api/chat", json={"message": "second"}, headers=headers)
    assert fake_llm.calls[1][1]["role"] == "user"
    assert fake_llm.calls[1][1]["content"] == "first"


async def test_chat_stream_emits_delta_and_done(authed_client, fake_llm):
    client, headers = authed_client
    async with client.stream(
        "POST", "/api/chat/stream", json={"message": "hello"}, headers=headers
    ) as resp:
        assert resp.status_code == 200
        body = "\n".join([line async for line in resp.aiter_lines()])
    events = [json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")]
    assert any(e["type"] == "delta" for e in events)
    assert events[-1]["type"] == "done"
