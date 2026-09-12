import re
from abc import ABC, abstractmethod
from typing import Any

from bs4 import BeautifulSoup

from ...rag.extract import extract_text_from_html
from ..security import is_safe_url
from ..errors import SearchError

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def default_headers() -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }


def snippet(text: str, limit: int = 280) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def extract_page(resp: Any, max_chars: int) -> dict[str, Any]:
    """Extract readable text + title from an httpx response, safely."""
    final_url = str(resp.url)
    if not is_safe_url(final_url):
        raise SearchError("URL is not allowed")

    content_type = (resp.headers.get("content-type") or "").lower()
    if "html" in content_type or not content_type:
        text = extract_text_from_html(resp.text)
        soup = BeautifulSoup(resp.text, "html.parser")
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else final_url
    else:
        text = resp.text
        title = final_url
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    truncated = len(text) > max_chars
    if truncated:
        text = text[:max_chars].rstrip() + "…"
    return {"url": final_url, "title": title, "text": text, "truncated": truncated}


class SearchProvider(ABC):
    """Interface every search backend must implement.

    Providers are isolated from the rest of the app so a new backend can be
    added by dropping a module here and selecting it via SEARCH_PROVIDER.
    """

    name: str = "base"

    @abstractmethod
    async def search(self, query: str, max_results: int) -> list[dict[str, Any]]:
        """Return a list of results with at least title/url/snippet/source."""

    @abstractmethod
    async def fetch_page(self, url: str, max_chars: int) -> dict[str, Any]:
        """Fetch a page and return title/url/text/truncated."""
