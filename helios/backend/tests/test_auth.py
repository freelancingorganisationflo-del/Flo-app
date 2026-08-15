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
