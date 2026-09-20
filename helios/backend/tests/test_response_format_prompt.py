from app.chat.service import _system_prompt
from app.search.pipeline import RESEARCH_ANSWER_RULES
from app.vision.client import VISION_SYSTEM_PROMPT


def test_chat_prompt_contains_response_format_guidance():
    prompt = _system_prompt()
    assert "RESPONSE FORMAT" in prompt
    for marker in (
        "Markdown table",
        "numbered list",
        "bullet list",
        "checkbox list",
        "fenced code block",
        "```chart",
        "Never output raw HTML",
    ):
        assert marker in prompt


def test_chat_prompt_chart_json_is_well_formed():
    prompt = _system_prompt()
    assert '"type":"bar|line|pie|scatter"' in prompt
    assert '"datasets"' in prompt


def test_research_prompt_requires_formatting_and_sources():
    assert "FORMAT THE ANSWER" in RESEARCH_ANSWER_RULES
    assert "Markdown table" in RESEARCH_ANSWER_RULES
    assert "```chart" in RESEARCH_ANSWER_RULES
    assert "never invent" in RESEARCH_ANSWER_RULES.lower()
    assert "Do not output raw HTML" in RESEARCH_ANSWER_RULES


def test_vision_prompt_supports_structured_output():
    assert "bullet lists" in VISION_SYSTEM_PROMPT
    assert "Markdown table" in VISION_SYSTEM_PROMPT
    assert "Never output raw HTML" in VISION_SYSTEM_PROMPT
