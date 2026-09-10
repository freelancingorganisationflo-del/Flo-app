import httpx
import pytest
import pytest_asyncio

from app.deps import get_voice
from app.main import app
from app.voice.client import VoiceClient, VoiceProviderError
from app.voice.text import clean_for_speech


class _FakeVoice:
    def __init__(self) -> None:
        self.last_text: str | None = None
        self.last_voice: str | None = None
        self.fail_stt = False
        self.fail_tts = False

    async def transcribe(self, audio: bytes, audio_format: str = "wav", language: str | None = None) -> str:
        if self.fail_stt:
            raise VoiceProviderError("STT boom")
        return "hello from voice"

    async def synthesize(self, text: str, voice: str | None = None) -> bytes:
        if self.fail_tts:
            raise VoiceProviderError("TTS boom")
        self.last_text = text
        self.last_voice = voice
        return b"MP3AUDIO"


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "v@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest_asyncio.fixture
async def fake_voice(client):
    fake = _FakeVoice()
    app.dependency_overrides[get_voice] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_voice, None)


def _voice_client(handler, monkeypatch) -> VoiceClient:
    monkeypatch.setattr("app.voice.client.settings.user_llm_api_key", "test-key")
    monkeypatch.setattr(
        "app.voice.client.settings.user_llm_base_url", "https://api.openai.com/v1"
    )
    monkeypatch.setattr("app.voice.client.settings.user_tts_voice", "default-voice")
    return VoiceClient(transport=httpx.MockTransport(handler))


async def test_transcribe_posts_multipart(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/audio/transcriptions"
        assert "multipart/form-data" in request.headers.get("content-type", "")
        return httpx.Response(200, json={"text": "hello world"})

    client = _voice_client(handler, monkeypatch)
    result = await client.transcribe(b"audio-bytes", audio_format="wav")
    assert result == "hello world"


async def test_transcribe_error_raises(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": {"message": "boom"}})

    client = _voice_client(handler, monkeypatch)
    with pytest.raises(VoiceProviderError):
        await client.transcribe(b"audio")


async def test_synthesize_sends_voice_and_returns_audio(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        body = request.read().decode()
        assert '"voice":"default-voice"' in body
        return httpx.Response(200, content=b"MP3BYTES")

    client = _voice_client(handler, monkeypatch)
    audio = await client.synthesize("hi there")
    assert audio == b"MP3BYTES"


async def test_synthesize_explicit_voice_wins(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        body = request.read().decode()
        assert '"voice":"custom"' in body
        return httpx.Response(200, content=b"MP3BYTES")

    client = _voice_client(handler, monkeypatch)
    audio = await client.synthesize("hi", voice="custom")
    assert audio == b"MP3BYTES"


async def test_synthesize_error_raises(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "bad"}})

    client = _voice_client(handler, monkeypatch)
    with pytest.raises(VoiceProviderError):
        await client.synthesize("hi")


async def test_synthesize_edge_voice_uses_edge(monkeypatch):
    async def fake_edge(text: str, voice: str) -> bytes:
        assert voice == "en-US-ChristopherNeural"
        return b"EDGEMP3"

    client = _voice_client(lambda _r: httpx.Response(500), monkeypatch)
    monkeypatch.setattr(client, "_synthesize_edge", fake_edge)
    audio = await client.synthesize("hi there", voice="en-US-ChristopherNeural")
    assert audio == b"EDGEMP3"


async def test_synthesize_edge_voice_fallback_from_config(monkeypatch):
    async def fake_edge(text: str, voice: str) -> bytes:
        assert voice == "en-US-GuyNeural"
        return b"EDGEMP3"

    client = _voice_client(lambda _r: httpx.Response(500), monkeypatch)
    client.tts_voice = "en-US-GuyNeural"
    monkeypatch.setattr(client, "_synthesize_edge", fake_edge)
    audio = await client.synthesize("hi")
    assert audio == b"EDGEMP3"


async def test_voice_config_returns_models(authed_client):
    client, headers = authed_client
    resp = await client.get("/api/voice/config", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "stt_model" in body and "tts_model" in body and "tts_voice" in body


async def test_stt_endpoint_returns_text(authed_client, fake_voice):
    client, headers = authed_client
    resp = await client.post(
        "/api/voice/stt",
        files={"file": ("audio.wav", b"audio-bytes", "audio/wav")},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json() == {"text": "hello from voice"}


async def test_stt_endpoint_provider_error(authed_client, fake_voice):
    client, headers = authed_client
    fake_voice.fail_stt = True
    resp = await client.post(
        "/api/voice/stt",
        files={"file": ("audio.wav", b"audio-bytes", "audio/wav")},
        headers=headers,
    )
    assert resp.status_code == 502
    assert "STT failed" in resp.json()["detail"]


async def test_tts_endpoint_returns_audio(authed_client, fake_voice):
    client, headers = authed_client
    resp = await client.post(
        "/api/voice/tts", json={"text": "hello"}, headers=headers
    )
    assert resp.status_code == 200
    assert resp.content == b"MP3AUDIO"
    assert resp.headers["content-type"].startswith("audio/mpeg")
    assert fake_voice.last_text == "hello"
    assert fake_voice.last_voice is None


async def test_tts_endpoint_provider_error(authed_client, fake_voice):
    client, headers = authed_client
    fake_voice.fail_tts = True
    resp = await client.post("/api/voice/tts", json={"text": "hello"}, headers=headers)
    assert resp.status_code == 502
    assert "TTS failed" in resp.json()["detail"]


async def test_tts_endpoint_rejects_empty_text(authed_client):
    client, headers = authed_client
    resp = await client.post("/api/voice/tts", json={"text": "  "}, headers=headers)
    assert resp.status_code == 400


async def test_voice_endpoints_require_auth(client):
    resp = await client.get("/api/voice/config")
    assert resp.status_code == 401
    resp = await client.post("/api/voice/tts", json={"text": "hi"})
    assert resp.status_code == 401
    resp = await client.post("/api/voice/stt", files={"file": ("a.wav", b"x", "audio/wav")})
    assert resp.status_code == 401


async def test_wake_returns_greeting_and_tasks(authed_client, db_session):
    from app.tasks.service import create_task

    client, headers = authed_client
    await create_task(db_session, 1, "finish report", priority="high")
    await create_task(db_session, 1, "call dentist")
    resp = await client.post("/api/voice/wake", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "HELIOS" in body["text"]
    assert "2 pending tasks" in body["text"]
    titles = [t["title"] for t in body["tasks"]]
    assert "finish report" in titles and "call dentist" in titles


async def test_wake_no_tasks(authed_client):
    client, headers = authed_client
    resp = await client.post("/api/voice/wake", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "no pending tasks" in body["text"]
    assert body["tasks"] == []


async def test_wake_requires_auth(client):
    resp = await client.post("/api/voice/wake")
    assert resp.status_code == 401


def test_clean_for_speech_strips_emoji_and_markdown():
    text = (
        "Hello! 🎉 I'm HELIOS 😀. Aapka **task** complete ✅.\n"
        "- Milk\n- Bread\nCheck [docs](https://x.com) later."
    )
    out = clean_for_speech(text)
    assert "🎉" not in out and "😀" not in out and "✅" not in out
    assert "**" not in out and "https://" not in out
    assert "[docs]" not in out
    assert "Milk" in out and "Bread" in out


def test_clean_for_speech_keeps_hinglish():
    text = "Aapke paas 2 pending tasks hain. Kya main list karu?"
    out = clean_for_speech(text)
    assert out == "Aapke paas 2 pending tasks hain. Kya main list karu?"


def test_clean_for_speech_handles_urls_and_code():
    text = "Run `pip install fastapi` now. See https://example.com. Done!!"
    out = clean_for_speech(text)
    assert "https://example.com" not in out
    assert "pip install fastapi" in out
    assert "!" in out and "!!" not in out


async def test_talk_returns_audio_and_cleaned_reply(
    authed_client, fake_voice, monkeypatch
):
    client, headers = authed_client

    async def fake_run_chat(db, user, user_message, llm, model=None, spoken=False):
        assert spoken is True
        return "Great! 🎉 Aapka **task** done ho gaya ✅.", [], "test-model"

    monkeypatch.setattr("app.voice.router.run_chat", fake_run_chat)
    resp = await client.post(
        "/api/voice/talk", json={"text": "task complete karo"}, headers=headers
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("audio/mpeg")
    assert resp.headers["x-helios-reply"]
    import base64

    reply = base64.b64decode(resp.headers["x-helios-reply"]).decode("utf-8")
    assert "🎉" not in reply and "✅" not in reply and "**" not in reply
    assert "done ho gaya" in reply
    assert fake_voice.last_text == reply


async def test_talk_rejects_empty_text(authed_client):
    client, headers = authed_client
    resp = await client.post("/api/voice/talk", json={"text": "   "}, headers=headers)
    assert resp.status_code == 400


async def test_talk_requires_auth(client):
    resp = await client.post("/api/voice/talk", json={"text": "hi"})
    assert resp.status_code == 401
