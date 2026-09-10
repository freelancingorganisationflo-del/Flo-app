import json

import pytest_asyncio

from app.deps import get_llm
from app.llm_gateway.client import ChatResult, LLMClient, ToolCall
from app.main import app


class SearchLLM(LLMClient):
    def __init__(self) -> None:
        super().__init__()
        self.schemas: list[list[dict]] = []
        self.pending_tool: tuple[str, str] | None = None

    def _tool_result(self, name: str, arguments: str) -> ChatResult:
        return ChatResult(
            content=None,
            tool_calls=[ToolCall(id="call_s", name=name, arguments=arguments)],
            assistant_message={
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_s",
                        "type": "function",
                        "function": {"name": name, "arguments": arguments},
                    }
                ],
            },
        )

    async def complete(self, messages, tools=None, model=None):
        if tools:
            self.schemas.append(tools)
        last = messages[-1]
        if last["role"] == "tool":
            return ChatResult(
                content="Here is what I found on the web.",
                tool_calls=[],
                assistant_message={
                    "role": "assistant",
                    "content": "Here is what I found on the web.",
                },
            )
        if self.pending_tool is not None:
            name, arguments = self.pending_tool
            self.pending_tool = None
            return self._tool_result(name, arguments)
        if last["role"] == "user" and "search the web" in last["content"].lower():
            return self._tool_result("web_search", '{"query": "ai news"}')
        return ChatResult(
            content=f"Echo: {last['content']}",
            tool_calls=[],
            assistant_message={"role": "assistant", "content": f"Echo: {last['content']}"},
        )

    async def embed(self, text):
        return [1.0, 0.0]


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "cs@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest_asyncio.fixture
async def search_llm(client):
    fake = SearchLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


async def test_chat_web_search_tool(authed_client, search_llm, monkeypatch):
    client, headers = authed_client

    async def fake_search(query, max_results=None):
        return [
            {
                "title": "AI news",
                "url": "https://example.com/ai",
                "snippet": "Latest AI headlines.",
                "source": "web",
            }
        ]

    import app.chat.service as chat_service

    monkeypatch.setattr(chat_service, "search_web", fake_search)
    resp = await client.post("/api/chat", json={"message": "search the web for AI news"}, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "web" in body["reply"].lower()
    assert any(e["name"] == "web_search" for e in body["tool_events"])
    names = {t["function"]["name"] for t in search_llm.schemas[0]}
    assert "web_search" in names
    assert "fetch_url" in names


async def test_chat_fetch_url_tool(authed_client, search_llm, monkeypatch):
    client, headers = authed_client
    search_llm.pending_tool = ("fetch_url", '{"url": "https://example.com/ai"}')

    async def fake_fetch(url, max_chars=None):
        return {"url": url, "title": "AI", "text": "Hello from the web.", "truncated": False}

    import app.chat.service as chat_service

    monkeypatch.setattr(chat_service, "fetch_page", fake_fetch)
    resp = await client.post("/api/chat", json={"message": "read this page"}, headers=headers)
    assert resp.status_code == 200
    assert any(e["name"] == "fetch_url" for e in resp.json()["tool_events"])


from app.chat.service import should_web_search


def test_should_web_search_skips_smalltalk_and_personal():
    assert should_web_search("hello") is False
    assert should_web_search("thanks") is False
    assert should_web_search("remember that I like coffee") is False
    assert should_web_search("create a task to call Ravi") is False
    assert should_web_search("what's on my plate today?") is False


def test_should_web_search_detects_questions():
    assert should_web_search("Who is the president of France?") is True
    assert should_web_search("latest AI news") is True
    assert should_web_search("kya aaj weather kaisa hai") is True
    assert should_web_search("Explain quantum computing simply") is True


async def test_chat_auto_searches_the_web_for_factual_questions(authed_client, search_llm, monkeypatch):
    client, headers = authed_client
    searches: list[str] = []
    fetches: list[str] = []

    async def fake_search(query, max_results=None):
        searches.append(query)
        return [
            {
                "title": "France",
                "url": "https://example.com/france",
                "snippet": "European country.",
                "source": "web",
            }
        ]

    async def fake_fetch(url, max_chars=None):
        fetches.append(url)
        return {"url": url, "title": "France", "text": "France is in Europe.", "truncated": False}

    import app.chat.service as chat_service

    monkeypatch.setattr(chat_service, "search_web", fake_search)
    monkeypatch.setattr(chat_service, "fetch_page", fake_fetch)
    resp = await client.post(
        "/api/chat", json={"message": "Who is the president of France?"}, headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert searches, "factual questions must trigger a live web search"
    assert any(e["name"] == "web_search" for e in body["tool_events"])
    assert any(e["name"] == "fetch_url" for e in body["tool_events"])
    assert fetches == ["https://example.com/france"]
    # Prefetch injects tool results, so the model should answer from them.
    assert "web" in body["reply"].lower()
