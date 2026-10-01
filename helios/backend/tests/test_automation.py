from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.automation.service import (
    _aware,
    compute_next_run,
    evaluate_condition,
    get_automation,
    run_due_automations,
)
from app.deps import get_automation_llm
from app.main import app
from app.models import Message


def _utc(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


# --------------------------------------------------------------------------- #
# Scheduling
# --------------------------------------------------------------------------- #


def test_compute_next_run_interval():
    now = _utc(2026, 9, 25, 6, 0)
    assert compute_next_run({"frequency": "interval", "minutes": 30}, now) == now + timedelta(
        minutes=30
    )


def test_compute_next_run_hourly_rounds_up():
    now = _utc(2026, 9, 25, 6, 15)
    assert compute_next_run({"frequency": "hourly"}, now) == _utc(2026, 9, 25, 7, 0)


def test_compute_next_run_daily_uses_default_timezone(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "default_timezone", "Asia/Kolkata")
    # 06:00 UTC == 11:30 IST, so today's 08:00 IST has already passed.
    now = _utc(2026, 9, 25, 6, 0)
    nxt = compute_next_run({"frequency": "daily", "time": "08:00"}, now)
    assert nxt == _utc(2026, 9, 26, 2, 30)


def test_compute_next_run_unknown_frequency_defaults_to_interval():
    now = _utc(2026, 9, 25, 6, 0)
    assert compute_next_run({"frequency": "nope"}, now) == now + timedelta(minutes=60)


# --------------------------------------------------------------------------- #
# Conditions
# --------------------------------------------------------------------------- #


def test_evaluate_condition_always_true():
    assert evaluate_condition(None, {"now": _utc(2026, 9, 25, 6, 0), "tasks": []}) is True
    assert (
        evaluate_condition({"type": "always_true"}, {"now": _utc(2026, 9, 25, 6, 0), "tasks": []})
        is True
    )


def test_evaluate_condition_deadline_window():
    now = _utc(2026, 9, 25, 6, 0)
    ctx = {"now": now, "tasks": [{"due_at": now + timedelta(hours=5)}]}
    assert evaluate_condition({"type": "deadline_within_hours", "value": 24}, ctx) is True
    assert evaluate_condition({"type": "deadline_within_hours", "value": 1}, ctx) is False


def test_evaluate_condition_keyword_match():
    ctx = {"now": _utc(2026, 9, 25, 6, 0), "tasks": [], "text": "Python release notes"}
    assert evaluate_condition({"type": "keyword_match", "value": "python"}, ctx) is True
    assert evaluate_condition({"type": "keyword_match", "value": "rust"}, ctx) is False


# --------------------------------------------------------------------------- #
# Router
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post(
        "/api/auth/signup", json={"email": "auto@h.com", "password": "secret123"}
    )
    token = resp.json()["access_token"]
    return client, {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def fake_llm(client):
    class FakeLLM:
        model = "fake"

    app.dependency_overrides[get_automation_llm] = lambda: FakeLLM()
    yield
    app.dependency_overrides.pop(get_automation_llm, None)


async def test_router_crud_lifecycle(authed_client):
    client, headers = authed_client
    resp = await client.post(
        "/api/automations",
        json={
            "name": "Deadline Guardian",
            "action_type": "deadline_briefing",
            "trigger_config": {"frequency": "interval", "minutes": 60},
            "conditions": {"type": "always_true"},
        },
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["next_run_at"] is not None
    automation_id = body["id"]

    listed = await client.get("/api/automations", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    got = await client.get(f"/api/automations/{automation_id}", headers=headers)
    assert got.status_code == 200
    assert got.json()["name"] == "Deadline Guardian"

    disabled = await client.patch(
        f"/api/automations/{automation_id}", json={"enabled": False}, headers=headers
    )
    assert disabled.json()["enabled"] is False
    assert disabled.json()["next_run_at"] is None

    enabled = await client.patch(
        f"/api/automations/{automation_id}", json={"enabled": True}, headers=headers
    )
    assert enabled.json()["next_run_at"] is not None

    assert (
        await client.delete(f"/api/automations/{automation_id}", headers=headers)
    ).status_code == 204
    assert (
        await client.delete(f"/api/automations/{automation_id}", headers=headers)
    ).status_code == 404


async def test_router_rejects_unknown_action(authed_client):
    client, headers = authed_client
    resp = await client.post(
        "/api/automations",
        json={"name": "bad", "action_type": "does_not_exist"},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_router_ownership(authed_client):
    client, headers = authed_client
    created = await client.post(
        "/api/automations",
        json={"name": "mine", "action_type": "deadline_briefing"},
        headers=headers,
    )
    automation_id = created.json()["id"]

    resp = await client.post(
        "/api/auth/signup", json={"email": "other@h.com", "password": "secret123"}
    )
    other = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    assert (await client.get(f"/api/automations/{automation_id}", headers=other)).status_code == 404
    assert (
        await client.delete(f"/api/automations/{automation_id}", headers=other)
    ).status_code == 404
    assert len((await client.get("/api/automations", headers=other)).json()) == 0


async def test_router_requires_auth(client):
    assert (await client.get("/api/automations")).status_code == 401


# --------------------------------------------------------------------------- #
# Execution
# --------------------------------------------------------------------------- #


async def test_manual_run_posts_result_to_chat(authed_client, fake_llm, db_session):
    client, headers = authed_client
    user_id = (await client.get("/api/auth/me", headers=headers)).json()["id"]

    await client.post(
        "/api/tasks",
        json={
            "title": "Submit report",
            "due_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        },
        headers=headers,
    )
    created = await client.post(
        "/api/automations",
        json={
            "name": "Deadline Guardian",
            "action_type": "deadline_briefing",
            "trigger_config": {"frequency": "interval", "minutes": 60},
            "action_config": {"within_hours": 24},
        },
        headers=headers,
    )
    automation_id = created.json()["id"]

    run = await client.post(f"/api/automations/{automation_id}/run", headers=headers)
    assert run.status_code == 200
    assert run.json()["status"] == "success"
    assert "Submit report" in run.json()["result_summary"]

    messages = (
        (await db_session.execute(select(Message).where(Message.user_id == user_id)))
        .scalars()
        .all()
    )
    assert any("Submit report" in m.content and m.role == "assistant" for m in messages)

    history = await client.get(f"/api/automations/{automation_id}/runs", headers=headers)
    assert len(history.json()) == 1


async def test_manual_run_skips_when_condition_unmet(authed_client, fake_llm):
    client, headers = authed_client
    created = await client.post(
        "/api/automations",
        json={
            "name": "Only when due soon",
            "action_type": "deadline_briefing",
            "trigger_config": {"frequency": "interval", "minutes": 60},
            "conditions": {"type": "deadline_within_hours", "value": 1},
        },
        headers=headers,
    )
    automation_id = created.json()["id"]

    run = await client.post(f"/api/automations/{automation_id}/run", headers=headers)
    assert run.status_code == 200
    assert run.json()["status"] == "skipped_condition"


async def test_tick_runs_due_and_advances_schedule(authed_client, fake_llm, db_session):
    client, headers = authed_client
    user_id = (await client.get("/api/auth/me", headers=headers)).json()["id"]

    await client.post(
        "/api/tasks",
        json={
            "title": "Pay bill",
            "due_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        },
        headers=headers,
    )
    created = await client.post(
        "/api/automations",
        json={
            "name": "Deadline Guardian",
            "action_type": "deadline_briefing",
            "trigger_config": {"frequency": "interval", "minutes": 60},
            "action_config": {"within_hours": 24},
        },
        headers=headers,
    )
    automation_id = created.json()["id"]

    automation = await get_automation(db_session, user_id, automation_id)
    automation.next_run_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()

    ran = await run_due_automations(db_session, None)
    assert automation_id in ran

    await db_session.refresh(automation)
    assert _aware(automation.next_run_at) > datetime.now(timezone.utc)
    assert automation.last_run_at is not None


async def test_tick_ignores_not_yet_due(authed_client, db_session):
    client, headers = authed_client
    user_id = (await client.get("/api/auth/me", headers=headers)).json()["id"]
    created = await client.post(
        "/api/automations",
        json={
            "name": "Later",
            "action_type": "deadline_briefing",
            "trigger_config": {"frequency": "interval", "minutes": 60},
        },
        headers=headers,
    )
    automation_id = created.json()["id"]
    automation = await get_automation(db_session, user_id, automation_id)
    automation.next_run_at = datetime.now(timezone.utc) + timedelta(hours=1)
    await db_session.commit()

    assert await run_due_automations(db_session, None) == []
