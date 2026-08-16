from datetime import datetime

import pytest

from app.tasks.recurrence import next_occurrence


def test_daily_default_midnight():
    after = datetime(2026, 8, 16, 10, 0)
    assert next_occurrence({"freq": "daily"}, after) == datetime(2026, 8, 17, 0, 0)


def test_daily_with_time_and_interval():
    after = datetime(2026, 8, 16, 10, 0)
    rule = {"freq": "daily", "interval": 2, "time": "08:00"}
    assert next_occurrence(rule, after) == datetime(2026, 8, 18, 8, 0)


def test_weekly_skips_to_next_matching_day():
    after = datetime(2026, 8, 17, 9, 0)  # Monday
    rule = {"freq": "weekly", "by_day": [1], "time": "08:00"}
    assert next_occurrence(rule, after) == datetime(2026, 8, 24, 8, 0)


def test_weekly_same_day_before_time():
    after = datetime(2026, 8, 17, 7, 0)  # Monday, before 08:00
    rule = {"freq": "weekly", "by_day": [1], "time": "08:00"}
    assert next_occurrence(rule, after) == datetime(2026, 8, 17, 8, 0)


def test_weekly_multiple_days_picks_nearest():
    after = datetime(2026, 8, 19, 12, 0)  # Wednesday
    rule = {"freq": "weekly", "by_day": [1, 5], "time": "00:00"}
    assert next_occurrence(rule, after) == datetime(2026, 8, 21, 0, 0)  # Friday


def test_monthly():
    after = datetime(2026, 8, 16, 12, 0)
    rule = {"freq": "monthly", "by_day": [1], "time": "09:00"}
    assert next_occurrence(rule, after) == datetime(2026, 9, 1, 9, 0)


def test_monthly_clamps_short_months():
    after = datetime(2026, 1, 31, 12, 0)
    rule = {"freq": "monthly", "by_day": [31], "time": "00:00"}
    assert next_occurrence(rule, after) == datetime(2026, 2, 28, 0, 0)


def test_daily_same_day_before_time():
    after = datetime(2026, 8, 16, 8, 0)
    rule = {"freq": "daily", "time": "09:00"}
    assert next_occurrence(rule, after) == datetime(2026, 8, 16, 9, 0)


def test_weekly_interval_skips_weeks():
    after = datetime(2026, 8, 17, 9, 0)  # Monday
    rule = {"freq": "weekly", "by_day": [1], "time": "08:00", "interval": 2}
    assert next_occurrence(rule, after) == datetime(2026, 8, 31, 8, 0)


def test_weekly_without_by_day_raises():
    with pytest.raises(ValueError):
        next_occurrence({"freq": "weekly"}, datetime(2026, 8, 17, 9, 0))


def test_monthly_same_day_before_time():
    after = datetime(2026, 8, 16, 8, 0)
    rule = {"freq": "monthly", "by_day": [16], "time": "09:00"}
    assert next_occurrence(rule, after) == datetime(2026, 8, 16, 9, 0)


def test_unsupported_freq_raises():
    with pytest.raises(ValueError):
        next_occurrence({"freq": "yearly"}, datetime(2026, 1, 1))
