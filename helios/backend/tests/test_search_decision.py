from app.search.decision import decide_web_search, normalize_mode


def test_mode_off_never_searches():
    assert decide_web_search("Who is the president of France?", "off") is False
    assert decide_web_search("hi", "off") is False


def test_mode_web_always_searches():
    assert decide_web_search("hi", "web") is True
    assert decide_web_search("latest news", "web") is True


def test_auto_skips_smalltalk_and_clock():
    assert decide_web_search("hello", "auto") is False
    assert decide_web_search("thanks", "auto") is False
    assert decide_web_search("what is the current time in usa", "auto") is False


def test_auto_searches_short_factual_queries():
    assert decide_web_search("Neet exam date", "auto") is True
    assert decide_web_search("modi", "auto") is True


def test_explicit_trigger_searches_even_in_auto():
    assert decide_web_search("please search the web for this", "auto") is True
    assert decide_web_search("google the best laptop", "auto") is True


def test_followup_search_with_context():
    assert decide_web_search("how much does it cost?", "auto", has_context=True) is True
    assert decide_web_search("uska price kya hai", "auto", has_context=True) is True


def test_normalize_mode_falls_back_to_auto():
    assert normalize_mode(None) == "auto"
    assert normalize_mode("WEB") == "web"
    assert normalize_mode("bogus") == "auto"
