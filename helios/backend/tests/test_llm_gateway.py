import asyncio
import json

import httpx
import pytest

from app.llm_gateway.client import LLMClient, LLMProviderError
from app.llm_gateway.tools import Tool, ToolRegistry


def _transport_client(handler, monkeypatch) -> LLMClient:
    monkeypatch.setattr("app.llm_gateway.client.settings.user_llm_api_key", "test-key")
    return LLMClient(transport=httpx.MockTransport(handler))


def test_client_requires_key(monkeypatch):
    monkeypatch.setattr("app.llm_gateway.client.settings.user_llm_api_key", "")
    client = LLMClient()
    assert client.api_key == ""


def test_tool_registry_schema():
    registry = ToolRegistry()
    async def handler(x: int) -> str:
        return json.dumps({"double": x * 2})

    registry.register(
        Tool(
            name="double",
            description="Doubles a number",
            parameters={
                "type": "object",
                "properties": {"x": {"type": "integer"}},
                "required": ["x"],
            },
            handler=handler,
        )
    )
    schema = registry.schema()
    assert schema[0]["function"]["name"] == "double"


def test_tool_registry_executes_handler():
    registry = ToolRegistry()
    async def handler(x: int) -> str:
        return json.dumps({"double": x * 2})

    registry.register(
        Tool(
            name="double",
            description="Doubles a number",
            parameters={
                "type": "object",
                "properties": {"x": {"type": "integer"}},
                "required": ["x"],
            },
            handler=handler,
        )
    )

    async def run():
        return await registry.execute("double", json.dumps({"x": 4}))

    assert asyncio.run(run()) == json.dumps({"double": 8})


def test_tool_registry_unknown_tool():
    async def run():
        registry = ToolRegistry()
        return await registry.execute("nope", "{}")

    assert "error" in asyncio.run(run())


async def test_complete_parses_content_and_tool_calls(monkeypatch):
    def handler(request):
        assert request.url.path == "/v1/chat/completions"
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {
                                        "name": "save_memory",
                                        "arguments": '{"content": "x"}',
                                    },
                                }
                            ],
                        }
                    }
                ]
            },
        )

    client = _transport_client(handler, monkeypatch)
    result = await client.complete([{"role": "user", "content": "hi"}])
    assert result.content is None
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].id == "call_1"
    assert result.tool_calls[0].name == "save_memory"
    assert result.tool_calls[0].arguments == '{"content": "x"}'
    assert result.assistant_message["tool_calls"][0]["function"]["name"] == "save_memory"


async def test_complete_provider_error_raises_llm_provider_error(monkeypatch):
    def handler(request):
        return httpx.Response(400, json={"error": {"message": "invalid api key"}})

    client = _transport_client(handler, monkeypatch)
    with pytest.raises(LLMProviderError, match="invalid api key"):
        await client.complete([{"role": "user", "content": "hi"}])


async def test_embed_returns_embedding(monkeypatch):
    def handler(request):
        assert request.url.path == "/v1/embeddings"
        return httpx.Response(200, json={"data": [{"embedding": [0.1, 0.2, 0.3]}]})

    client = _transport_client(handler, monkeypatch)
    assert await client.embed("hi") == [0.1, 0.2, 0.3]


async def test_embed_provider_error_raises_llm_provider_error(monkeypatch):
    def handler(request):
        return httpx.Response(500, json={"error": {"message": "server exploded"}})

    client = _transport_client(handler, monkeypatch)
    with pytest.raises(LLMProviderError, match="server exploded"):
        await client.embed("hi")
