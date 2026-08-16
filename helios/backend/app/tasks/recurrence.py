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
    day = after.date() + timedelta(days=max(1, int(recurrence.get("interval", 1))))
    return datetime.combine(day, when, tzinfo=after.tzinfo)


def _next_weekly(recurrence, after):
    targets = {_WEEKDAYS[d] for d in _by_day(recurrence) if d in _WEEKDAYS}
    when = _clock_time(recurrence)
    today = after.date()
    if today.weekday() in targets and (after.hour, after.minute) < (when.hour, when.minute):
        return datetime.combine(today, when, tzinfo=after.tzinfo)
    day = today + timedelta(days=1)
    advanced = 1
    while day.weekday() not in targets:
        day += timedelta(days=1)
        advanced += 1
    interval = max(1, int(recurrence.get("interval", 1)))
    if (advanced - 1) // 7 % interval != 0:
        day += timedelta(days=7 * (interval - ((advanced - 1) // 7 % interval)))
    return datetime.combine(day, when, tzinfo=after.tzinfo)


def _next_monthly(recurrence, after):
    by_day = recurrence.get("by_day")
    day = max(1, min(31, int(by_day[0] if by_day else after.day)))
    interval = max(1, int(recurrence.get("interval", 1)))
    when = _clock_time(recurrence)
    year, month = _add_months(after.year, after.month, interval)
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
