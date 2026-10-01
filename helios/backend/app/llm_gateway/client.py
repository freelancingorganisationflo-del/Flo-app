import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

import httpx

from ..config import settings
from .profiles import LLMRoute, resolve_route

logger = logging.getLogger(__name__)

# Provider statuses that are worth retrying: rate limits, transient upstream
# failures and gateway timeouts. Client errors (401/402/403/404) are fatal.
_RETRYABLE_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524}


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
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable


def _provider_error_message(status_code: int, data: Any) -> str:
    error = data.get("error") if isinstance(data, dict) else None
    detail = error.get("message") if isinstance(error, dict) else None
    if isinstance(detail, str) and detail:
        return f"LLM provider error ({status_code}): {detail}"
    return f"LLM provider error ({status_code}): {data}"


def _load_json(raw: bytes) -> Any:
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return {"error": {"message": raw.decode(errors="replace")[:500]}}


def _error_from_body(status_code: int, data: Any) -> LLMProviderError | None:
    """Extract a provider error from a (possibly 200) response body.

    OpenRouter can report an upstream failure as a normal HTTP 200 response
    with an empty ``choices`` list and an ``error`` object, including while
    streaming. Surfacing it lets the retry logic recover instead of returning
    an empty answer.
    """
    if not isinstance(data, dict):
        return None
    error = data.get("error")
    if not isinstance(error, dict):
        return None
    code = error.get("code")
    if not isinstance(code, int):
        code = status_code
    return LLMProviderError(
        _provider_error_message(code, data),
        status_code=code,
        retryable=code in _RETRYABLE_STATUSES,
    )


def single_shot_events(result: ChatResult) -> list[dict[str, Any]]:
    """Build stream events for a non-streaming result.

    Lets fakes and simple clients satisfy the streaming interface by
    emitting the whole answer as one delta followed by the result."""
    events: list[dict[str, Any]] = []
    if result.content:
        events.append({"type": "delta", "text": result.content})
    events.append({"type": "result", "result": result})
    return events


class LLMClient:
    def __init__(
        self,
        transport: httpx.AsyncBaseTransport | None = None,
        *,
        task: str = "general",
        route: LLMRoute | None = None,
    ) -> None:
        self.route = route or resolve_route(task)
        self.task = self.route.task
        self.provider = self.route.provider
        self.api_key = self.route.api_key
        self.base_url = self.route.base_url.rstrip("/")
        self.model = self.route.model
        self.fallback_model = self.route.fallback_model
        self.available_models = list(self.route.available_models)
        self.embedding_api_key = self.route.embedding_api_key
        self.embedding_base_url = self.route.embedding_base_url.rstrip("/")
        self.embedding_model = self.route.embedding_model
        self.max_tokens = settings.user_llm_max_tokens
        self.timeout = settings.llm_timeout_seconds
        self._transport = transport
        self._key_env = self.route.key_env
        self._embedding_key_env = self.route.embedding_key_env

    def _missing_key_error(self, *, embedding: bool = False) -> LLMProviderError:
        env_name = self._embedding_key_env if embedding else self._key_env
        return LLMProviderError(f"{env_name} is not configured")

    def _log(self, *, success: bool, model: str | None, started: float, error: str | None = None) -> None:
        latency_ms = int((time.monotonic() - started) * 1000)
        logger.info(
            "llm task=%s provider=%s model=%s latency_ms=%s success=%s%s",
            self.task,
            self.provider,
            model or self.model,
            latency_ms,
            success,
            f" error={error}" if error else "",
        )

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    def _payload(
        self,
        messages: list[dict],
        tools: list[dict] | None,
        model: str | None,
        max_tokens: int | None,
        *,
        stream: bool = False,
    ) -> dict[str, Any]:
        selected_model = model or self.model
        payload: dict[str, Any] = {"model": selected_model, "messages": messages}
        if max_tokens or self.max_tokens:
            payload["max_tokens"] = max_tokens or self.max_tokens
        if selected_model in settings.user_llm_disable_reasoning_models:
            payload["reasoning"] = {"enabled": False}
        if tools:
            payload["tools"] = tools
        if stream:
            payload["stream"] = True
        return payload

    def _attempts(self) -> int:
        return max(1, settings.llm_max_attempts)

    async def _sleep_before_retry(self, attempt: int) -> None:
        await asyncio.sleep(settings.llm_retry_backoff_seconds * attempt)

    async def complete(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
    ) -> ChatResult:
        if not self.api_key:
            raise self._missing_key_error()
        selected = model or self.model
        models_to_try = [selected]
        if self.fallback_model and self.fallback_model not in models_to_try:
            models_to_try.append(self.fallback_model)
        last_error: LLMProviderError | None = None
        for index, current in enumerate(models_to_try):
            try:
                return await self._complete_once(messages, tools, current, max_tokens)
            except LLMProviderError as exc:
                last_error = exc
                if index < len(models_to_try) - 1:
                    continue
                raise
        assert last_error is not None
        raise last_error

    async def _complete_once(
        self,
        messages: list[dict],
        tools: list[dict] | None,
        model: str | None,
        max_tokens: int | None,
    ) -> ChatResult:
        payload = self._payload(messages, tools, model, max_tokens)
        url = f"{self.base_url}/chat/completions"
        attempts = self._attempts()
        last_error: LLMProviderError | None = None
        started = time.monotonic()
        for attempt in range(1, attempts + 1):
            try:
                async with httpx.AsyncClient(
                    timeout=self.timeout, transport=self._transport
                ) as client:
                    resp = await client.post(url, json=payload, headers=self._headers())
                data = _load_json(resp.content)
                if resp.status_code != 200:
                    raise LLMProviderError(
                        _provider_error_message(resp.status_code, data),
                        status_code=resp.status_code,
                        retryable=resp.status_code in _RETRYABLE_STATUSES,
                    )
                choices = data.get("choices")
                if not isinstance(choices, list) or not choices:
                    body_error = _error_from_body(resp.status_code, data)
                    if body_error is not None:
                        raise body_error
                    raise LLMProviderError(
                        "LLM provider returned an unexpected response: missing 'choices'",
                        retryable=True,
                    )
                parsed = self._parse_choice(choices[0])
                self._log(success=True, model=model, started=started)
                return parsed
            except httpx.RequestError as exc:
                last_error = LLMProviderError(
                    f"LLM provider request failed: {exc}", retryable=True
                )
            except LLMProviderError as exc:
                last_error = exc
                if not exc.retryable:
                    self._log(success=False, model=model, started=started, error=str(exc))
                    raise
            if attempt < attempts:
                await self._sleep_before_retry(attempt)
        assert last_error is not None
        self._log(success=False, model=model, started=started, error=str(last_error))
        raise last_error

    async def stream_complete(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield ``{"type": "delta", "text": ...}`` events and finally a
        ``{"type": "result", "result": ChatResult}`` event."""
        if not self.api_key:
            raise self._missing_key_error()
        payload = self._payload(messages, tools, model, max_tokens, stream=True)
        url = f"{self.base_url}/chat/completions"
        attempts = self._attempts()
        started = time.monotonic()
        for attempt in range(1, attempts + 1):
            produced = False
            content_parts: list[str] = []
            tool_calls_acc: dict[int, dict[str, Any]] = {}
            try:
                async with httpx.AsyncClient(
                    timeout=self.timeout, transport=self._transport
                ) as client:
                    async with client.stream(
                        "POST", url, json=payload, headers=self._headers()
                    ) as resp:
                        if resp.status_code != 200:
                            data = _load_json(await resp.aread())
                            raise LLMProviderError(
                                _provider_error_message(resp.status_code, data),
                                status_code=resp.status_code,
                                retryable=resp.status_code in _RETRYABLE_STATUSES,
                            )
                        async for line in resp.aiter_lines():
                            if not line or not line.startswith("data:"):
                                continue
                            chunk = line[5:].strip()
                            if not chunk or chunk == "[DONE]":
                                continue
                            try:
                                event = json.loads(chunk)
                            except ValueError:
                                continue
                            choices = event.get("choices") or []
                            if not choices:
                                chunk_error = _error_from_body(resp.status_code, event)
                                if chunk_error is not None:
                                    if produced:
                                        break
                                    raise chunk_error
                                continue
                            delta = choices[0].get("delta") or {}
                            text = delta.get("content")
                            if text:
                                produced = True
                                content_parts.append(text)
                                yield {"type": "delta", "text": text}
                            self._accumulate_tool_calls(
                                tool_calls_acc, delta.get("tool_calls") or []
                            )
                self._log(success=True, model=model, started=started)
                yield {
                    "type": "result",
                    "result": self._build_result("".join(content_parts), tool_calls_acc),
                }
                return
            except httpx.RequestError as exc:
                if produced:
                    raise LLMProviderError(
                        f"LLM stream failed: {exc}", retryable=True
                    ) from exc
                if attempt >= attempts:
                    err = LLMProviderError(
                        f"LLM provider request failed: {exc}", retryable=True
                    )
                    self._log(success=False, model=model, started=started, error=str(err))
                    raise err from exc
                await self._sleep_before_retry(attempt)
            except LLMProviderError as exc:
                if produced or not exc.retryable or attempt >= attempts:
                    self._log(success=False, model=model, started=started, error=str(exc))
                    raise
                await self._sleep_before_retry(attempt)

    @staticmethod
    def _accumulate_tool_calls(
        acc: dict[int, dict[str, Any]], deltas: list[dict]
    ) -> None:
        for tc in deltas:
            if not isinstance(tc, dict):
                continue
            index = tc.get("index")
            if index is None:
                index = len(acc)
            slot = acc.setdefault(index, {"id": None, "name": None, "arguments": ""})
            if tc.get("id"):
                slot["id"] = tc["id"]
            function = tc.get("function") or {}
            if function.get("name"):
                slot["name"] = function["name"]
            if function.get("arguments"):
                slot["arguments"] += function["arguments"]

    @staticmethod
    def _build_result(
        content: str, tool_calls_acc: dict[int, dict[str, Any]]
    ) -> ChatResult:
        message: dict[str, Any] = {"role": "assistant", "content": content or None}
        tool_calls: list[ToolCall] = []
        normalized: list[dict[str, Any]] = []
        for index in sorted(tool_calls_acc):
            slot = tool_calls_acc[index]
            call_id = slot.get("id")
            name = slot.get("name")
            if call_id is None or name is None:
                continue
            arguments = slot.get("arguments") or "{}"
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
            content=content or None, tool_calls=tool_calls, assistant_message=message
        )

    @staticmethod
    def _parse_choice(choice: Any) -> ChatResult:
        choice_msg = (choice or {}).get("message") or {}
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
            content=choice_msg.get("content"),
            tool_calls=tool_calls,
            assistant_message=message,
        )

    def _embedding_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.embedding_api_key}",
            "Content-Type": "application/json",
        }

    async def embed(self, text: str) -> list[float]:
        if not self.embedding_api_key:
            raise self._missing_key_error(embedding=True)
        attempts = self._attempts()
        last_error: LLMProviderError | None = None
        started = time.monotonic()
        for attempt in range(1, attempts + 1):
            try:
                async with httpx.AsyncClient(
                    timeout=self.timeout, transport=self._transport
                ) as client:
                    resp = await client.post(
                        f"{self.embedding_base_url}/embeddings",
                        json={"model": self.embedding_model, "input": text},
                        headers=self._embedding_headers(),
                    )
                data = _load_json(resp.content)
                if resp.status_code != 200:
                    raise LLMProviderError(
                        _provider_error_message(resp.status_code, data),
                        status_code=resp.status_code,
                        retryable=resp.status_code in _RETRYABLE_STATUSES,
                    )
                embeddings = data.get("data")
                if not isinstance(embeddings, list) or not embeddings:
                    raise LLMProviderError(
                        "LLM provider returned an unexpected response: missing 'data'",
                        retryable=True,
                    )
                embedding = embeddings[0].get("embedding")
                if not isinstance(embedding, list):
                    raise LLMProviderError(
                        "LLM provider returned an unexpected response: missing embedding",
                        retryable=True,
                    )
                self._log(success=True, model=self.embedding_model, started=started)
                return embedding
            except httpx.RequestError as exc:
                last_error = LLMProviderError(
                    f"LLM provider request failed: {exc}", retryable=True
                )
            except LLMProviderError as exc:
                last_error = exc
                if not exc.retryable:
                    self._log(success=False, model=self.embedding_model, started=started, error=str(exc))
                    raise
            if attempt < attempts:
                await self._sleep_before_retry(attempt)
        assert last_error is not None
        self._log(success=False, model=self.embedding_model, started=started, error=str(last_error))
        raise last_error
