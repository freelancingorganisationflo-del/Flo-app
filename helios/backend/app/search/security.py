import re
from urllib.parse import urlparse

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


def is_safe_url(url: str) -> bool:
    """Return True only for public http(s) URLs (basic SSRF protection)."""
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
