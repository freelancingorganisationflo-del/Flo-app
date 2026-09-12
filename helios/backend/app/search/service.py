import logging
import time

from ..config import settings
from .cache import get as cache_get, set as cache_set
from .errors import ProviderNotFoundError, SearchError
from .providers import get_search_provider
from .providers.duckduckgo import unwrap_ddg_url
from .security import is_safe_url

logger = logging.getLogger("helios.search")

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
    cache_key = ("search", provider.name, query, limit)
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    started = time.monotonic()
    try:
        results = await provider.search(query, limit)
    except Exception:
        logger.warning("search failed provider=%s query=%r", provider.name, query)
        raise
    cache_set(cache_key, results, settings.web_search_cache_ttl_seconds)
    logger.info(
        "search provider=%s query=%r results=%d duration=%.2fs",
        provider.name,
        query,
        len(results),
        time.monotonic() - started,
    )
    return results


async def fetch_page(url: str, max_chars: int | None = None) -> dict:
    url = url.strip()
    limit = max_chars or settings.web_fetch_max_chars
    provider = get_search_provider()
    cache_key = ("fetch", provider.name, url, limit)
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    started = time.monotonic()
    try:
        page = await provider.fetch_page(url, limit)
    except Exception:
        logger.warning("fetch failed provider=%s url=%s", provider.name, url)
        raise
    cache_set(cache_key, page, settings.web_search_cache_ttl_seconds)
    logger.info("fetch url=%s chars=%d duration=%.2fs", url, len(page.get("text", "")), time.monotonic() - started)
    return page
