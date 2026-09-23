"""When should Helios Code hit the live web?

Chat's decision engine defaults to searching for almost every factual
question. That would make every coding request slow and noisy, so coding uses
its own narrower rule: in ``auto`` mode only look things up that plausibly
changed since the model was trained, or that the user explicitly asked to
search for.
"""

import re

from ..search.decision import normalize_mode

_EXPLICIT = re.compile(
    r"\b(search (the )?(web|internet|online)|web ?search|google|browse|"
    r"look ?up online|find online|check online)\b",
    re.I,
)

_LIVE = re.compile(
    r"\b(latest|newest|current version|release notes|"
    r"changelog|docs|documentation|api reference|error|exception|traceback|"
    r"stack ?trace|not working|doesn'?t work|broken|deprecat\w*|breaking change|"
    r"upgrade|migrat\w*|cve|security advis\w*|price|pricing)\b",
    re.I,
)


def should_search_code(message: str, mode: str | None = "auto") -> bool:
    resolved = normalize_mode(mode)
    if resolved == "off":
        return False
    if resolved == "web":
        return True
    text = (message or "").strip()
    if not text:
        return False
    return bool(_EXPLICIT.search(text) or _LIVE.search(text))
