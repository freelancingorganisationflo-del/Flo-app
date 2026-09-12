from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from bs4 import BeautifulSoup

from ...config import settings
from ..errors import SearchError
from ..security import is_safe_url
from .base import SearchProvider, default_headers, extract_page, snippet

DDG_HTML = "https://html.duckduckgo.com/html/"
DDG_IA = "https://api.duckduckgo.com/"


def unwrap_ddg_url(href: str) -> str:
    if not href:
        return href
    if href.startswith("//"):
        href = "https:" + href
    parsed = urlparse(href)
    host = (parsed.netloc or "").lower()
    if "duckduckgo.com" in host and parsed.path.startswith("/l/"):
        qs = parse_qs(parsed.query)
        if "uddg" in qs:
            return unquote(qs["uddg"][0])
    return href


class DuckDuckGoProvider(SearchProvider):
    name = "duckduckgo"

    async def search(self, query: str, max_results: int) -> list[dict[str, Any]]:
        query = query.strip()
        if not query:
            raise SearchError("Query cannot be empty")
        limit = max_results
        timeout = settings.web_search_timeout_seconds
        results: list[dict[str, Any]] = []
        seen: set[str] = set()

        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            instant = await self._instant_answer(client, query)
            if instant:
                results.append(instant)
                if instant["url"]:
                    seen.add(instant["url"])
            try:
                html_results = await self._html_search(client, query, limit)
            except SearchError:
                html_results = []
            for item in html_results:
                if item["url"] in seen:
                    continue
                seen.add(item["url"])
                results.append(item)
                if len(results) >= limit:
                    break
        return results[:limit]

    async def fetch_page(self, url: str, max_chars: int) -> dict[str, Any]:
        url = url.strip()
        if not is_safe_url(url):
            raise SearchError("URL is not allowed")
        timeout = settings.web_search_timeout_seconds
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.get(url, headers=default_headers())
                resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise SearchError(f"Page returned HTTP {exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            raise SearchError(f"Could not fetch page: {exc}") from exc
        return extract_page(resp, max_chars)

    async def _instant_answer(self, client: httpx.AsyncClient, query: str) -> dict | None:
        try:
            resp = await client.get(
                DDG_IA,
                params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
                headers=default_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError):
            return None
        if not isinstance(data, dict):
            return None
        heading = data.get("Heading") or ""
        abstract = data.get("AbstractText") or data.get("Abstract") or ""
        url = data.get("AbstractURL") or ""
        if abstract and url:
            return {
                "title": heading or url,
                "url": url,
                "snippet": snippet(str(abstract)),
                "source": "instant",
            }
        answer = data.get("Answer") or ""
        if answer:
            return {
                "title": heading or query,
                "url": url or f"https://duckduckgo.com/?q={query}",
                "snippet": snippet(str(answer)),
                "source": "instant",
            }
        return None

    async def _html_search(
        self, client: httpx.AsyncClient, query: str, limit: int
    ) -> list[dict]:
        try:
            resp = await client.get(
                DDG_HTML,
                params={"q": query},
                headers=default_headers(),
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise SearchError(f"Web search failed: {exc}") from exc

        soup = BeautifulSoup(resp.text, "html.parser")
        items: list[dict] = []
        for result in soup.select(".result"):
            link = result.select_one("a.result__a")
            if link is None:
                continue
            href = unwrap_ddg_url(link.get("href") or "")
            if not href or not is_safe_url(href):
                continue
            snippet_el = result.select_one(".result__snippet")
            snippet_text = snippet_el.get_text(" ", strip=True) if snippet_el else ""
            ts_el = result.select_one(".result__timestamp")
            published = ts_el.get_text(" ", strip=True) if ts_el else None
            title = link.get_text(" ", strip=True)
            items.append(
                {
                    "title": title or href,
                    "url": href,
                    "snippet": snippet(snippet_text),
                    "source": "web",
                    "published": published,
                }
            )
            if len(items) >= limit:
                break
        return items
