# Helios — Plan 1: Foundation + LLM Gateway + Chat + Memory

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Helios backend skeleton (FastAPI + SQLAlchemy async + JWT auth), a provider-agnostic LLM Gateway, and the Chat + Memory core loop with streaming replies — fully testable with no external services.

**Architecture:** Modular monolith. Each capability is a FastAPI router behind a clean interface. The LLM Gateway is the only place that talks to an LLM provider; chat orchestrates the tool loop (search_memory / save_memory) and streams the final reply over SSE. No `conversations` table — a single continuous `messages` stream per user, per the approved spec.

**Tech Stack:** Python 3.11, FastAPI, Uvicorn, SQLAlchemy 2.0 (async), httpx, PyJWT + bcrypt, pytest + pytest-asyncio. DB via `DATABASE_URL` (SQLite/aiosqlite for dev + tests, PostgreSQL/asyncpg for production).

## Global Constraints

- **LLM keys:** Only `USER_LLM_API_KEY`, `USER_LLM_BASE_URL`, `USER_LLM_MODEL`, `USER_LLM_EMBEDDING_MODEL` are read, from env or `.env`. Never read, print, or hardcode Agent-runtime keys. `.env.example` holds placeholders only.
- **Database portability:** All SQLAlchemy models must work on both SQLite (aiosqlite) and Postgres (asyncpg). No Postgres-only SQL in Plan 1. Embeddings are stored as a JSON string in a `Text` column; cosine similarity is computed in Python (pgvector swap is a later plan).
- **Auth:** Self-contained JWT (bcrypt + PyJWT) with a `users` table. Supabase Auth can replace it later via the `get_current_user` dependency; do not build Supabase-specific code in Plan 1.
- **No `conversations` table.** Chat history is one continuous `messages` stream per user.
- **Tool-calling routing:** The chat module routes intent via LLM tool-calling (`search_memory`, `save_memory`), never keyword matching. Later plans add `search_documents` and task tools to the same registry.
- **Streaming:** Client sees token-by-token deltas over SSE. Plan 1 streams the completed reply in chunks (provider-level streaming is a later refinement).
- Python 3.11+; packages installed globally via `pip --break-system-packages`.
- No comments in code unless they explain "why".

---

### Task 1: Backend scaffold + config + health endpoint

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/app/models.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/conftest.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `app.config.settings` — pydantic-settings singleton with `database_url`, `jwt_secret`, `jwt_algorithm`, `jwt_expire_minutes`, `user_llm_api_key`, `user_llm_base_url`, `user_llm_model`, `user_llm_embedding_model`, `llm_timeout_seconds`, `llm_max_tool_iterations`, `memory_top_k`.
  - `app.db.Base` — SQLAlchemy declarative base.
  - `app.db.engine` — async engine from `settings.database_url`.
  - `app.db.get_db` — async generator dependency yielding an `AsyncSession`.
  - `app.models.User`, `app.models.Message`, `app.models.Memory` — ORM models.
  - `app.main.app` — FastAPI instance with a `GET /api/health` route.

- [ ] **Step 1: Create `backend/requirements.txt`**

```text
fastapi>=0.115,<1.0
uvicorn[standard]>=0.30
sqlalchemy>=2.0,<3.0
aiosqlite>=0.20
asyncpg>=0.29
pydantic>=2.7
pydantic-settings>=2.3
httpx>=0.27
bcrypt>=4.1
PyJWT>=2.8
email-validator>=2.1
pytest>=8.2
pytest-asyncio>=0.23
```

- [ ] **Step 2: Create `backend/.env.example`**

```bash
# Database. SQLite for local dev; PostgreSQL (e.g. Supabase) in production.
# DATABASE_URL=sqlite+aiosqlite:///./helios.db
# DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/helios

# Auth
# JWT_SECRET=change-me-to-a-long-random-string
# JWT_ALGORITHM=HS256
# JWT_EXPIRE_MINUTES=10080

# LLM — supply your own keys. Provider-agnostic via OpenAI-compatible API.
USER_LLM_API_KEY=your-api-key-here
USER_LLM_BASE_URL=https://api.openai.com/v1
USER_LLM_MODEL=gpt-4o-mini
USER_LLM_EMBEDDING_MODEL=text-embedding-3-small
```

- [ ] **Step 3: Create `backend/pyproject.toml`**

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 4: Create `backend/app/__init__.py`**

```python
```

- [ ] **Step 5: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./helios.db"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7

    user_llm_api_key: str = ""
    user_llm_base_url: str = "https://api.openai.com/v1"
    user_llm_model: str = "gpt-4o-mini"
    user_llm_embedding_model: str = "text-embedding-3-small"
    llm_timeout_seconds: float = 60.0
    llm_max_tool_iterations: int = 5

    memory_top_k: int = 5


settings = Settings()
```

- [ ] **Step 6: Create `backend/app/db.py`**

```python
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with SessionLocal() as session:
        yield session
```

- [ ] **Step 7: Create `backend/app/models.py`**

```python
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Memory(Base):
    __tablename__ = "memories"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(index=True)
    content: Mapped[str] = mapped_column(Text)
    embedding_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
```

- [ ] **Step 8: Create `backend/app/main.py`**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Helios", version="0.1.0", lifespan=lifespan)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 9: Create `backend/tests/conftest.py`**

```python
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
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

- [ ] **Step 10: Create `backend/tests/test_health.py`**

```python
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 11: Install dependencies**

Run: `cd /workspace/helios/backend && python3 -m pip install --break-system-packages -r requirements.txt`
Expected: pip installs without error.

- [ ] **Step 12: Run the test**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/test_health.py -v`
Expected: 1 passed.

- [ ] **Step 13: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend /workspace/docs/superpowers
git commit -m "feat(backend): scaffold Helios FastAPI app with config, models, health endpoint"
```

---

### Task 2: Auth module (users, JWT, current-user dependency)

**Files:**
- Create: `backend/app/deps.py`
- Create: `backend/app/auth/__init__.py`
- Create: `backend/app/auth/security.py`
- Create: `backend/app/auth/router.py`
- Modify: `backend/app/main.py` (include auth router)
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `app.models.User`, `app.db.get_db`, `app.config.settings`, `app.main.app`.
- Produces:
  - `app.deps.get_current_user` — FastAPI dependency returning the authenticated `User` from the `Authorization: Bearer <jwt>` header; raises 401 otherwise.
- `app.deps.get_llm` — added in Task 3, not Task 2 (avoids importing `LLMClient` before it exists).
- `app.auth.security.hash_password(password: str) -> str`
  - `app.auth.security.verify_password(password: str, hashed: str) -> bool`
  - `app.auth.security.create_access_token(user_id: int) -> str`
  - Router `app.auth.router` with `POST /api/auth/signup` (201), `POST /api/auth/login`, `GET /api/auth/me`.

- [ ] **Step 1: Create `backend/app/auth/__init__.py`**

```python
```

- [ ] **Step 2: Create `backend/app/auth/security.py`**

```python
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from ..config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return int(payload["sub"])
    except jwt.PyJWTError:
        return None
```

- [ ] **Step 3: Create `backend/app/deps.py`**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from .auth.security import decode_token
from .db import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials=Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = decode_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
```

Note: `get_llm` is added to this file in Task 3, once `app.llm_gateway.client.LLMClient` exists.

- [ ] **Step 4: Create `backend/app/auth/router.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import User
from .security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(req: SignupRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    exists = await db.scalar(select(User).where(User.email == req.email.lower()))
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(email=req.email.lower(), password_hash=hash_password(req.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == req.email.lower()))
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me")
async def me(user: User = Depends(get_current_user)) -> dict:
    return {"id": user.id, "email": user.email}
```

- [ ] **Step 5: Update `backend/app/main.py`**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .auth.router import router as auth_router
from .db import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Helios", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Create `backend/tests/test_auth.py`**

```python
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
```

- [ ] **Step 7: Run the tests**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/test_auth.py -v`
Expected: 5 passed.

- [ ] **Step 8: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend
git commit -m "feat(auth): add JWT signup/login and current-user dependency"
```

---

### Task 3: LLM Gateway (provider-agnostic client + tool registry)

**Files:**
- Create: `backend/app/llm_gateway/__init__.py`
- Create: `backend/app/llm_gateway/client.py`
- Create: `backend/app/llm_gateway/tools.py`
- Test: `backend/tests/test_llm_gateway.py`

**Interfaces:**
- Consumes: `app.config.settings`, `app.deps.get_llm`.
- Produces:
  - `app.llm_gateway.client.LLMClient` — methods `complete(messages, tools=None) -> ChatResult`, `embed(text) -> list[float]`. Uses OpenAI-compatible `/chat/completions` and `/embeddings`.
  - `app.llm_gateway.client.ChatResult` — dataclass: `content: str | None`, `tool_calls: list[ToolCall]`, `assistant_message: dict | None`.
  - `app.llm_gateway.client.ToolCall` — dataclass: `id: str`, `name: str`, `arguments: str`.
  - `app.llm_gateway.tools.Tool` — dataclass: `name`, `description`, `parameters`, `handler` (async callable returning JSON string).
  - `app.llm_gateway.tools.ToolRegistry` — `register(tool)`, `schema() -> list[dict]`, `execute(name, arguments) -> str`.
  - `app.deps.get_llm` — appended to `app/deps.py` in this task, returns `LLMClient()`.

- [ ] **Step 1: Create `backend/app/llm_gateway/__init__.py`**

```python
```

- [ ] **Step 2: Create `backend/app/llm_gateway/client.py`**

```python
import json
from dataclasses import dataclass, field
from typing import Any

import httpx

from ..config import settings


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass
class ChatResult:
    content: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)
    assistant_message: dict[str, Any] | None = None


class LLMClient:
    def __init__(self) -> None:
        self.api_key = settings.user_llm_api_key
        self.base_url = settings.user_llm_base_url.rstrip("/")
        self.model = settings.user_llm_model
        self.embedding_model = settings.user_llm_embedding_model
        self.timeout = settings.llm_timeout_seconds

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    async def complete(self, messages: list[dict], tools: list[dict] | None = None) -> ChatResult:
        if not self.api_key:
            raise RuntimeError("USER_LLM_API_KEY is not configured")
        payload: dict[str, Any] = {"model": self.model, "messages": messages}
        if tools:
            payload["tools"] = tools
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions", json=payload, headers=self._headers()
            )
            resp.raise_for_status()
            data = resp.json()

        choice = data["choices"][0]["message"]
        message: dict[str, Any] = {"role": "assistant", "content": choice.get("content")}
        tool_calls: list[ToolCall] = []
        if choice.get("tool_calls"):
            message["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["function"]["name"],
                        "arguments": tc["function"].get("arguments") or "{}",
                    },
                }
                for tc in choice["tool_calls"]
            ]
            tool_calls = [
                ToolCall(
                    id=tc["id"],
                    name=tc["function"]["name"],
                    arguments=tc["function"].get("arguments") or "{}",
                )
                for tc in choice["tool_calls"]
            ]
        return ChatResult(content=choice.get("content"), tool_calls=tool_calls, assistant_message=message)

    async def embed(self, text: str) -> list[float]:
        if not self.api_key:
            raise RuntimeError("USER_LLM_API_KEY is not configured")
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/embeddings",
                json={"model": self.embedding_model, "input": text},
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
        return data["data"][0]["embedding"]
```

- [ ] **Step 3: Create `backend/app/llm_gateway/tools.py`**

```python
import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

ToolHandler = Callable[..., Awaitable[str]]


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    handler: ToolHandler


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def schema(self) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            }
            for tool in self._tools.values()
        ]

    async def execute(self, name: str, arguments: str) -> str:
        tool = self._tools.get(name)
        if tool is None:
            return json.dumps({"error": f"Unknown tool: {name}"})
        try:
            args: dict[str, Any] = json.loads(arguments or "{}")
        except json.JSONDecodeError:
            args = {}
        try:
            return await tool.handler(**args)
        except Exception as exc:
            return json.dumps({"error": str(exc)})
```

- [ ] **Step 4: Append `get_llm` to `backend/app/deps.py`**

Add to the end of `backend/app/deps.py`:

```python
from .llm_gateway.client import LLMClient


def get_llm() -> LLMClient:
    return LLMClient()
```

- [ ] **Step 5: Create `backend/tests/test_llm_gateway.py`**

```python
import json

from app.llm_gateway.client import LLMClient
from app.llm_gateway.tools import Tool, ToolRegistry


def test_client_requires_key(monkeypatch):
    monkeypatch.setattr("app.llm_gateway.client.settings.user_llm_api_key", "")
    client = LLMClient()
    assert client.api_key == ""


def test_tool_registry_schema():
    registry = ToolRegistry()
    async def handler(x: int) -> str:
        return json.dumps({"double": x * 2})

    registry.register(
        Tool(
            name="double",
            description="Doubles a number",
            parameters={
                "type": "object",
                "properties": {"x": {"type": "integer"}},
                "required": ["x"],
            },
            handler=handler,
        )
    )
    schema = registry.schema()
    assert schema[0]["function"]["name"] == "double"


def test_tool_registry_executes_handler():
    registry = ToolRegistry()
    async def handler(x: int) -> str:
        return json.dumps({"double": x * 2})

    registry.register(
        Tool(
            name="double",
            description="Doubles a number",
            parameters={
                "type": "object",
                "properties": {"x": {"type": "integer"}},
                "required": ["x"],
            },
            handler=handler,
        )
    )

    async def run():
        return await registry.execute("double", json.dumps({"x": 4}))

    import asyncio

    assert asyncio.run(run()) == json.dumps({"double": 8})


def test_tool_registry_unknown_tool():
    import asyncio

    async def run():
        registry = ToolRegistry()
        return await registry.execute("nope", "{}")

    assert "error" in asyncio.run(run())
```

- [ ] **Step 6: Run the tests**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/test_llm_gateway.py -v`
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend
git commit -m "feat(llm-gateway): add provider-agnostic client and tool registry"
```

---

### Task 4: Memory module (semantic search + CRUD router)

**Files:**
- Create: `backend/app/memory/__init__.py`
- Create: `backend/app/memory/service.py`
- Create: `backend/app/memory/router.py`
- Modify: `backend/app/main.py` (include memory router)
- Test: `backend/tests/test_memory.py`

**Interfaces:**
- Consumes: `app.models.Memory`, `app.db.get_db`, `app.deps.get_current_user`, `app.deps.get_llm`, `app.config.settings.memory_top_k`.
- Produces:
  - `app.memory.service.cosine_similarity(a: list[float], b: list[float]) -> float`
  - `app.memory.service.add_memory(db, user_id: int, content: str, embedding: list[float]) -> Memory`
  - `app.memory.service.search_memories(db, user_id: int, query_embedding: list[float], top_k: int | None = None) -> list[Memory]`
  - `app.memory.service.list_memories(db, user_id: int) -> list[Memory]`
  - `app.memory.service.delete_memory(db, user_id: int, memory_id: int) -> bool`
  - Router `app.memory.router` with `POST /api/memory`, `GET /api/memory`, `DELETE /api/memory/{id}`.

- [ ] **Step 1: Create `backend/app/memory/__init__.py`**

```python
```

- [ ] **Step 2: Create `backend/app/memory/service.py`**

```python
import json
import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Memory


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def add_memory(db: AsyncSession, user_id: int, content: str, embedding: list[float]) -> Memory:
    mem = Memory(user_id=user_id, content=content, embedding_json=json.dumps(embedding))
    db.add(mem)
    await db.commit()
    await db.refresh(mem)
    return mem


async def search_memories(
    db: AsyncSession, user_id: int, query_embedding: list[float], top_k: int | None = None
) -> list[Memory]:
    top_k = top_k or settings.memory_top_k
    rows = (
        (await db.execute(select(Memory).where(Memory.user_id == user_id))).scalars().all()
    )
    scored = []
    for mem in rows:
        if not mem.embedding_json:
            continue
        emb = json.loads(mem.embedding_json)
        score = cosine_similarity(query_embedding, emb)
        if score > 0:
            scored.append((score, mem))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [mem for _, mem in scored[:top_k]]


async def list_memories(db: AsyncSession, user_id: int) -> list[Memory]:
    return (
        (
            await db.execute(
                select(Memory).where(Memory.user_id == user_id).order_by(Memory.id.desc())
            )
        )
        .scalars()
        .all()
    )


async def delete_memory(db: AsyncSession, user_id: int, memory_id: int) -> bool:
    mem = await db.get(Memory, memory_id)
    if mem is None or mem.user_id != user_id:
        return False
    await db.delete(mem)
    await db.commit()
    return True
```

- [ ] **Step 3: Create `backend/app/memory/router.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, get_llm
from ..llm_gateway.client import LLMClient
from ..models import User
from .service import add_memory, delete_memory, list_memories

router = APIRouter(prefix="/api/memory", tags=["memory"])


class AddMemoryRequest(BaseModel):
    content: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_memory(
    req: AddMemoryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    embedding = await llm.embed(req.content)
    mem = await add_memory(db, user.id, req.content, embedding)
    return {"id": mem.id, "content": mem.content}


@router.get("")
async def get_memories(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    mems = await list_memories(db, user.id)
    return [{"id": m.id, "content": m.content, "created_at": str(m.created_at)} for m in mems]


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_memory(
    memory_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not await delete_memory(db, user.id, memory_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")
```

- [ ] **Step 4: Update `backend/app/main.py`**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .auth.router import router as auth_router
from .db import Base, engine
from .memory.router import router as memory_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Helios", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(memory_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Create `backend/tests/test_memory.py`**

```python
from sqlalchemy import select

from app.memory.service import (
    add_memory,
    cosine_similarity,
    delete_memory,
    list_memories,
    search_memories,
)
from app.models import Memory


def test_cosine_similarity_basics():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert abs(cosine_similarity([1.0, 0.0], [0.0, 1.0])) < 1e-9
    assert cosine_similarity([], [1.0]) == 0.0


async def test_add_and_list_memory(db_session):
    mem = await add_memory(db_session, user_id=1, content="likes coffee", embedding=[1.0, 0.0])
    assert mem.id is not None
    mems = await list_memories(db_session, 1)
    assert len(mems) == 1
    assert mems[0].content == "likes coffee"


async def test_search_ranks_relevant_first(db_session):
    await add_memory(db_session, 1, "I love hiking in the mountains", [1.0, 0.0, 0.0])
    await add_memory(db_session, 1, "My cat is named Milo", [0.0, 1.0, 0.0])
    results = await search_memories(db_session, 1, [0.9, 0.1, 0.0], top_k=2)
    assert results[0].content == "I love hiking in the mountains"


async def test_search_scoped_to_user(db_session):
    await add_memory(db_session, 1, "user one secret", [1.0, 0.0])
    await add_memory(db_session, 2, "user two secret", [1.0, 0.0])
    results = await search_memories(db_session, 1, [1.0, 0.0], top_k=5)
    assert len(results) == 1
    assert results[0].content == "user one secret"


async def test_delete_memory(db_session):
    mem = await add_memory(db_session, 1, "temp", [1.0])
    assert await delete_memory(db_session, 1, mem.id) is True
    assert await delete_memory(db_session, 1, mem.id) is False
    rows = (await db_session.execute(select(Memory))).scalars().all()
    assert len(rows) == 0
```

- [ ] **Step 6: Run the tests**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/test_memory.py -v`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend
git commit -m "feat(memory): add semantic memory store and CRUD router"
```

---

### Task 5: Chat module (tool loop + streaming SSE)

**Files:**
- Create: `backend/app/chat/__init__.py`
- Create: `backend/app/chat/service.py`
- Create: `backend/app/chat/router.py`
- Modify: `backend/app/main.py` (include chat router)
- Test: `backend/tests/test_chat.py`

**Interfaces:**
- Consumes: `app.models.Message`, `app.models.User`, `app.db.get_db`, `app.deps.get_current_user`, `app.deps.get_llm`, `app.llm_gateway.client.LLMClient`, `app.llm_gateway.tools.{Tool, ToolRegistry}`, `app.memory.service.{add_memory, search_memories}`, `app.config.settings`.
- Produces:
  - `app.chat.service.SYSTEM_PROMPT` — module constant.
  - `app.chat.service.build_registry(db, user_id: int, llm: LLMClient) -> ToolRegistry` — registers `search_memory` and `save_memory`.
  - `app.chat.service.recent_history(db, user_id: int, limit: int = 20) -> list[dict]`
  - `app.chat.service.save_user_message(db, user_id: int, content: str) -> Message`
  - `app.chat.service.save_assistant_message(db, user_id: int, content: str) -> Message`
  - `app.chat.service.run_chat(db, user, user_message: str, llm: LLMClient) -> tuple[str, list[dict]]` — returns `(final_text, tool_events)`.
  - `app.chat.service.stream_chat(db, user, user_message: str, llm: LLMClient) -> AsyncIterator[dict]` — yields `{"type": "tool", "name": ...}`, `{"type": "delta", "text": ...}`, `{"type": "done"}`.
  - Router `app.chat.router` with `POST /api/chat` and `POST /api/chat/stream` (SSE).

- [ ] **Step 1: Create `backend/app/chat/__init__.py`**

```python
```

- [ ] **Step 2: Create `backend/app/chat/service.py`**

```python
import asyncio
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..llm_gateway.client import LLMClient
from ..llm_gateway.tools import Tool, ToolRegistry
from ..memory.service import add_memory, search_memories
from ..models import Message, User

SYSTEM_PROMPT = (
    "You are Helios, a personal AI assistant. Be warm, concise, and helpful.\n\n"
    "You have tools to look up stored facts about the user and save new facts "
    "to long-term memory. Use them whenever relevant:\n"
    "- search_memory: call when the user asks about something they told you "
    "before, or when recalling a stored fact would help answer.\n"
    "- save_memory: call when the user shares a personal fact, preference, or "
    "detail worth remembering for future conversations.\n\n"
    "When you use a tool, keep your final answer short and natural."
)


def build_registry(db: AsyncSession, user_id: int, llm: LLMClient) -> ToolRegistry:
    registry = ToolRegistry()

    async def search_memory_handler(query: str) -> str:
        embedding = await llm.embed(query)
        memories = await search_memories(db, user_id, embedding)
        if not memories:
            return json.dumps({"found": False, "memories": []})
        return json.dumps({"found": True, "memories": [{"content": m.content} for m in memories]})

    async def save_memory_handler(content: str) -> str:
        embedding = await llm.embed(content)
        mem = await add_memory(db, user_id, content, embedding)
        return json.dumps({"saved": True, "id": mem.id})

    registry.register(
        Tool(
            name="search_memory",
            description="Search stored facts about the user.",
            parameters={
                "type": "object",
                "properties": {"query": {"type": "string", "description": "The fact to look up"}},
                "required": ["query"],
            },
            handler=search_memory_handler,
        )
    )
    registry.register(
        Tool(
            name="save_memory",
            description="Save a personal fact about the user for future reference.",
            parameters={
                "type": "object",
                "properties": {"content": {"type": "string", "description": "The fact to remember"}},
                "required": ["content"],
            },
            handler=save_memory_handler,
        )
    )
    return registry


async def recent_history(db: AsyncSession, user_id: int, limit: int = 20) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(Message)
                .where(Message.user_id == user_id)
                .order_by(Message.id.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    rows.reverse()
    return [
        {"role": m.role, "content": m.content}
        for m in rows
        if m.role in ("user", "assistant")
    ]


async def save_user_message(db: AsyncSession, user_id: int, content: str) -> Message:
    msg = Message(user_id=user_id, role="user", content=content)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def save_assistant_message(db: AsyncSession, user_id: int, content: str) -> Message:
    msg = Message(user_id=user_id, role="assistant", content=content)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def _run_tool_loop(
    db: AsyncSession,
    user_id: int,
    messages: list[dict],
    registry: ToolRegistry,
    llm: LLMClient,
) -> tuple[str, list[dict]]:
    iterations = settings.llm_max_tool_iterations
    tool_events: list[dict] = []
    final: str | None = None

    for _ in range(iterations):
        result = await llm.complete(messages, tools=registry.schema())
        if result.tool_calls:
            if result.assistant_message:
                messages.append(result.assistant_message)
            for call in result.tool_calls:
                tool_events.append({"name": call.name, "arguments": call.arguments})
                output = await registry.execute(call.name, call.arguments)
                messages.append({"role": "tool", "tool_call_id": call.id, "content": output})
            continue
        final = result.content or ""
        if result.assistant_message:
            messages.append(result.assistant_message)
        break

    if final is None:
        final = "I ran out of steps trying to help with that. Please try rephrasing."
    return final, tool_events


async def run_chat(
    db: AsyncSession, user: User, user_message: str, llm: LLMClient
) -> tuple[str, list[dict]]:
    await save_user_message(db, user.id, user_message)
    history = await recent_history(db, user.id)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *history]
    registry = build_registry(db, user.id, llm)
    final, tool_events = await _run_tool_loop(db, user.id, messages, registry, llm)
    await save_assistant_message(db, user.id, final)
    return final, tool_events


async def stream_chat(
    db: AsyncSession, user: User, user_message: str, llm: LLMClient
):
    await save_user_message(db, user.id, user_message)
    history = await recent_history(db, user.id)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *history]
    registry = build_registry(db, user.id, llm)
    final, tool_events = await _run_tool_loop(db, user.id, messages, registry, llm)
    await save_assistant_message(db, user.id, final)

    for event in tool_events:
        yield {"type": "tool", "name": event["name"]}
    for token in _tokenize(final):
        yield {"type": "delta", "text": token}
        await asyncio.sleep(0.01)
    yield {"type": "done"}


def _tokenize(text: str, chunk: int = 3):
    words = text.split()
    for i in range(0, len(words), chunk):
        yield " ".join(words[i : i + chunk]) + " "
```

- [ ] **Step 3: Create `backend/app/chat/router.py`**

```python
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, get_llm
from ..llm_gateway.client import LLMClient
from ..models import User
from .service import run_chat, stream_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str


@router.post("")
async def chat(
    req: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    if not req.message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")
    final, tool_events = await run_chat(db, user, req.message.strip(), llm)
    return {"reply": final, "tool_events": tool_events}


@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> StreamingResponse:
    if not req.message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")

    async def event_gen():
        async for event in stream_chat(db, user, req.message.strip(), llm):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
```

- [ ] **Step 4: Update `backend/app/main.py`**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .auth.router import router as auth_router
from .chat.router import router as chat_router
from .db import Base, engine
from .memory.router import router as memory_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Helios", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(memory_router)
app.include_router(chat_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Create `backend/tests/test_chat.py`**

```python
import json

import pytest_asyncio
from sqlalchemy import select

from app.deps import get_llm
from app.llm_gateway.client import ChatResult, LLMClient, ToolCall
from app.main import app
from app.models import Memory


class FakeLLM(LLMClient):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[list[dict]] = []

    async def complete(self, messages, tools=None):
        self.calls.append(messages)
        last = messages[-1]
        if last["role"] == "user" and "remember" in last["content"].lower():
            return ChatResult(
                content=None,
                tool_calls=[ToolCall(id="call_1", name="save_memory", arguments='{"content": "likes coffee"}')],
                assistant_message={
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "save_memory", "arguments": '{"content": "likes coffee"}'},
                        }
                    ],
                },
            )
        if last["role"] == "tool":
            return ChatResult(
                content="Got it, I saved that.",
                tool_calls=[],
                assistant_message={"role": "assistant", "content": "Got it, I saved that."},
            )
        return ChatResult(
            content=f"Echo: {last['content']}",
            tool_calls=[],
            assistant_message={"role": "assistant", "content": f"Echo: {last['content']}"},
        )

    async def embed(self, text):
        return [1.0, 0.0]


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "u@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest_asyncio.fixture
async def fake_llm(client):
    fake = FakeLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


async def test_chat_echo(authed_client, fake_llm):
    client, headers = authed_client
    resp = await client.post("/api/chat", json={"message": "hello"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["reply"] == "Echo: hello"


async def test_chat_empty_message_rejected(authed_client, fake_llm):
    client, headers = authed_client
    resp = await client.post("/api/chat", json={"message": "   "}, headers=headers)
    assert resp.status_code == 400


async def test_chat_saves_memory_via_tool(authed_client, fake_llm, db_session):
    client, headers = authed_client
    resp = await client.post(
        "/api/chat", json={"message": "remember that I like coffee"}, headers=headers
    )
    assert resp.status_code == 200
    assert "saved" in resp.json()["reply"].lower()
    assert any(e["name"] == "save_memory" for e in resp.json()["tool_events"])
    mems = (await db_session.execute(select(Memory))).scalars().all()
    assert len(mems) == 1
    assert mems[0].content == "likes coffee"


async def test_chat_persists_history(authed_client, fake_llm, db_session):
    client, headers = authed_client
    await client.post("/api/chat", json={"message": "first"}, headers=headers)
    await client.post("/api/chat", json={"message": "second"}, headers=headers)
    assert fake_llm.calls[1][1]["role"] == "user"
    assert fake_llm.calls[1][1]["content"] == "first"


async def test_chat_stream_emits_delta_and_done(authed_client, fake_llm):
    client, headers = authed_client
    async with client.stream(
        "POST", "/api/chat/stream", json={"message": "hello"}, headers=headers
    ) as resp:
        assert resp.status_code == 200
        body = "".join([line async for line in resp.aiter_lines()])
    events = [json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")]
    assert any(e["type"] == "delta" for e in events)
    assert events[-1]["type"] == "done"
```

- [ ] **Step 6: Run the tests**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/ -v`
Expected: all tests pass (health 1, auth 5, llm_gateway 4, memory 5, chat 5 = 20 tests).

- [ ] **Step 7: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/backend
git commit -m "feat(chat): add tool-calling chat loop and streaming SSE endpoint"
```

---

### Task 6: Final integration check + README

**Files:**
- Create: `helios/README.md`
- Test: full suite

**Interfaces:**
- Consumes: everything from Tasks 1-5.

- [ ] **Step 1: Create `helios/README.md`**

```markdown
# Helios — Personal Assistant AI

Backend (Plan 1): FastAPI + SQLAlchemy async + JWT auth + LLM Gateway +
Chat + Memory. Frontend (PWA) and Tasks / RAG / Voice modules come in later
plans.

## Run locally

```bash
cd backend
cp .env.example .env   # then fill in USER_LLM_API_KEY with your own key
python3 -m pip install --break-system-packages -r requirements.txt
uvicorn app.main:app --reload
```

Open http://localhost:8000/docs for the interactive API browser.

## Endpoints (Plan 1)

- `POST /api/auth/signup` — create account, returns JWT
- `POST /api/auth/login` — login, returns JWT
- `GET  /api/auth/me` — current user
- `POST /api/memory` — manually save a memory (auto-embeds)
- `GET  /api/memory` — list memories
- `DELETE /api/memory/{id}` — delete a memory
- `POST /api/chat` — send a message, get JSON reply
- `POST /api/chat/stream` — send a message, get SSE stream (tool + delta + done events)

## Tests

```bash
cd backend
python3 -m pytest tests/ -v
```

## Env vars

Only `USER_LLM_*` variables are used for the LLM. Supply your own key in `.env`.

- `DATABASE_URL` — `sqlite+aiosqlite:///./helios.db` (dev) or
  `postgresql+asyncpg://user:pass@host:5432/helios` (production)
- `USER_LLM_API_KEY`, `USER_LLM_BASE_URL`, `USER_LLM_MODEL`,
  `USER_LLM_EMBEDDING_MODEL`
```

- [ ] **Step 2: Run the full suite**

Run: `cd /workspace/helios/backend && python3 -m pytest tests/ -v`
Expected: 20 passed.

- [ ] **Step 3: Commit**

```bash
cd /workspace/helios/backend
git add /workspace/helios/README.md
git commit -m "docs: add Helios backend README"
```

---

## Self-Review Notes

- Spec coverage for Plan 1: architecture (single deployable, modular), multi-user auth (JWT + users table), chat + memory (continuous messages stream, no conversations table, tool-based routing via search_memory/save_memory, memory auto-save in same LLM request through the save_memory tool), streaming SSE, provider-agnostic LLM Gateway reading only USER_LLM_* vars.
- Tasks/RAG/Voice/UI are intentionally out of scope for this plan and are separate phased plans.
- Known deviations from spec, chosen for local testability and documented in Global Constraints: self-contained JWT auth instead of Supabase Auth (same `get_current_user` seam), SQLite-capable DB layer with JSON embeddings + Python cosine instead of pgvector, simulated token streaming for the SSE reply.
