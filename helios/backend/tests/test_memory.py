import pytest_asyncio
from sqlalchemy import select

from app.deps import get_llm
from app.llm_gateway.client import LLMClient, LLMProviderError
from app.main import app
from app.memory.service import (
    add_memory,
    cosine_similarity,
    delete_memory,
    list_memories,
    search_memories,
)
from app.models import Memory


class FakeMemoryLLM(LLMClient):
    def __init__(self) -> None:
        super().__init__()
        self.fail = False

    async def embed(self, text):
        if self.fail:
            raise LLMProviderError("embedding service down")
        return [1.0, 0.0]

    async def complete(self, messages, tools=None):
        raise AssertionError("complete must not be called by the memory router")


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "mem@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest_asyncio.fixture
async def fake_memory_llm(client):
    fake = FakeMemoryLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


def test_cosine_similarity_basics():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert abs(cosine_similarity([1.0, 0.0], [0.0, 1.0])) < 1e-9
    assert cosine_similarity([], [1.0]) == 0.0


async def test_add_and_list_memory(db_session):
    mem = await add_memory(db_session, user_id=1, content="likes coffee", embedding=[1.0, 0.0])
    assert mem.id is not None
    mems = await list_memories(db_session, 1)
    assert len(mems) == 1
    assert mems[0].content == "likes coffee"


async def test_search_ranks_relevant_first(db_session):
    await add_memory(db_session, 1, "I love hiking in the mountains", [1.0, 0.0, 0.0])
    await add_memory(db_session, 1, "My cat is named Milo", [0.0, 1.0, 0.0])
    results = await search_memories(db_session, 1, [0.9, 0.1, 0.0], top_k=2)
    assert results[0].content == "I love hiking in the mountains"


async def test_search_scoped_to_user(db_session):
    await add_memory(db_session, 1, "user one secret", [1.0, 0.0])
    await add_memory(db_session, 2, "user two secret", [1.0, 0.0])
    results = await search_memories(db_session, 1, [1.0, 0.0], top_k=5)
    assert len(results) == 1
    assert results[0].content == "user one secret"


async def test_delete_memory(db_session):
    mem = await add_memory(db_session, 1, "temp", [1.0])
    assert await delete_memory(db_session, 1, mem.id) is True
    assert await delete_memory(db_session, 1, mem.id) is False
    rows = (await db_session.execute(select(Memory))).scalars().all()
    assert len(rows) == 0


async def test_memory_router_create_list_delete(authed_client, fake_memory_llm):
    client, headers = authed_client
    resp = await client.post("/api/memory", json={"content": "likes hiking"}, headers=headers)
    assert resp.status_code == 201
    mem_id = resp.json()["id"]

    resp = await client.get("/api/memory", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["content"] == "likes hiking"

    resp = await client.delete(f"/api/memory/{mem_id}", headers=headers)
    assert resp.status_code == 204
    resp = await client.delete(f"/api/memory/{mem_id}", headers=headers)
    assert resp.status_code == 404


async def test_memory_router_embed_failure_returns_502(authed_client, fake_memory_llm):
    client, headers = authed_client
    fake_memory_llm.fail = True
    resp = await client.post("/api/memory", json={"content": "boom"}, headers=headers)
    assert resp.status_code == 502
