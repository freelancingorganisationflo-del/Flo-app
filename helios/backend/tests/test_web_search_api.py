import pytest_asyncio

from app.deps import get_llm
from app.llm_gateway.client import ChatResult, LLMClient
from app.main import app


class WebSearchLLM(LLMClient):
    async def complete(self, messages, tools=None, model=None, max_tokens=None):
        system = " ".join(
            m.get("content") or "" for m in messages if m.get("role") == "system"
        )
        if "Rewrite" in system:
            content = "president of france"
        else:
            content = "Grounded answer from the supplied sources."
        return ChatResult(
            content=content,
            tool_calls=[],
            assistant_message={"role": "assistant", "content": content},
        )

    async def embed(self, text):
        return [1.0, 0.0]


def _search_results():
    return [
        {
            "title": "France",
            "url": "https://example.com/france",
            "snippet": "European country.",
            "source": "web",
        },
        {
            "title": "France - Wikipedia",
            "url": "https://en.wikipedia.org/wiki/France",
            "snippet": "Country in Europe.",
            "source": "web",
        },
    ]


async def _fake_fetch(url, max_chars=None):
    return {"url": url, "title": "France", "text": "France is in Europe.", "truncated": False}


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "ws@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    return client, {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def ws_llm(client):
    fake = WebSearchLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


async def test_web_search_requires_auth(client):
    resp = await client.post("/api/web-search", json={"query": "hi"})
    assert resp.status_code == 401


async def test_web_search_invalid_mode(authed_client, ws_llm):
    client, headers = authed_client
    resp = await client.post(
        "/api/web-search", json={"query": "ai news", "mode": "bogus"}, headers=headers
    )
    assert resp.status_code == 400


async def test_web_search_mode_off_does_not_search(authed_client, ws_llm, monkeypatch):
    client, headers = authed_client

    async def fail_search(query, max_results=None):
        raise AssertionError("search must not run when mode=off")

    import app.search.router as search_router

    monkeypatch.setattr(search_router, "search_web", fail_search)
    resp = await client.post(
        "/api/web-search", json={"query": "latest ai news", "mode": "off"}, headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["searched"] is False
    assert body["sources"] == []
    assert body["searchId"]


async def test_web_search_auto_skips_clock_queries(authed_client, ws_llm, monkeypatch):
    client, headers = authed_client

    async def fail_search(query, max_results=None):
        raise AssertionError("clock questions must not trigger a web search")

    import app.search.router as search_router

    monkeypatch.setattr(search_router, "search_web", fail_search)
    resp = await client.post(
        "/api/web-search",
        json={"query": "what is today's date?", "mode": "auto"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["searched"] is False


async def test_web_search_auto_honors_explicit_request(authed_client, ws_llm, monkeypatch):
    client, headers = authed_client
    seen: list[str] = []

    async def fake_search(query, max_results=None):
        seen.append(query)
        return _search_results()

    import app.search.router as search_router

    monkeypatch.setattr(search_router, "search_web", fake_search)
    monkeypatch.setattr(search_router, "fetch_page", _fake_fetch)
    resp = await client.post(
        "/api/web-search",
        json={"query": "please search the web for the latest ai news", "mode": "auto"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["searched"] is True
    assert seen and seen[0]

    client, headers = authed_client

    async def fake_search(query, max_results=None):
        return _search_results()

    import app.search.router as search_router

    monkeypatch.setattr(search_router, "search_web", fake_search)
    monkeypatch.setattr(search_router, "fetch_page", _fake_fetch)
    resp = await client.post(
        "/api/web-search",
        json={"query": "Who is the president of France?", "mode": "web"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["searched"] is True
    assert body["answer"] == "Grounded answer from the supplied sources."
    assert len(body["sources"]) == 2
    urls = {s["url"] for s in body["sources"]}
    assert "https://example.com/france" in urls
    first = body["sources"][0]
    assert first["domain"]
    assert "snippet" in first
    assert body["mode"] == "web"
    assert body["timestamp"]
