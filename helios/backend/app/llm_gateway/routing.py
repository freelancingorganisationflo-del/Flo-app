import re

from ..config import settings

CATEGORY_KEYWORDS: dict[str, set[str]] = {
    "coding": {
        "bug",
        "debug",
        "refactor",
        "function",
        "class",
        "api",
        "endpoint",
        "react",
        "flask",
        "django",
        "sql",
        "html",
        "css",
        "docker",
        "deploy",
        "pytest",
        "exception",
        "traceback",
        "compile",
        "variable",
        "component",
        "typescript",
        "javascript",
        "interface",
        "algorithm",
        "regression",
        "migration",
    },
    "scripting": {
        "script",
        "automation",
        "automate",
        "bash",
        "shell",
        "cron",
        "parse",
        "scrape",
        "crawl",
        "convert",
        "transform",
        "rename",
        "cleanup",
        "backup",
        "download",
        "extract",
        "merge",
    },
    "reasoning": {
        "solve",
        "calculate",
        "compute",
        "math",
        "equation",
        "prove",
        "logic",
        "reason",
        "puzzle",
        "probability",
        "statistics",
        "derive",
        "sequence",
    },
    "writing": {
        "essay",
        "email",
        "letter",
        "blog",
        "article",
        "story",
        "poem",
        "summarize",
        "summary",
        "rewrite",
        "draft",
        "headline",
        "caption",
        "proofread",
        "resume",
        "cv",
        "translation",
    },
}

MODEL_BY_CATEGORY: dict[str, str] = {
    "coding": "anthropic/claude-haiku-4.5",
    "scripting": "openai/gpt-4o-mini",
    "reasoning": "deepseek/deepseek-chat",
    "writing": "openai/gpt-4o-mini",
}

_WORD_RE = re.compile(r"[a-z]+")


def classify_task(message: str) -> str | None:
    """Return the best-matching task category or None for general chat."""
    words = set(_WORD_RE.findall(message.lower()))
    if not words:
        return None
    best: str | None = None
    best_score = 0
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = len(words & keywords)
        if score > best_score:
            best = category
            best_score = score
    return best if best_score > 0 else None


def route_model(message: str) -> str | None:
    """Pick the best model for a message, or None to use the default model."""
    if not settings.llm_auto_route:
        return None
    category = classify_task(message)
    if category is None:
        return None
    candidate = MODEL_BY_CATEGORY.get(category)
    if candidate and candidate in settings.user_llm_available_models:
        return candidate
    return None
