import re

# Emoji + pictographs + symbols (skip common punctuation, keep letters/digits).
_EMOJI_RE = re.compile(
    "["
    "\U0001F000-\U0001FAFF"  # misc symbols & pictographs / emoticons / symbols
    "\U00002600-\U000027BF"  # misc symbols + dingbats
    "\U0001F1E6-\U0001F1FF"  # regional indicators (flags)
    "\U0000FE0F"  # variation selector-16
    "\U00002764"  # heavy black heart (common false positive)
    "\U0001F9B0-\U0001F9B9"  # body parts with tone
    "\U0001F3FB-\U0001F3FF"  # skin tones
    "]+",
    flags=re.UNICODE,
)

_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_CODE_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_MD_HEADING_RE = re.compile(r"(?m)^\s{0,3}#{1,6}\s*")
_MD_QUOTE_RE = re.compile(r"(?m)^\s{0,3}>\s?")
_BULLET_RE = re.compile(r"(?m)^\s*[-*+]\s+")
_NUMBER_BULLET_RE = re.compile(r"(?m)^\s*\d+[.)]\s+")
_MD_RESIDUE_RE = re.compile(r"[*_`~|\\#]")
_INLINE_CODE_RE = re.compile(r"`([^`]*)`")
_WS_RE = re.compile(r"[ \t\u00a0]+")
_MULTI_NL_RE = re.compile(r"\n{3,}")

# Words we never want read aloud (TTS artifacts / conversational fillers).
_SILENT_WORDS = {"•", "…"}


def _clean_lines(text: str) -> str:
    """Process line-by-line so bullet lists read as comma lists, not sentences."""
    lines = text.splitlines()
    cleaned: list[str] = []
    list_buf: list[str] = []

    def flush_list() -> None:
        if list_buf:
            cleaned.append(", ".join(list_buf))
            list_buf.clear()

    for raw in lines:
        line = raw.strip()
        if not line:
            flush_list()
            continue
        if _BULLET_RE.match(raw) or _NUMBER_BULLET_RE.match(raw):
            item = _BULLET_RE.sub("", raw, count=1)
            item = _NUMBER_BULLET_RE.sub("", item, count=1)
            list_buf.append(item.strip().rstrip(".,;"))
            continue
        flush_list()
        cleaned.append(line)
    flush_list()
    return "\n".join(cleaned)


def clean_for_speech(text: str) -> str:
    """Turn assistant text into clean, speakable prose.

    Removes emojis, URLs, markdown syntax, bullets, code fences, and HTML so
    the voice never reads symbols, emoji names, or link junk out loud. Keeps
    words, numbers, and punctuation that aid natural speech.
    """
    if not text:
        return ""
    out = text
    out = _CODE_FENCE_RE.sub(" ", out)
    out = _MD_IMAGE_RE.sub(" ", out)
    out = _MD_LINK_RE.sub(r"\1", out)
    out = _HTML_TAG_RE.sub(" ", out)
    out = _INLINE_CODE_RE.sub(r"\1", out)
    out = _EMOJI_RE.sub(" ", out)
    out = _URL_RE.sub(" ", out)
    out = _EMAIL_RE.sub(" ", out)
    out = _MD_HEADING_RE.sub("", out)
    out = _MD_QUOTE_RE.sub("", out)
    out = _MD_RESIDUE_RE.sub("", out)
    # Remove any leftover silent tokens.
    for word in _SILENT_WORDS:
        out = out.replace(word, " ")
    out = out.replace("\r", " ")
    out = _clean_lines(out)
    # Newlines between prose lines become sentence pauses.
    out = out.replace("\n", ". ")
    # A colon/comma heading shouldn't gain a period: "Tasks:. " -> "Tasks: ".
    out = re.sub(r"([:;,])\.\s", r"\1 ", out)
    out = _WS_RE.sub(" ", out)
    out = _MULTI_NL_RE.sub(" ", out)
    # Collapse repeated punctuation ("!!", "??", "..", ",,") into single marks.
    out = re.sub(r"([.!?,])\1+", r"\1", out)
    out = re.sub(r"\s+([.,!?;:])", r"\1", out)
    out = re.sub(r"\s{2,}", " ", out)
    out = out.strip(" \t\n")
    # Keep a single terminal punctuation mark if present, else strip dangling
    # commas/semicolons at the very end.
    out = re.sub(r"[,;:]+$", "", out)
    # Reduce accidental empty placeholder from markdown links like "(link)".
    out = re.sub(r"\(\)|\[\]|\{\}", " ", out)
    out = re.sub(r"\s{2,}", " ", out).strip()
    return out
