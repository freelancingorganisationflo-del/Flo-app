from ...config import settings
from ..errors import ProviderNotFoundError
from .base import SearchProvider, default_headers, extract_page, snippet
from .duckduckgo import DuckDuckGoProvider

_PROVIDERS: dict[str, type[SearchProvider]] = {
    "duckduckgo": DuckDuckGoProvider,
}

_instances: dict[str, SearchProvider] = {}


def get_search_provider(name: str | None = None) -> SearchProvider:
    key = (name or settings.search_provider or "duckduckgo").strip().lower()
    cls = _PROVIDERS.get(key)
    if cls is None:
        available = ", ".join(sorted(_PROVIDERS))
        raise ProviderNotFoundError(
            f"Unknown search provider '{key}'. Available: {available}"
        )
    if key not in _instances:
        _instances[key] = cls()
    return _instances[key]


__all__ = [
    "SearchProvider",
    "DuckDuckGoProvider",
    "default_headers",
    "extract_page",
    "snippet",
    "get_search_provider",
]
