from app.llm_gateway.client import LLMClient
from app.llm_gateway.profiles import public_routes, resolve_route, resolve_stt, resolve_tts


def test_resolve_route_falls_back_to_user_llm(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "user_llm_api_key", "legacy-key")
    monkeypatch.setattr(settings, "user_llm_base_url", "https://api.openai.com/v1")
    monkeypatch.setattr(settings, "user_llm_model", "gpt-4o-mini")
    monkeypatch.setattr(settings, "general_llm_api_key", "")
    monkeypatch.setattr(settings, "automation_llm_api_key", "")
    monkeypatch.setattr(settings, "code_llm_api_key", "")

    general = resolve_route("general")
    automation = resolve_route("automation")
    code = resolve_route("code")
    assert general.api_key == "legacy-key"
    assert automation.api_key == "legacy-key"
    assert code.api_key == "legacy-key"
    assert general.key_env == "USER_LLM_API_KEY"
    assert automation.task == "automation"
    assert code.task == "code"


def test_resolve_route_uses_task_specific_key(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "user_llm_api_key", "legacy-key")
    monkeypatch.setattr(settings, "general_llm_api_key", "general-key")
    monkeypatch.setattr(settings, "automation_llm_api_key", "auto-key")
    monkeypatch.setattr(settings, "code_llm_api_key", "code-key")
    monkeypatch.setattr(settings, "general_llm_model", "general-model")
    monkeypatch.setattr(settings, "automation_llm_model", "auto-model")
    monkeypatch.setattr(settings, "code_llm_model", "code-model")
    monkeypatch.setattr(settings, "general_llm_base_url", "https://openrouter.ai/api/v1")
    monkeypatch.setattr(settings, "automation_llm_base_url", "https://api.groq.com/openai/v1")
    monkeypatch.setattr(settings, "code_llm_base_url", "https://api.openai.com/v1")

    general = resolve_route("general")
    automation = resolve_route("automation")
    code = resolve_route("code")
    assert general.api_key == "general-key"
    assert automation.api_key == "auto-key"
    assert code.api_key == "code-key"
    assert general.model == "general-model"
    assert automation.model == "auto-model"
    assert code.model == "code-model"
    assert general.key_env == "GENERAL_LLM_API_KEY"
    assert automation.key_env == "AUTOMATION_LLM_API_KEY"
    assert code.key_env == "CODE_LLM_API_KEY"
    assert general.provider == "openrouter"
    assert automation.provider == "groq"


def test_embedding_route_is_independent(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "user_llm_api_key", "legacy-key")
    monkeypatch.setattr(settings, "embedding_api_key", "embed-key")
    monkeypatch.setattr(settings, "embedding_base_url", "https://api.openai.com/v1")
    monkeypatch.setattr(settings, "embedding_model", "text-embedding-3-large")

    route = resolve_route("general")
    assert route.embedding_api_key == "embed-key"
    assert route.embedding_model == "text-embedding-3-large"
    assert route.embedding_key_env == "EMBEDDING_API_KEY"


def test_stt_tts_independent_of_generation(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "user_llm_api_key", "legacy-key")
    monkeypatch.setattr(settings, "stt_api_key", "stt-key")
    monkeypatch.setattr(settings, "tts_api_key", "tts-key")
    monkeypatch.setattr(settings, "stt_model", "whisper-custom")
    monkeypatch.setattr(settings, "tts_model", "tts-custom")

    stt = resolve_stt()
    tts = resolve_tts()
    assert stt.api_key == "stt-key"
    assert tts.api_key == "tts-key"
    assert stt.model == "whisper-custom"
    assert tts.model == "tts-custom"
    assert stt.key_env == "STT_API_KEY"
    assert tts.key_env == "TTS_API_KEY"


def test_public_routes_never_include_keys(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "user_llm_api_key", "secret-should-not-leak")
    monkeypatch.setattr(settings, "general_llm_api_key", "also-secret")
    payload = public_routes()
    blob = str(payload)
    assert "secret-should-not-leak" not in blob
    assert "also-secret" not in blob
    assert payload["llm"][0]["configured"] is True
    assert "task" in payload["llm"][0]
    assert "provider" in payload["llm"][0]
    assert "model" in payload["llm"][0]


def test_llm_client_uses_task_route(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "user_llm_api_key", "legacy-key")
    monkeypatch.setattr(settings, "code_llm_api_key", "code-key")
    monkeypatch.setattr(settings, "code_llm_model", "code-model")
    client = LLMClient(task="code")
    assert client.task == "code"
    assert client.api_key == "code-key"
    assert client.model == "code-model"


async def test_providers_endpoint(client):
    resp = await client.get("/api/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert "llm" in data and "voice" in data
    tasks = {item["task"] for item in data["llm"]}
    assert tasks == {"general", "automation", "code"}
    blob = str(data)
    assert "api_key" not in blob
    assert "USER_LLM_API_KEY" not in blob
