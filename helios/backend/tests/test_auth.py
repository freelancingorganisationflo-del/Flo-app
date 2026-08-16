from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings


async def test_signup_returns_token(client):
    resp = await client.post("/api/auth/signup", json={"email": "a@b.com", "password": "secret123"})
    assert resp.status_code == 201
    assert "access_token" in resp.json()


async def test_duplicate_signup_conflicts(client):
    payload = {"email": "a@b.com", "password": "secret123"}
    assert (await client.post("/api/auth/signup", json=payload)).status_code == 201
    resp = await client.post("/api/auth/signup", json=payload)
    assert resp.status_code == 409


async def test_login_and_me(client):
    await client.post("/api/auth/signup", json={"email": "a@b.com", "password": "secret123"})
    resp = await client.post("/api/auth/login", json={"email": "a@b.com", "password": "secret123"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "a@b.com"


async def test_login_wrong_password(client):
    await client.post("/api/auth/signup", json={"email": "a@b.com", "password": "secret123"})
    resp = await client.post("/api/auth/login", json={"email": "a@b.com", "password": "wrong"})
    assert resp.status_code == 401


async def test_me_requires_auth(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


async def test_me_garbage_token(client):
    resp = await client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert resp.status_code == 401


async def test_me_expired_token(client):
    payload = {
        "sub": "1",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


async def test_me_valid_token_but_user_not_found(client):
    payload = {
        "sub": "999999",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


async def test_signup_race_returns_conflict(client, db_session, monkeypatch):
    resp = await client.post(
        "/api/auth/signup", json={"email": "race@h.com", "password": "secret123"}
    )
    assert resp.status_code == 201

    # Force the exists-check to miss so the unique constraint must catch the
    # duplicate, exercising the IntegrityError -> 409 code path.
    async def _scalar_miss(stmt):
        return None

    monkeypatch.setattr(db_session, "scalar", _scalar_miss)
    resp = await client.post(
        "/api/auth/signup", json={"email": "race@h.com", "password": "secret123"}
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Email already registered"
