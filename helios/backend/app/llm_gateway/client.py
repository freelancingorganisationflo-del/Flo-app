from dataclasses import dataclass, field
from typing import Any

import httpx

from ..config import settings


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass
class ChatResult:
    content: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)
    assistant_message: dict[str, Any] | None = None


class LLMProviderError(RuntimeError):
    pass


def _provider_error_message(status_code: int, data: Any) -> str:
    error = data.get("error") if isinstance(data, dict) else None
    detail = error.get("message") if isinstance(error, dict) else None
    if isinstance(detail, str) and detail:
        return f"LLM provider error ({status_code}): {detail}"
    return f"LLM provider error ({status_code}): {data}"


class LLMClient:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.api_key = settings.user_llm_api_key
        self.base_url = settings.user_llm_base_url.rstrip("/")
        self.model = settings.user_llm_model
        self.embedding_model = settings.user_llm_embedding_model
        self.max_tokens = settings.user_llm_max_tokens
        self.timeout = settings.llm_timeout_seconds
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    async def complete(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
    ) -> ChatResult:
        if not self.api_key:
            raise LLMProviderError("USER_LLM_API_KEY is not configured")
        payload: dict[str, Any] = {"model": model or self.model, "messages": messages}
        if max_tokens or self.max_tokens:
            payload["max_tokens"] = max_tokens or self.max_tokens
        if tools:
            payload["tools"] = tools
        async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions", json=payload, headers=self._headers()
            )
            data = resp.json()

        if resp.status_code != 200:
            raise LLMProviderError(_provider_error_message(resp.status_code, data))
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            raise LLMProviderError(
                "LLM provider returned an unexpected response: missing 'choices'"
            )
        choice_msg = choices[0].get("message") or {}
        message: dict[str, Any] = {"role": "assistant", "content": choice_msg.get("content")}
        tool_calls: list[ToolCall] = []
        raw_tool_calls = choice_msg.get("tool_calls")
        if raw_tool_calls:
            normalized: list[dict[str, Any]] = []
            for tc in raw_tool_calls:
                if not isinstance(tc, dict):
                    continue
                function = tc.get("function") or {}
                call_id = tc.get("id")
                name = function.get("name")
                if call_id is None or name is None:
                    continue
                arguments = function.get("arguments") or "{}"
                normalized.append(
                    {
                        "id": call_id,
                        "type": "function",
                        "function": {"name": name, "arguments": arguments},
                    }
                )
                tool_calls.append(ToolCall(id=call_id, name=name, arguments=arguments))
            if normalized:
                message["tool_calls"] = normalized
        return ChatResult(
            content=choice_msg.get("content"), tool_calls=tool_calls, assistant_message=message
        )

    async def embed(self, text: str) -> list[float]:
        if not self.api_key:
            raise LLMProviderError("USER_LLM_API_KEY is not configured")
        async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
            resp = await client.post(
                f"{self.base_url}/embeddings",
                json={"model": self.embedding_model, "input": text},
                headers=self._headers(),
            )
            data = resp.json()

        if resp.status_code != 200:
            raise LLMProviderError(_provider_error_message(resp.status_code, data))
        embeddings = data.get("data")
        if not isinstance(embeddings, list) or not embeddings:
            raise LLMProviderError(
                "LLM provider returned an unexpected response: missing 'data'"
            )
        embedding = embeddings[0].get("embedding")
        if not isinstance(embedding, list):
            raise LLMProviderError(
                "LLM provider returned an unexpected response: missing embedding"
            )
        return embedding
