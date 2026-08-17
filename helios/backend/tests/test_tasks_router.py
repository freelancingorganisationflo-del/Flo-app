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


async def test_router_patch_and_complete_missing_404(authed_client):
    client, headers = authed_client
    assert (await client.patch("/api/tasks/999", json={"title": "x"}, headers=headers)).status_code == 404
    assert (await client.post("/api/tasks/999/complete", headers=headers)).status_code == 404


async def test_router_patch_and_complete_not_owned_404(authed_client):
    client, headers = authed_client
    created = await client.post("/api/tasks", json={"title": "mine"}, headers=headers)
    task_id = created.json()["id"]
    resp = await client.post("/api/auth/signup", json={"email": "own2@h.com", "password": "secret123"})
    other_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await client.patch(f"/api/tasks/{task_id}", json={"title": "x"}, headers=other_headers)).status_code == 404
    assert (await client.post(f"/api/tasks/{task_id}/complete", headers=other_headers)).status_code == 404


async def test_router_patch_status_tracks_completed_at(authed_client):
    client, headers = authed_client
    created = await client.post("/api/tasks", json={"title": "flip"}, headers=headers)
    task_id = created.json()["id"]
    done = await client.patch(f"/api/tasks/{task_id}", json={"status": "done"}, headers=headers)
    assert done.status_code == 200
    assert done.json()["completed_at"] is not None
    reopened = await client.patch(f"/api/tasks/{task_id}", json={"status": "pending"}, headers=headers)
    assert reopened.status_code == 200
    assert reopened.json()["completed_at"] is None
