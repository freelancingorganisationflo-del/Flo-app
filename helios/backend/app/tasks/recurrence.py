import calendar
from datetime import datetime, time, timedelta

_WEEKDAYS = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6}


def next_occurrence(recurrence: dict, after: datetime) -> datetime:
    freq = recurrence.get("freq")
    if freq == "daily":
        return _next_daily(recurrence, after)
    if freq == "weekly":
        return _next_weekly(recurrence, after)
    if freq == "monthly":
        return _next_monthly(recurrence, after)
    raise ValueError(f"unsupported recurrence freq: {freq!r}")


def _next_daily(recurrence, after):
    when = _clock_time(recurrence)
    interval = max(1, int(recurrence.get("interval", 1)))
    day = after.date()
    while True:
        candidate = datetime.combine(day, when, tzinfo=after.tzinfo)
        if candidate > after:
            return candidate
        day += timedelta(days=interval)


def _next_weekly(recurrence, after):
    targets = sorted({_WEEKDAYS[d] for d in _by_day(recurrence) if d in _WEEKDAYS})
    if not targets:
        raise ValueError("weekly recurrence requires at least one by_day")
    when = _clock_time(recurrence)
    interval = max(1, int(recurrence.get("interval", 1)))
    day = after.date()
    anchor = day.toordinal() // 7
    while True:
        if day.weekday() in targets and (day.toordinal() // 7 - anchor) % interval == 0:
            candidate = datetime.combine(day, when, tzinfo=after.tzinfo)
            if candidate > after:
                return candidate
        day += timedelta(days=1)


def _next_monthly(recurrence, after):
    by_day = recurrence.get("by_day")
    day = max(1, min(31, int(by_day[0] if by_day else after.day)))
    interval = max(1, int(recurrence.get("interval", 1)))
    when = _clock_time(recurrence)
    year, month = after.year, after.month
    for _ in range(interval * 2 + 1):
        last_day = calendar.monthrange(year, month)[1]
        candidate = datetime.combine(
            datetime(year, month, min(day, last_day)).date(), when, tzinfo=after.tzinfo
        )
        if candidate > after:
            return candidate
        year, month = _add_months(year, month, interval)
    raise ValueError("could not compute next monthly occurrence")


def _by_day(recurrence: dict) -> list[int]:
    return [int(d) for d in (recurrence.get("by_day") or [])]


def _clock_time(recurrence: dict) -> time:
    raw = recurrence.get("time", "00:00")
    hour, minute = 0, 0
    if isinstance(raw, str) and ":" in raw:
        parts = raw.split(":")
        hour = int(parts[0]) if parts[0].isdigit() else 0
        minute = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    return time(hour % 24, minute % 60)


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    total = year * 12 + (month - 1) + delta
    return total // 12, total % 12 + 1
