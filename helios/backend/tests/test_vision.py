import base64

import httpx
import pytest
import pytest_asyncio

from app.deps import get_vision
from app.main import app
from app.vision.client import VisionClient, VisionProviderError, enabled_models, resolve_model


class _FakeVision:
    def __init__(self) -> None:
        self.last_image: bytes | None = None
        self.last_mime: str | None = None
        self.last_question: str | None = None
        self.last_model: str | None = None
        self.reply = "I can see a red circle and some text."
        self.max_image_bytes = 15 * 1024 * 1024
        self.fail = False

    async def analyze(
        self,
        image: bytes,
        mime: str = "image/png",
        question: str = "",
        model: str | None = None,
    ) -> str:
        if self.fail:
            raise VisionProviderError("Vision boom")
        self.last_image = image
        self.last_mime = mime
        self.last_question = question
        self.last_model = model
        return self.reply


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "vis@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest_asyncio.fixture
async def fake_vision(client):
    fake = _FakeVision()
    app.dependency_overrides[get_vision] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_vision, None)


def _vision_client(handler, monkeypatch) -> VisionClient:
    monkeypatch.setattr("app.vision.client.settings.user_llm_api_key", "test-key")
    monkeypatch.setattr(
        "app.vision.client.settings.user_llm_base_url", "https://api.openai.com/v1"
    )
    monkeypatch.setattr(
        "app.vision.client.settings.user_llm_available_models", ["openai/gpt-4o-mini"]
    )
    monkeypatch.setattr(
        "app.vision.client.settings.vision_models_allowlist", ["openai/gpt-4o-mini"]
    )
    monkeypatch.setattr("app.vision.client.settings.user_vision_model", "openai/gpt-4o-mini")
    monkeypatch.setattr("app.vision.client.settings.user_vision_max_tokens", 512)
    return VisionClient(transport=httpx.MockTransport(handler))


def _png_bytes() -> bytes:
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
        "+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )


async def test_analyze_posts_multimodal_payload(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        body = request.read().decode()
        assert request.url.path == "/v1/chat/completions"
        assert '"type":"image_url"' in body
        assert "data:image/png;base64," in body
        assert '"role":"system"' in body
        assert "What color is it?" in body
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "It is a red circle."}}]}
        )

    client = _vision_client(handler, monkeypatch)
    result = await client.analyze(_png_bytes(), mime="image/png", question="What color is it?")
    assert result == "It is a red circle."


async def test_analyze_error_raises(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": {"message": "boom"}})

    client = _vision_client(handler, monkeypatch)
    with pytest.raises(VisionProviderError):
        await client.analyze(_png_bytes(), mime="image/png")


async def test_analyze_empty_content_raises(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": ""}}]})

    client = _vision_client(handler, monkeypatch)
    with pytest.raises(VisionProviderError):
        await client.analyze(_png_bytes(), mime="image/png")


async def test_analyze_unsupported_mime_raises(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("should not reach provider")

    client = _vision_client(handler, monkeypatch)
    with pytest.raises(VisionProviderError):
        await client.analyze(_png_bytes(), mime="image/tiff")


def test_enabled_models_respects_configured_list(monkeypatch):
    monkeypatch.setattr(
        "app.vision.client.settings.user_llm_available_models",
        ["openai/gpt-4o-mini", "deepseek/deepseek-chat"],
    )
    monkeypatch.setattr(
        "app.vision.client.settings.vision_models_allowlist", ["openai/gpt-4o-mini"]
    )
    monkeypatch.setattr("app.vision.client.settings.user_vision_model", "openai/gpt-4o-mini")
    models = enabled_models()
    assert models == ["openai/gpt-4o-mini"]


def test_resolve_model_rejects_unknown(monkeypatch):
    monkeypatch.setattr(
        "app.vision.client.settings.user_llm_available_models", ["openai/gpt-4o-mini"]
    )
    monkeypatch.setattr(
        "app.vision.client.settings.vision_models_allowlist", ["openai/gpt-4o-mini"]
    )
    monkeypatch.setattr("app.vision.client.settings.user_vision_model", "openai/gpt-4o-mini")
    with pytest.raises(ValueError):
        resolve_model("unknown/model")


async def test_analyze_router(authed_client, fake_vision):
    client, headers = authed_client
    resp = await client.post(
        "/api/vision/analyze",
        headers=headers,
        files={"file": ("pic.png", _png_bytes(), "image/png")},
        data={"question": "What is in this image?"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"] == fake_vision.reply
    assert body["model"] == "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
    assert fake_vision.last_question == "What is in this image?"
    assert fake_vision.last_mime == "image/png"


async def test_analyze_router_bad_mime(authed_client, fake_vision):
    client, headers = authed_client
    resp = await client.post(
        "/api/vision/analyze",
        headers=headers,
        files={"file": ("doc.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400
    assert "Unsupported image type" in resp.json()["detail"]


async def test_analyze_router_empty_file(authed_client, fake_vision):
    client, headers = authed_client
    resp = await client.post(
        "/api/vision/analyze",
        headers=headers,
        files={"file": ("pic.png", b"", "image/png")},
    )
    assert resp.status_code == 400


async def test_analyze_router_provider_error(authed_client, fake_vision):
    client, headers = authed_client
    fake_vision.fail = True
    resp = await client.post(
        "/api/vision/analyze",
        headers=headers,
        files={"file": ("pic.png", _png_bytes(), "image/png")},
    )
    assert resp.status_code == 502


async def test_models_router(authed_client):
    client, headers = authed_client
    resp = await client.get("/api/vision/models", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "models" in body
    assert "default" in body
