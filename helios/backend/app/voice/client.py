import io
import re
from typing import Any

import httpx

from ..config import settings
from ..llm_gateway.profiles import resolve_stt, resolve_tts

STT_MIME = {
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
    "m4a": "audio/mp4",
    "ogg": "audio/ogg",
    "webm": "audio/webm",
    "aac": "audio/aac",
}

# Edge (Microsoft neural) voices look like "en-US-ChristopherNeural".
EDGE_VOICE_RE = re.compile(r"^[a-z]{2,3}-[A-Z]{2,3}-[A-Za-z0-9]+Neural$")


class VoiceProviderError(RuntimeError):
    pass


class VoiceClient:
    """Provider-agnostic speech-to-text and text-to-speech via the LLM gateway."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        stt = resolve_stt()
        tts = resolve_tts()
        self.stt_api_key = stt.api_key
        self.stt_base_url = stt.base_url.rstrip("/")
        self.stt_model = stt.model
        self.stt_key_env = stt.key_env
        self.tts_api_key = tts.api_key
        self.tts_base_url = tts.base_url.rstrip("/")
        self.tts_model = tts.model
        self.tts_key_env = tts.key_env
        self.tts_provider = tts.provider
        self.tts_voice = settings.user_tts_voice
        self.timeout = settings.llm_timeout_seconds
        self._transport = transport

    def _headers(self, *, api_key: str, json: bool = False) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {api_key}"}
        if json:
            headers["Content-Type"] = "application/json"
        return headers

    def _error(self, status_code: int, data: Any) -> VoiceProviderError:
        error = data.get("error") if isinstance(data, dict) else None
        detail = error.get("message") if isinstance(error, dict) else None
        if isinstance(detail, str) and detail:
            return VoiceProviderError(f"Voice provider error ({status_code}): {detail}")
        return VoiceProviderError(f"Voice provider error ({status_code}): {data}")

    async def transcribe(
        self, audio: bytes, audio_format: str = "wav", language: str | None = None
    ) -> str:
        """Transcribe audio bytes to text (OpenAI-compatible multipart)."""
        if not self.stt_api_key:
            raise VoiceProviderError(f"{self.stt_key_env} is not configured")
        mime = STT_MIME.get(audio_format, "application/octet-stream")
        data: dict[str, str] = {"model": self.stt_model}
        if language:
            data["language"] = language
        files = {"file": (f"audio.{audio_format}", audio, mime)}
        async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
            resp = await client.post(
                f"{self.stt_base_url}/audio/transcriptions",
                data=data,
                files=files,
                headers=self._headers(api_key=self.stt_api_key),
            )
            body = resp.json()
        if resp.status_code != 200:
            raise VoiceProviderError(
                "STT failed: "
                + self._error(resp.status_code, body).args[0]
            )
        text = body.get("text")
        if not isinstance(text, str) or not text.strip():
            raise VoiceProviderError("STT provider returned an empty transcription")
        return text.strip()

    async def synthesize(self, text: str, voice: str | None = None) -> bytes:
        """Synthesize speech from text, returning raw audio bytes (mp3)."""
        selected = voice or self.tts_voice
        if selected and EDGE_VOICE_RE.match(selected):
            return await self._synthesize_edge(text, selected)
        return await self._synthesize_gateway(text, selected)

    async def _synthesize_edge(self, text: str, voice: str) -> bytes:
        """Synthesize via Microsoft Edge neural voices — free, unlimited, no key."""
        try:
            import edge_tts
        except ImportError as exc:
            raise VoiceProviderError(
                "TTS failed: edge-tts is not installed (pip install edge-tts)"
            ) from exc
        buffer = io.BytesIO()
        try:
            communicate = edge_tts.Communicate(text, voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    buffer.write(chunk["data"])
        except Exception as exc:
            raise VoiceProviderError(f"TTS failed: Edge voice provider error: {exc}") from exc
        data = buffer.getvalue()
        if not data:
            raise VoiceProviderError("TTS failed: Edge voice provider returned empty audio")
        return data

    async def _synthesize_gateway(self, text: str, voice: str | None) -> bytes:
        if not self.tts_api_key:
            raise VoiceProviderError(f"{self.tts_key_env} is not configured")
        payload: dict[str, Any] = {
            "model": self.tts_model,
            "input": text,
            "response_format": "mp3",
            "voice": voice or self.tts_voice,
        }
        async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
            resp = await client.post(
                f"{self.tts_base_url}/audio/speech",
                json=payload,
                headers=self._headers(api_key=self.tts_api_key, json=True),
            )
            data = resp.content
        if resp.status_code != 200:
            try:
                body = resp.json()
            except ValueError:
                body = None
            raise VoiceProviderError(
                "TTS failed: " + self._error(resp.status_code, body).args[0]
            )
        if not data:
            raise VoiceProviderError("TTS provider returned empty audio")
        return data
