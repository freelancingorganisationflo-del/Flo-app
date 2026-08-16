import pytest_asyncio


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "t@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


async def test_router_crud_lifecycle(authed_client):
    client, headers = authed_client
    resp = await client.post(
        "/api/tasks",
        json={"title": "buy milk", "priority": "high", "reminder_at": "2026-08-17T08:00:00"},
        headers=headers,
    )
    assert resp.status_code == 201
    task_id = resp.json()["id"]
    assert resp.json()["reminder_at"] == "2026-08-17T08:00:00"

    resp = await client.get("/api/tasks", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "buy milk"

    resp = await client.get(f"/api/tasks/{task_id}", headers=headers)
    assert resp.status_code == 200

    resp = await client.patch(f"/api/tasks/{task_id}", json={"priority": "low"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["priority"] == "low"

    resp = await client.post(f"/api/tasks/{task_id}/complete", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"

    resp = await client.get("/api/tasks", params={"status": "done"}, headers=headers)
    assert len(resp.json()) == 1
    resp = await client.get("/api/tasks", params={"status": "pending"}, headers=headers)
    assert len(resp.json()) == 0

    resp = await client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert resp.status_code == 204
    resp = await client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert resp.status_code == 404


async def test_router_ownership(authed_client):
    client, headers = authed_client
    created = await client.post("/api/tasks", json={"title": "mine"}, headers=headers)
    task_id = created.json()["id"]

    resp = await client.post("/api/auth/signup", json={"email": "other@h.com", "password": "secret123"})
    other_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    assert (await client.get(f"/api/tasks/{task_id}", headers=other_headers)).status_code == 404
    assert (await client.delete(f"/api/tasks/{task_id}", headers=other_headers)).status_code == 404
    listed = await client.get("/api/tasks", headers=other_headers)
    assert len(listed.json()) == 0


async def test_router_requires_auth(client):
    assert (await client.get("/api/tasks")).status_code == 401
