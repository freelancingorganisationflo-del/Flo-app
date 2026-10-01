from dataclasses import dataclass, field
from urllib.parse import urlparse

from ..config import settings

PLACEHOLDERS = {"", "your-api-key-here", "changeme", "change-me", "changeme-to-a-long-random-string"}


def _clean(value: str | None) -> str:
    text = (value or "").strip()
    if text.lower() in PLACEHOLDERS:
        return ""
    return text


def infer_provider(name: str, url: str) -> str:
    explicit = _clean(name).lower()
    if explicit:
        return explicit
    host = (urlparse(url).hostname or "").lower()
    if "openrouter.ai" in host:
        return "openrouter"
    if "groq.com" in host:
        return "groq"
    if "dashscope" in host or "aliyuncs" in host:
        return "qwen"
    if "openai.com" in host:
        return "openai"
    if host in {"localhost", "127.0.0.1"}:
        return "local"
    return "openai-compatible"


def public_host(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc or parsed.path or url


@dataclass(frozen=True)
class LLMRoute:
    task: str
    provider: str
    api_key: str
    base_url: str
    model: str
    fallback_model: str = ""
    available_models: list[str] = field(default_factory=list)
    embedding_provider: str = ""
    embedding_api_key: str = ""
    embedding_base_url: str = ""
    embedding_model: str = ""
    key_env: str = "USER_LLM_API_KEY"
    embedding_key_env: str = "USER_LLM_API_KEY"


@dataclass(frozen=True)
class VoiceRoute:
    kind: str
    provider: str
    api_key: str
    base_url: str
    model: str
    key_env: str


def _legacy_base_url() -> str:
    return _clean(settings.user_llm_base_url) or "https://api.openai.com/v1"


def _legacy_key() -> str:
    return _clean(settings.user_llm_api_key)


def _legacy_model() -> str:
    return _clean(settings.user_llm_model) or "gpt-4o-mini"


def _legacy_available() -> list[str]:
    models = [m for m in (settings.user_llm_available_models or []) if _clean(m)]
    default = _legacy_model()
    if default and default not in models:
        models = [default, *models]
    return models or [default]


def _with_model(models: list[str], model: str) -> list[str]:
    out = [m for m in models if _clean(m)]
    if model and model not in out:
        out = [model, *out]
    return out


def resolve_route(task: str = "general") -> LLMRoute:
    name = (task or "general").strip().lower()
    if name not in {"general", "automation", "code"}:
        name = "general"

    legacy_key = _legacy_key()
    legacy_url = _legacy_base_url()
    legacy_model = _legacy_model()
    legacy_available = _legacy_available()
    legacy_provider = infer_provider("", legacy_url)

    general_key = _clean(settings.general_llm_api_key) or legacy_key
    general_url = _clean(settings.general_llm_base_url) or legacy_url
    general_model = _clean(settings.general_llm_model) or legacy_model
    general_provider = infer_provider(settings.general_llm_provider, general_url)
    general_available = _with_model(
        [m for m in (settings.general_llm_available_models or []) if _clean(m)] or legacy_available,
        general_model,
    )
    general_fallback = _clean(settings.general_llm_fallback_model)
    general_key_env = "GENERAL_LLM_API_KEY" if _clean(settings.general_llm_api_key) else "USER_LLM_API_KEY"

    embed_key = _clean(settings.embedding_api_key) or general_key
    embed_url = _clean(settings.embedding_base_url) or general_url
    embed_model = _clean(settings.embedding_model) or _clean(settings.user_llm_embedding_model) or "text-embedding-3-small"
    embed_provider = infer_provider(settings.embedding_provider, embed_url)
    embed_key_env = "EMBEDDING_API_KEY" if _clean(settings.embedding_api_key) else general_key_env

    if name == "automation":
        key = _clean(settings.automation_llm_api_key) or general_key
        url = _clean(settings.automation_llm_base_url) or general_url
        model = _clean(settings.automation_llm_model) or general_model
        provider = infer_provider(settings.automation_llm_provider, url)
        fallback = _clean(settings.automation_llm_fallback_model) or general_fallback
        key_env = (
            "AUTOMATION_LLM_API_KEY"
            if _clean(settings.automation_llm_api_key)
            else general_key_env
        )
        available = _with_model([model] if model else [], model)
        return LLMRoute(
            task="automation",
            provider=provider,
            api_key=key,
            base_url=url,
            model=model,
            fallback_model=fallback,
            available_models=available,
            embedding_provider=embed_provider,
            embedding_api_key=embed_key,
            embedding_base_url=embed_url,
            embedding_model=embed_model,
            key_env=key_env,
            embedding_key_env=embed_key_env,
        )

    if name == "code":
        key = _clean(settings.code_llm_api_key) or general_key
        url = _clean(settings.code_llm_base_url) or general_url
        model = _clean(settings.code_llm_model) or general_model
        provider = infer_provider(settings.code_llm_provider, url)
        fallback = _clean(settings.code_llm_fallback_model) or general_fallback
        key_env = "CODE_LLM_API_KEY" if _clean(settings.code_llm_api_key) else general_key_env
        available = _with_model(
            [m for m in (settings.code_llm_available_models or []) if _clean(m)] or general_available,
            model,
        )
        return LLMRoute(
            task="code",
            provider=provider,
            api_key=key,
            base_url=url,
            model=model,
            fallback_model=fallback,
            available_models=available,
            embedding_provider=embed_provider,
            embedding_api_key=embed_key,
            embedding_base_url=embed_url,
            embedding_model=embed_model,
            key_env=key_env,
            embedding_key_env=embed_key_env,
        )

    return LLMRoute(
        task="general",
        provider=general_provider or legacy_provider,
        api_key=general_key,
        base_url=general_url,
        model=general_model,
        fallback_model=general_fallback,
        available_models=general_available,
        embedding_provider=embed_provider,
        embedding_api_key=embed_key,
        embedding_base_url=embed_url,
        embedding_model=embed_model,
        key_env=general_key_env,
        embedding_key_env=embed_key_env,
    )


def resolve_stt() -> VoiceRoute:
    url = _clean(settings.stt_base_url) or _legacy_base_url()
    key = _clean(settings.stt_api_key) or _legacy_key()
    model = _clean(settings.stt_model) or _clean(settings.user_stt_model) or "openai/whisper-1"
    key_env = "STT_API_KEY" if _clean(settings.stt_api_key) else "USER_LLM_API_KEY"
    return VoiceRoute(
        kind="stt",
        provider=infer_provider(settings.stt_provider, url),
        api_key=key,
        base_url=url,
        model=model,
        key_env=key_env,
    )


def resolve_tts() -> VoiceRoute:
    url = _clean(settings.tts_base_url) or _legacy_base_url()
    key = _clean(settings.tts_api_key) or _legacy_key()
    model = _clean(settings.tts_model) or _clean(settings.user_tts_model) or "deepgram/flux-tts:free"
    key_env = "TTS_API_KEY" if _clean(settings.tts_api_key) else "USER_LLM_API_KEY"
    return VoiceRoute(
        kind="tts",
        provider=infer_provider(settings.tts_provider, url),
        api_key=key,
        base_url=url,
        model=model,
        key_env=key_env,
    )


def public_routes() -> dict:
    routes = []
    for task in ("general", "automation", "code"):
        route = resolve_route(task)
        routes.append(
            {
                "task": route.task,
                "provider": route.provider,
                "model": route.model,
                "fallback_model": route.fallback_model or None,
                "configured": bool(route.api_key),
                "host": public_host(route.base_url),
            }
        )
    general = resolve_route("general")
    stt = resolve_stt()
    tts = resolve_tts()
    voice = [
        {
            "task": "stt",
            "provider": stt.provider,
            "model": stt.model,
            "configured": bool(stt.api_key),
            "host": public_host(stt.base_url),
        },
        {
            "task": "tts",
            "provider": tts.provider,
            "model": tts.model,
            "configured": bool(tts.api_key) or tts.provider in {"edge", "edge-tts"},
            "host": public_host(tts.base_url),
        },
        {
            "task": "embedding",
            "provider": general.embedding_provider,
            "model": general.embedding_model,
            "configured": bool(general.embedding_api_key),
            "host": public_host(general.embedding_base_url),
        },
    ]
    return {"llm": routes, "voice": voice}
