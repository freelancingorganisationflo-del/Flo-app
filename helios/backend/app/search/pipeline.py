"""Web research pipeline: query rewriting, source gathering and answering.

Provider-independent: the search/fetch callables are injected so this module
can be reused by both the chat flow and the /api/web-search endpoint, and so
tests can stub the network.
"""

import asyncio
import json
from typing import Any
from urllib.parse import urlparse

from ..config import settings
from ..llm_gateway.client import LLMClient
from ..search.errors import SearchError
from .decision import decide_web_search

EVIDENCE_HEADER = (
    "LIVE SOURCES (from a live web search just now; the ONLY allowed source of "
    "facts for this reply):"
)

RESEARCH_ANSWER_RULES = (
    "You are Helios. Answer the user's question using ONLY the supplied sources. "
    "Prefer official, primary and reputable sources. Quote dates, numbers and "
    "names exactly as written. If sources disagree, say so. Clearly distinguish "
    "facts from inference. Cite claims inline with the matching [n] marker and "
    "list sources as markdown links at the end. If the evidence is insufficient, "
    "say you could not verify it from live sources. Never invent facts or URLs."
)

_FETCH_CHAR_LIMIT = 3500


def domain_of(url: str) -> str:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return ""
    return host[4:] if host.startswith("www.") else host


def normalize_source(item: dict[str, Any]) -> dict[str, Any] | None:
    from .security import is_safe_url

    url = (item.get("url") or "").strip()
    if not url or not is_safe_url(url):
        return None
    return {
        "title": (item.get("title") or url).strip(),
        "url": url,
        "domain": domain_of(url),
        "snippet": (item.get("snippet") or "").strip(),
        "source": item.get("source") or "web",
        "published": item.get("published"),
        "fetched": False,
    }


def _format_history(history: list[dict] | None, limit: int = 4) -> list[dict]:
    if not history:
        return []
    turns = [m for m in history if m.get("role") in ("user", "assistant")]
    return [
        {"role": m["role"], "content": (m.get("content") or "")[:300]}
        for m in turns[-limit:]
    ]


async def rewrite_search_query(
    message: str, llm: LLMClient | None, history: list[dict] | None = None
) -> str:
    """Translate/condense the message into an English search query."""
    if llm is None:
        return message
    try:
        result = await llm.complete(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Rewrite the user's message into a short, effective web "
                        "search query in English. Use the conversation context to "
                        "resolve pronouns like it/this/that. Keep names, dates and "
                        "places. Output only the query text, nothing else."
                    ),
                },
                *_format_history(history),
                {"role": "user", "content": message},
            ],
            max_tokens=48,
        )
    except Exception:
        return message
    query = (result.content or "").strip().strip('"').strip()
    if not query:
        return message
    return query.splitlines()[0].strip()[:200] or message


def _build_evidence(sources: list[dict], pages: dict[str, dict]) -> str:
    lines = [EVIDENCE_HEADER]
    for i, src in enumerate(sources, 1):
        lines.append(f"[{i}] {src['title']} - {src['url']}\n    {src['snippet']}")
    for src in sources:
        page = pages.get(src["url"])
        if not page:
            continue
        lines.append(
            f"\n--- FULL PAGE: {page.get('title', src['title'])} ({src['url']})\n"
            f"{page.get('text', '')}"
        )
    return "\n".join(lines)


async def gather_evidence(
    query: str,
    llm: LLMClient | None,
    *,
    history: list[dict] | None = None,
    search_fn,
    fetch_fn,
    max_results: int | None = None,
    max_pages: int = 2,
    fetch_chars: int = _FETCH_CHAR_LIMIT,
) -> dict[str, Any]:
    """Run the search + fetch pipeline and return structured evidence."""
    result: dict[str, Any] = {
        "searched": False,
        "queries": [],
        "sources": [],
        "evidence": "",
        "tool_events": [],
    }
    search_query = await rewrite_search_query(query, llm, history)
    try:
        raw = await search_fn(
            search_query, max_results=max_results or settings.web_search_max_results
        )
    except SearchError:
        return result
    if not raw:
        return result

    seen: set[str] = set()
    sources: list[dict] = []
    for item in raw:
        src = normalize_source(item)
        if src is None or src["url"] in seen:
            continue
        seen.add(src["url"])
        sources.append(src)
    if not sources:
        return result

    result["searched"] = True
    result["queries"] = [search_query]
    result["tool_events"].append(
        {"name": "web_search", "arguments": json.dumps({"query": search_query})}
    )

    pages: dict[str, dict] = {}

    async def _fetch(src: dict) -> tuple[str, dict | None]:
        try:
            page = await fetch_fn(src["url"], max_chars=fetch_chars)
        except SearchError:
            return src["url"], None
        return src["url"], page

    fetched = await asyncio.gather(*[_fetch(s) for s in sources[:max_pages]])
    for url, page in fetched:
        if not page:
            continue
        pages[url] = page
        result["tool_events"].append(
            {"name": "fetch_url", "arguments": json.dumps({"url": url})}
        )
    for src in sources:
        if src["url"] in pages:
            src["fetched"] = True

    result["sources"] = sources
    result["evidence"] = _build_evidence(sources, pages)
    return result


async def answer_from_evidence(
    query: str,
    evidence: str,
    llm: LLMClient,
    *,
    history: list[dict] | None = None,
    max_tokens: int | None = None,
) -> str:
    messages = [
        {"role": "system", "content": RESEARCH_ANSWER_RULES + "\n\n" + evidence},
        *_format_history(history),
        {"role": "user", "content": query},
    ]
    result = await llm.complete(
        messages, max_tokens=max_tokens or settings.user_llm_max_tokens
    )
    return result.content or ""


def should_search(
    message: str, mode: str | None, history: list[dict] | None = None
) -> bool:
    return decide_web_search(message, mode, has_context=bool(history))
