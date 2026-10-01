import base64
from typing import Any

import httpx

from ..config import settings
from ..llm_gateway.profiles import resolve_route
from ..style import build_style_prompt, build_style_reminder

# OpenRouter / OpenAI-compatible chat-completions content format for images.
IMAGE_MIME = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
}

VISION_SYSTEM_PROMPT = (
    "You are Helios, a personal AI assistant with vision. The user has sent an "
    "image. Analyze it carefully and answer based only on what is visible in the "
    "image and what the user asks. When the image contains text, read it "
    "faithfully and do not invent content that is not present. If the image is "
    "unclear, low quality, or you cannot see it, say so honestly. "
    "Keep the answer concise and natural, and use the language the user wrote in. "
    "Format for readability when it helps: use bullet lists for observations and "
    "a Markdown table for extracted text or tabular data (for example fields and "
    "values). Never output raw HTML."
)


class VisionProviderError(RuntimeError):
    pass


def _vision_system_prompt() -> str:
    style = build_style_prompt()
    reminder = build_style_reminder()
    prompt = VISION_SYSTEM_PROMPT
    if style:
        prompt += "\n\n" + style
    if reminder:
        prompt += "\n\n" + reminder
    return prompt


def _default_model() -> str:
    return settings.user_vision_model or resolve_route("general").model


def enabled_models() -> list[str]:
    """Vision-capable models the user actually enabled (or the configured default)."""
    configured = {m for m in resolve_route("general").available_models}
    allowed = [m for m in (settings.vision_models_allowlist or []) if m in configured]
    default = _default_model()
    if default and default not in allowed:
        allowed.insert(0, default)
    return allowed or [default] if default else []


def resolve_model(model: str | None) -> str:
    selected = model or _default_model()
    available = enabled_models()
    if selected not in available:
        raise ValueError(
            f"Model '{selected}' is not enabled for vision. "
            f"Available: {', '.join(available) or 'none configured'}"
        )
    return selected


def mime_from_name(filename: str | None) -> str | None:
    if not filename:
        return None
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    for mime, candidate in IMAGE_MIME.items():
        if candidate == ext:
            return mime
    return None


class VisionClient:
    """Multimodal image understanding via the OpenAI-compatible LLM gateway."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        route = resolve_route("general")
        self.api_key = route.api_key
        self.base_url = route.base_url.rstrip("/")
        self._key_env = route.key_env
        self.timeout = settings.llm_timeout_seconds
        self.max_tokens = settings.user_vision_max_tokens
        self.max_image_bytes = settings.vision_max_image_bytes
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def analyze(
        self,
        image: bytes,
        mime: str = "image/png",
        question: str = "",
        model: str | None = None,
    ) -> str:
        """Describe or answer questions about an image using a vision model."""
        if not self.api_key:
            raise VisionProviderError(f"{self._key_env} is not configured")
        selected = resolve_model(model)
        if mime not in IMAGE_MIME:
            raise VisionProviderError(f"Unsupported image type: {mime}")
        data_uri = f"data:{mime};base64,{base64.b64encode(image).decode('ascii')}"
        text = question.strip() or (
            "Describe this image in detail: what objects, people, text, layout, "
            "and context are visible?"
        )
        payload: dict[str, Any] = {
            "model": selected,
            "max_tokens": self.max_tokens,
            "messages": [
                {"role": "system", "content": _vision_system_prompt()},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": text},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                },
            ],
        }
        if selected in settings.user_llm_disable_reasoning_models:
            payload["reasoning"] = {"enabled": False}
        async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions", json=payload, headers=self._headers()
            )
            data = resp.json()
        if resp.status_code != 200:
            error = data.get("error") if isinstance(data, dict) else None
            detail = error.get("message") if isinstance(error, dict) else None
            raise VisionProviderError(
                f"Vision provider error ({resp.status_code}): {detail or data}"
            )
        choices = data.get("choices") if isinstance(data, dict) else None
        if not isinstance(choices, list) or not choices:
            raise VisionProviderError(
                "Vision provider returned an unexpected response: missing 'choices'"
            )
        message = choices[0].get("message") or {}
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise VisionProviderError("Vision provider returned an empty response")
        return content.strip()
