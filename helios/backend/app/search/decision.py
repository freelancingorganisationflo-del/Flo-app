"""Search decision engine.

Decides whether a user message needs a live web search, honouring the
per-request mode:

- ``auto``: HELIOS decides (default).
- ``web``: always search.
- ``off``: never search.
"""

import re
from typing import Literal

WebSearchMode = Literal["auto", "web", "off"]

VALID_MODES: tuple[str, ...] = ("auto", "web", "off")

_SKIP_WEB = re.compile(
    r"^(hi|hello|hey|thanks|thank you|ok|okay|yo|gm|good morning|"
    r"good afternoon|good evening)\b",
    re.I,
)
_PERSONAL = re.compile(
    r"\b(remind me|create a task|add a task|make (a |me a )?(task|reminder|note)|"
    r"my tasks|remember that|save (a |this )?memory|what do you remember|"
    r"on my plate|mark .+ done|delete (the |this )?(task|reminder)|"
    r"my documents|knowledge base)\b",
    re.I,
)
_CLOCK = re.compile(
    r"\b(what('?s| is)? the time|current time|what time is it|"
    r"time (is it|now|in)|what('?s| is)? (today'?s )?date|today'?s date|"
    r"aaj (kya|kaun ?sa) (din|taareekh|date)|aaj ki (taareekh|date))\b",
    re.I,
)
_EXPLICIT = re.compile(
    r"\b(search (the )?(web|internet|online)|web ?search|google|browse|"
    r"look ?up online|find online|check online)\b",
    re.I,
)
_FOLLOWUP = re.compile(
    r"^\s*(and\b|what about|how about|uska|uski|uske|iska|iski|iske|"
    r"it\b|this\b|that\b|ye\b|yeh\b|wahi|price|cost|rate|kitna|kitne)\b",
    re.I,
)


def normalize_mode(mode: str | None) -> WebSearchMode:
    value = (mode or "auto").strip().lower()
    return value if value in VALID_MODES else "auto"  # type: ignore[return-value]


def decide_web_search(
    message: str,
    mode: str | None = "auto",
    *,
    has_context: bool = False,
) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    resolved = normalize_mode(mode)
    if resolved == "off":
        return False
    if resolved == "web":
        return True

    # auto
    if _EXPLICIT.search(text):
        return True
    if _CLOCK.search(text):
        return False
    if _PERSONAL.search(text):
        return False
    if _SKIP_WEB.search(text) and len(text) < 24:
        return False
    if has_context and _FOLLOWUP.search(text):
        return True
    return True
