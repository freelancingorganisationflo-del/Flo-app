import httpx
import pytest
import pytest_asyncio

from app.config import settings
from app.deps import get_llm
from app.llm_gateway.client import ChatResult, LLMClient, LLMProviderError
from app.main import app

CHAT_URL = "https://example.test/v1/chat/completions"


@pytest.fixture(autouse=True)
def fast_retries(monkeypatch):
    monkeypatch.setattr(settings, "user_llm_api_key", "test-key")
    monkeypatch.setattr(settings, "user_llm_base_url", "https://example.test/v1")
    monkeypatch.setattr(settings, "llm_retry_backoff_seconds", 0.0)
    monkeypatch.setattr(settings, "llm_max_attempts", 3)


def _client(handler) -> LLMClient:
    return LLMClient(transport=httpx.MockTransport(handler))


def _ok_body(content: str = "hello") -> dict:
    return {
        "choices": [
            {
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ]
    }


async def test_complete_retries_transient_500_then_succeeds():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(500, json={"error": {"message": "upstream boom"}})
        return httpx.Response(200, json=_ok_body("recovered"))

    result = await _client(handler).complete([{"role": "user", "content": "hi"}])
    assert result.content == "recovered"
    assert calls["n"] == 2


async def test_complete_retries_missing_choices():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(200, json={})
        return httpx.Response(200, json=_ok_body("second try"))

    result = await _client(handler).complete([{"role": "user", "content": "hi"}])
    assert result.content == "second try"
    assert calls["n"] == 2


async def test_complete_does_not_retry_402():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(402, json={"error": {"message": "no credits"}})

    with pytest.raises(LLMProviderError) as excinfo:
        await _client(handler).complete([{"role": "user", "content": "hi"}])
    assert excinfo.value.status_code == 402
    assert excinfo.value.retryable is False
    assert calls["n"] == 1


async def test_complete_retries_200_with_error_body():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(
                200,
                json={
                    "choices": [],
                    "error": {"code": 502, "message": "Upstream overloaded"},
                },
            )
        return httpx.Response(200, json=_ok_body("recovered"))

    result = await _client(handler).complete([{"role": "user", "content": "hi"}])
    assert result.content == "recovered"
    assert calls["n"] == 2


async def test_stream_complete_retries_error_chunk_before_first_token():
    calls = {"n": 0}
    error_chunk = (
        'data: {"choices": [], "error": {"code": 502, "message": "overloaded"}}\n\n'
    )

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(
                200,
                content=error_chunk.encode(),
                headers={"content-type": "text/event-stream"},
            )
        return httpx.Response(
            200, content=_sse_body(), headers={"content-type": "text/event-stream"}
        )

    events = [e async for e in _client(handler).stream_complete(
        [{"role": "user", "content": "hi"}]
    )]
    assert calls["n"] == 2
    assert any(e["type"] == "result" and e["result"].content == "Hello" for e in events)


def _sse_body() -> bytes:
    chunks = [
        'data: {"choices": [{"delta": {"content": "Hel"}}]}\n\n',
        'data: {"choices": [{"delta": {"content": "lo"}}]}\n\n',
        "data: [DONE]\n\n",
    ]
    return "".join(chunks).encode()


async def test_stream_complete_yields_real_deltas():
    def handler(request):
        return httpx.Response(
            200, content=_sse_body(), headers={"content-type": "text/event-stream"}
        )

    events = [e async for e in _client(handler).stream_complete(
        [{"role": "user", "content": "hi"}]
    )]
    deltas = [e["text"] for e in events if e["type"] == "delta"]
    assert deltas == ["Hel", "lo"]
    results = [e for e in events if e["type"] == "result"]
    assert results and results[0]["result"].content == "Hello"


async def test_stream_complete_retries_before_first_token():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503, json={"error": {"message": "busy"}})
        return httpx.Response(
            200, content=_sse_body(), headers={"content-type": "text/event-stream"}
        )

    events = [e async for e in _client(handler).stream_complete(
        [{"role": "user", "content": "hi"}]
    )]
    assert calls["n"] == 2
    assert any(e["type"] == "result" and e["result"].content == "Hello" for e in events)


class FallbackStreamLLM(LLMClient):
    def __init__(self) -> None:
        super().__init__()
        self.models: list[str | None] = []

    async def stream_complete(self, messages, tools=None, model=None, max_tokens=None):
        self.models.append(model)
        if model is not None:
            raise LLMProviderError("no credits", status_code=402)
        yield {"type": "delta", "text": "ok"}
        yield {
            "type": "result",
            "result": ChatResult(
                content="ok", assistant_message={"role": "assistant", "content": "ok"}
            ),
        }

    async def complete(self, messages, tools=None, model=None, max_tokens=None):
        raise LLMProviderError("not used")


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post(
        "/api/auth/signup", json={"email": "res@h.com", "password": "secret123"}
    )
    token = resp.json()["access_token"]
    return client, {"Authorization": f"Bearer {token}"}


async def test_stream_falls_back_to_default_model_on_402(authed_client):
    client, headers = authed_client
    fake = FallbackStreamLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    try:
        events: list[dict] = []
        async with client.stream(
            "POST",
            "/api/chat/stream",
            json={"message": "hello", "model": "openai/gpt-4o-mini"},
            headers=headers,
        ) as resp:
            assert resp.status_code == 200
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    events.append(__import__("json").loads(line[6:]))
    finally:
        app.dependency_overrides.pop(get_llm, None)

    assert fake.models == ["openai/gpt-4o-mini", None]
    assert any(e["type"] == "delta" and e["text"] == "ok" for e in events)
    assert any(e["type"] == "done" for e in events)
