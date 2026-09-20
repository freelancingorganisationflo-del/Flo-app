import json

from app.config import settings


def test_system_prompt_clock_includes_utc_and_local_timezone():
    from app.chat.service import _system_prompt

    prompt = _system_prompt()
    assert "Current real date and time:" in prompt
    assert "UTC" in prompt
    assert settings.default_timezone in prompt
    # The model is told the clock is authoritative and must not be guessed.
    assert "never guess" in prompt.lower()


def test_clock_lines_respect_default_timezone(monkeypatch):
    from app.chat.service import _clock_lines

    monkeypatch.setattr(settings, "default_timezone", "Asia/Kolkata")
    assert "Asia/Kolkata" in _clock_lines()

    monkeypatch.setattr(settings, "default_timezone", "Not/AZone")
    # Invalid zone falls back to UTC instead of raising.
    assert "UTC" in _clock_lines()


async def test_current_datetime_tool_defaults_to_configured_timezone(db_session, monkeypatch):
    from app.chat.service import build_registry

    monkeypatch.setattr(settings, "default_timezone", "Asia/Kolkata")
    registry = build_registry(db_session, 1, object())
    out = json.loads(await registry.execute("current_datetime", "{}"))
    assert out["timezone"] == "Asia/Kolkata"
    assert "iso" in out and "human" in out
