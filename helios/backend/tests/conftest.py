import os

# app.config.Settings validates the JWT secret and fails fast on the weak
# "change-me" default; give tests a strong secret before any app import.
os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 40)

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


import pytest


@pytest.fixture(autouse=True)
def stub_chat_web_search(monkeypatch):
    async def _empty_search(query, max_results=None):
        return []

    async def _no_fetch(url, max_chars=None):
        from app.search.service import SearchError

        raise SearchError("stubbed")

    monkeypatch.setattr("app.chat.service.search_web", _empty_search)
    monkeypatch.setattr("app.chat.service.fetch_page", _no_fetch)
