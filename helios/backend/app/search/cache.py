"""Tiny in-process TTL cache for search/fetch results (cost control)."""

import copy
import time
from typing import Any

_CACHE: dict[tuple, tuple[float, Any]] = {}


def get(key: tuple) -> Any | None:
    entry = _CACHE.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if expires_at < time.monotonic():
        _CACHE.pop(key, None)
        return None
    return copy.deepcopy(value)


def set(key: tuple, value: Any, ttl_seconds: float) -> None:
    if ttl_seconds <= 0:
        return
    _CACHE[key] = (time.monotonic() + ttl_seconds, copy.deepcopy(value))


def clear() -> None:
    _CACHE.clear()
