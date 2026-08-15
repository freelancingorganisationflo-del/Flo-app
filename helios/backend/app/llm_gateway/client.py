import json
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


class LLMClient:
    def __init__(self) -> None:
        self.api_key = settings.user_llm_api_key
        self.base_url = settings.user_llm_base_url.rstrip("/")
        self.model = settings.user_llm_model
        self.embedding_model = settings.user_llm_embedding_model
        self.timeout = settings.llm_timeout_seconds

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    async def complete(self, messages: list[dict], tools: list[dict] | None = None) -> ChatResult:
        if not self.api_key:
            raise RuntimeError("USER_LLM_API_KEY is not configured")
        payload: dict[str, Any] = {"model": self.model, "messages": messages}
        if tools:
            payload["tools"] = tools
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions", json=payload, headers=self._headers()
            )
            resp.raise_for_status()
            data = resp.json()

        choice = data["choices"][0]["message"]
        message: dict[str, Any] = {"role": "assistant", "content": choice.get("content")}
        tool_calls: list[ToolCall] = []
        if choice.get("tool_calls"):
            message["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["function"]["name"],
                        "arguments": tc["function"].get("arguments") or "{}",
                    },
                }
                for tc in choice["tool_calls"]
            ]
            tool_calls = [
                ToolCall(
                    id=tc["id"],
                    name=tc["function"]["name"],
                    arguments=tc["function"].get("arguments") or "{}",
                )
                for tc in choice["tool_calls"]
            ]
        return ChatResult(content=choice.get("content"), tool_calls=tool_calls, assistant_message=message)

    async def embed(self, text: str) -> list[float]:
        if not self.api_key:
            raise RuntimeError("USER_LLM_API_KEY is not configured")
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/embeddings",
                json={"model": self.embedding_model, "input": text},
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
        return data["data"][0]["embedding"]
