import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

ToolHandler = Callable[..., Awaitable[str]]


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    handler: ToolHandler


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def schema(self) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            }
            for tool in self._tools.values()
        ]

    async def execute(self, name: str, arguments: str) -> str:
        tool = self._tools.get(name)
        if tool is None:
            return json.dumps({"error": f"Unknown tool: {name}"})
        try:
            args: dict[str, Any] = json.loads(arguments or "{}")
        except json.JSONDecodeError:
            args = {}
        try:
            return await tool.handler(**args)
        except Exception as exc:
            return json.dumps({"error": str(exc)})
