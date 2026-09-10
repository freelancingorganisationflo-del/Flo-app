import io
import re
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import settings

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
        self.api_key = settings.user_llm_api_key
        self.base_url = settings.user_llm_base_url.rstrip("/")
        self.stt_model = settings.user_stt_model
        self.tts_model = settings.user_tts_model
        self.tts_voice = settings.user_tts_voice
        self.timeout = settings.llm_timeout_seconds
        self._transport = transport

    def _headers(self, json: bool = False) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self.api_key}"}
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
        if not self.api_key:
            raise VoiceProviderError("USER_LLM_API_KEY is not configured")
        mime = STT_MIME.get(audio_format, "application/octet-stream")
        data: dict[str, str] = {"model": self.stt_model}
        if language:
            data["language"] = language
        files = {"file": (f"audio.{audio_format}", audio, mime)}
        async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
            resp = await client.post(
                f"{self.base_url}/audio/transcriptions",
                data=data,
                files=files,
                headers=self._headers(),
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
        if not self.api_key:
            raise VoiceProviderError("USER_LLM_API_KEY is not configured")
        payload: dict[str, Any] = {
            "model": self.tts_model,
            "input": text,
            "response_format": "mp3",
            "voice": voice or self.tts_voice,
        }
        async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
            resp = await client.post(
                f"{self.base_url}/audio/speech",
                json=payload,
                headers=self._headers(json=True),
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
