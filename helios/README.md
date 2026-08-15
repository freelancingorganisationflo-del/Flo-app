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
