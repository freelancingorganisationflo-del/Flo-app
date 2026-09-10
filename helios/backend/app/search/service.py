import re
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from bs4 import BeautifulSoup

from ..config import settings
from ..rag.extract import extract_text_from_html

DDG_HTML = "https://html.duckduckgo.com/html/"
DDG_IA = "https://api.duckduckgo.com/"

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

BLOCKED_HOSTS = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "metadata.google.internal",
}

_PRIVATE_HOST = re.compile(
    r"^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.|0\.)"
)


class SearchError(ValueError):
    pass


def _headers() -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }


def _snippet(text: str, limit: int = 280) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def is_safe_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if parsed.username or parsed.password:
        return False
    host = (parsed.hostname or "").lower()
    if not host or host in BLOCKED_HOSTS:
        return False
    if host.endswith(".local") or host.endswith(".internal"):
        return False
    if _PRIVATE_HOST.match(host):
        return False
    return True


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


async def search_web(query: str, max_results: int | None = None) -> list[dict]:
    query = query.strip()
    if not query:
        raise SearchError("Query cannot be empty")
    limit = max_results or settings.web_search_max_results
    timeout = settings.web_search_timeout_seconds
    results: list[dict] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        instant = await _instant_answer(client, query)
        if instant:
            results.append(instant)
            if instant["url"]:
                seen.add(instant["url"])
        try:
            html_results = await _html_search(client, query, limit)
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


async def _instant_answer(client: httpx.AsyncClient, query: str) -> dict | None:
    try:
        resp = await client.get(
            DDG_IA,
            params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
            headers=_headers(),
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
            "snippet": _snippet(str(abstract)),
            "source": "instant",
        }
    answer = data.get("Answer") or ""
    if answer:
        return {
            "title": heading or query,
            "url": url or f"https://duckduckgo.com/?q={query}",
            "snippet": _snippet(str(answer)),
            "source": "instant",
        }
    return None


async def _html_search(client: httpx.AsyncClient, query: str, limit: int) -> list[dict]:
    try:
        resp = await client.post(
            DDG_HTML,
            data={"q": query},
            headers={**_headers(), "Content-Type": "application/x-www-form-urlencoded"},
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
        snippet = snippet_el.get_text(" ", strip=True) if snippet_el else ""
        title = link.get_text(" ", strip=True)
        items.append(
            {
                "title": title or href,
                "url": href,
                "snippet": _snippet(snippet),
                "source": "web",
            }
        )
        if len(items) >= limit:
            break
    return items


async def fetch_page(url: str, max_chars: int | None = None) -> dict:
    url = url.strip()
    if not is_safe_url(url):
        raise SearchError("URL is not allowed")
    limit = max_chars or settings.web_fetch_max_chars
    timeout = settings.web_search_timeout_seconds
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers=_headers())
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise SearchError(f"Page returned HTTP {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise SearchError(f"Could not fetch page: {exc}") from exc

    if not is_safe_url(str(resp.url)):
        raise SearchError("URL is not allowed")

    content_type = (resp.headers.get("content-type") or "").lower()
    if "html" in content_type or not content_type:
        text = extract_text_from_html(resp.text)
        soup = BeautifulSoup(resp.text, "html.parser")
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else url
    else:
        text = resp.text
        title = url
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    truncated = len(text) > limit
    if truncated:
        text = text[:limit].rstrip() + "…"
    return {"url": str(resp.url), "title": title, "text": text, "truncated": truncated}
