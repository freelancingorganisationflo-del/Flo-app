import pytest
import pytest_asyncio

from app.deps import get_llm
from app.llm_gateway.client import ChatResult, LLMClient, LLMProviderError
from app.llm_gateway.routing import classify_task, route_model
from app.main import app


class FakeRoutingLLM(LLMClient):
    def __init__(self) -> None:
        super().__init__()
        self.last_model: str | None = None
        self.fail_first_with_model: str | None = None

    async def complete(self, messages, tools=None, model=None):
        self.last_model = model
        if self.fail_first_with_model and model == self.fail_first_with_model:
            self.fail_first_with_model = None
            raise LLMProviderError("402 provider error")
        last = messages[-1]
        return ChatResult(content=f"Echo: {last['content']}", tool_calls=[])


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "r@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest_asyncio.fixture
async def fake_llm(client):
    fake = FakeRoutingLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


def test_classify_coding():
    assert classify_task("Fix this bug in my React component") == "coding"


def test_classify_scripting():
    assert classify_task("Write a bash script to automate backup") == "scripting"


def test_classify_reasoning():
    assert classify_task("Solve this math equation step by step") == "reasoning"


def test_classify_writing():
    assert classify_task("Draft an email to my boss") == "writing"


def test_classify_general_chat():
    assert classify_task("How are you today?") is None


def test_route_model_coding():
    assert route_model("Write code to fix the bug") == "anthropic/claude-haiku-4.5"


def test_route_model_scripting():
    assert route_model("Make a script to automate downloads") == "openai/gpt-4o-mini"


def test_route_model_general_uses_default():
    assert route_model("hi") is None


async def test_chat_auto_routes_coding_task(authed_client, fake_llm):
    client, headers = authed_client
    resp = await client.post(
        "/api/chat", json={"message": "Fix the bug in my code"}, headers=headers
    )
    assert resp.status_code == 200
    assert fake_llm.last_model == "anthropic/claude-haiku-4.5"


async def test_chat_auto_routes_default_string(authed_client, fake_llm):
    client, headers = authed_client
    resp = await client.post(
        "/api/chat",
        json={"message": "Draft a cover letter", "model": "default"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert fake_llm.last_model == "openai/gpt-4o-mini"


async def test_chat_falls_back_to_default_when_routed_model_fails(authed_client, fake_llm):
    client, headers = authed_client
    fake_llm.fail_first_with_model = "anthropic/claude-haiku-4.5"
    resp = await client.post(
        "/api/chat", json={"message": "Fix the bug in my code"}, headers=headers
    )
    assert resp.status_code == 200
    assert fake_llm.last_model is None
