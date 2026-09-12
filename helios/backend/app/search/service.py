from ..config import settings
from .errors import ProviderNotFoundError, SearchError
from .providers import get_search_provider
from .providers.duckduckgo import unwrap_ddg_url
from .security import is_safe_url

__all__ = [
    "ProviderNotFoundError",
    "SearchError",
    "fetch_page",
    "is_safe_url",
    "search_web",
    "unwrap_ddg_url",
]


async def search_web(query: str, max_results: int | None = None) -> list[dict]:
    query = query.strip()
    if not query:
        raise SearchError("Query cannot be empty")
    limit = max_results or settings.web_search_max_results
    provider = get_search_provider()
    return await provider.search(query, limit)


async def fetch_page(url: str, max_chars: int | None = None) -> dict:
    limit = max_chars or settings.web_fetch_max_chars
    provider = get_search_provider()
    return await provider.fetch_page(url.strip(), limit)
