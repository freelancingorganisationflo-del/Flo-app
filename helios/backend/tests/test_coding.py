import pytest
import pytest_asyncio

from app.coding.decision import should_search_code
from app.coding.prompt import build_coding_system_prompt
from app.coding.service import normalize_messages, stream_code
from app.deps import get_code_llm
from app.llm_gateway.client import ChatResult, LLMClient, LLMProviderError, single_shot_events
from app.main import app


class FakeCodeLLM(LLMClient):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[list[dict]] = []

    async def stream_complete(self, messages, tools=None, model=None, max_tokens=None):
        self.calls.append(messages)
        result = ChatResult(
            content="Here you go:\n\n```python\nprint('hi')\n```",
            assistant_message={"role": "assistant", "content": "ok"},
        )
        for event in single_shot_events(result):
            yield event

    async def embed(self, text):
        return [1.0, 0.0]


class FallbackLLM(LLMClient):
    async def stream_complete(self, messages, tools=None, model=None, max_tokens=None):
        if model is not None:
            raise LLMProviderError("no credits", status_code=402, retryable=False)
        for event in single_shot_events(ChatResult(content="fallback answer")):
            yield event

    async def embed(self, text):
        return [1.0, 0.0]


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post(
        "/api/auth/signup", json={"email": "code@h.com", "password": "secret123"}
    )
    token = resp.json()["access_token"]
    return client, {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def fake_code_llm(client):
    fake = FakeCodeLLM()
    app.dependency_overrides[get_code_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_code_llm, None)


def test_coding_prompt_has_code_rules_and_style():
    prompt = build_coding_system_prompt()
    assert "Helios Code" in prompt
    assert "fenced blocks" in prompt
    assert "cannot execute code" in prompt
    # The shared conversation style layer (professional by default) is included.
    assert "CONVERSATION STYLE" in prompt
    assert "slang" in prompt.lower()


def test_normalize_messages_filters_and_requires_user_last():
    raw = [
        {"role": "system", "content": "ignore me"},
        {"role": "user", "content": "  "},
        {"role": "user", "content": "write a sort"},
        {"role": "assistant", "content": "sure"},
        {"role": "user", "content": "make it ts"},
    ]
    out = normalize_messages(raw)
    assert out == [
        {"role": "user", "content": "write a sort"},
        {"role": "assistant", "content": "sure"},
        {"role": "user", "content": "make it ts"},
    ]


def test_normalize_messages_rejects_empty_or_assistant_last():
    with pytest.raises(ValueError):
        normalize_messages([])
    with pytest.raises(ValueError):
        normalize_messages(
            [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hey"}]
        )


def test_normalize_messages_trims_to_recent_window():
    raw = [{"role": "user", "content": f"m{i}"} for i in range(60)]
    out = normalize_messages(raw)
    assert len(out) == 40
    assert out[-1]["content"] == "m59"


async def test_stream_code_uses_coding_system_prompt():
    llm = FakeCodeLLM()
    events = [
        event
        async for event in stream_code(
            [{"role": "user", "content": "print hi in python"}], llm
        )
    ]
    assert events[0] == {"type": "stage", "stage": "generating"}
    assert events[-1]["type"] == "done"
    assert "```python" in events[-1]["content"]
    system = llm.calls[0][0]
    assert system["role"] == "system"
    assert "Helios Code" in system["content"]


async def test_stream_code_falls_back_to_default_model():
    llm = FallbackLLM()
    deltas = [
        event["text"]
        async for event in stream_code(
            [{"role": "user", "content": "hi"}], llm, model="paid/model"
        )
        if event["type"] == "delta"
    ]
    assert "".join(deltas) == "fallback answer"


async def test_coding_stream_endpoint(authed_client, fake_code_llm):
    client, headers = authed_client
    async with client.stream(
        "POST",
        "/api/coding/stream",
        json={"messages": [{"role": "user", "content": "print hi"}]},
        headers=headers,
    ) as resp:
        assert resp.status_code == 200
        body = ""
        async for chunk in resp.aiter_text():
            body += chunk
    assert "print" in body
    assert '"type": "done"' in body


async def test_coding_stream_rejects_assistant_last(authed_client, fake_code_llm):
    client, headers = authed_client
    resp = await client.post(
        "/api/coding/stream",
        json={"messages": [{"role": "assistant", "content": "hey"}]},
        headers=headers,
    )
    assert resp.status_code == 400


def test_should_search_code_is_narrow():
    assert should_search_code("write a python function to add two numbers") is False
    assert should_search_code("refactor this class to use dependency injection") is False
    assert should_search_code("why do I get this error: KeyError 'x'") is True
    assert should_search_code("what's the latest version of React?") is True
    assert should_search_code("search the web for fastapi docs") is True
    assert should_search_code("anything at all", "web") is True
    assert should_search_code("latest react", "off") is False


async def _new_session(client, headers, title=None):
    resp = await client.post(
        "/api/coding/sessions", json={"title": title}, headers=headers
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def test_session_stream_persists_turns(authed_client, fake_code_llm):
    client, headers = authed_client
    sid = await _new_session(client, headers)

    async with client.stream(
        "POST",
        f"/api/coding/sessions/{sid}/stream",
        json={"message": "print hi in python"},
        headers=headers,
    ) as resp:
        assert resp.status_code == 200
        body = "".join([chunk async for chunk in resp.aiter_text()])
    assert '"type": "done"' in body

    detail = (await client.get(f"/api/coding/sessions/{sid}", headers=headers)).json()
    assert detail["title"].startswith("print hi")
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert "python" in detail["messages"][1]["content"]

    listing = (await client.get("/api/coding/sessions", headers=headers)).json()
    assert any(s["id"] == sid for s in listing)


async def test_coding_auto_skips_search_for_plain_code(authed_client, fake_code_llm):
    client, headers = authed_client
    sid = await _new_session(client, headers)
    async with client.stream(
        "POST",
        f"/api/coding/sessions/{sid}/stream",
        json={"message": "write a python function that adds two numbers"},
        headers=headers,
    ) as resp:
        body = "".join([chunk async for chunk in resp.aiter_text()])
    assert '"stage": "searching"' not in body


async def test_coding_search_grounds_and_emits_sources(
    authed_client, fake_code_llm, monkeypatch
):
    async def fake_gather(*args, **kwargs):
        return {
            "evidence": "LIVE SOURCES:\n[1] React - https://react.dev\n    v19.1.0",
            "sources": [
                {
                    "title": "React",
                    "url": "https://react.dev",
                    "domain": "react.dev",
                    "snippet": "v19.1.0",
                    "source": "web",
                }
            ],
            "tool_events": [{"name": "web_search", "arguments": "{}"}],
        }

    monkeypatch.setattr("app.coding.service.gather_evidence", fake_gather)
    client, headers = authed_client
    sid = await _new_session(client, headers)
    async with client.stream(
        "POST",
        f"/api/coding/sessions/{sid}/stream",
        json={"message": "what's the latest version of React?", "mode": "web"},
        headers=headers,
    ) as resp:
        body = "".join([chunk async for chunk in resp.aiter_text()])
    assert '"stage": "searching"' in body
    assert '"type": "sources"' in body
    # The evidence block is injected into the coding system prompt.
    assert "LIVE SOURCES" in fake_code_llm.calls[-1][0]["content"]


async def test_file_crud_and_validation(authed_client):
    client, headers = authed_client
    sid = await _new_session(client, headers)

    resp = await client.post(
        f"/api/coding/sessions/{sid}/files",
        json={"name": "app.py", "language": "python", "content": "x = 1"},
        headers=headers,
    )
    assert resp.status_code == 201
    file_id = resp.json()["id"]

    resp = await client.patch(
        f"/api/coding/sessions/{sid}/files/{file_id}",
        json={"content": "x = 2", "language": "python"},
        headers=headers,
    )
    assert resp.json()["content"] == "x = 2"

    detail = (await client.get(f"/api/coding/sessions/{sid}", headers=headers)).json()
    assert [f["name"] for f in detail["files"]] == ["app.py"]

    resp = await client.delete(
        f"/api/coding/sessions/{sid}/files/{file_id}", headers=headers
    )
    assert resp.status_code == 204


async def test_session_scoping_and_delete(authed_client, client):
    owner, headers = authed_client
    sid = await _new_session(owner, headers)

    # A different user cannot see or touch the session.
    other = await client.post(
        "/api/auth/signup", json={"email": "intruder@h.com", "password": "secret123"}
    )
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert (
        await client.get(f"/api/coding/sessions/{sid}", headers=other_headers)
    ).status_code == 404

    rename = await client.patch(
        f"/api/coding/sessions/{sid}", json={"title": "My work"}, headers=headers
    )
    assert rename.json()["title"] == "My work"

    assert (
        await client.delete(f"/api/coding/sessions/{sid}", headers=headers)
    ).status_code == 204
    assert (
        await client.get(f"/api/coding/sessions/{sid}", headers=headers)
    ).status_code == 404
