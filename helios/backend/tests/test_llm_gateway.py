import json

from app.llm_gateway.client import LLMClient
from app.llm_gateway.tools import Tool, ToolRegistry


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

    import asyncio

    assert asyncio.run(run()) == json.dumps({"double": 8})


def test_tool_registry_unknown_tool():
    import asyncio

    async def run():
        registry = ToolRegistry()
        return await registry.execute("nope", "{}")

    assert "error" in asyncio.run(run())
