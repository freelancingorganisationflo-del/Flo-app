# Helios — Personal Assistant AI

Backend (Plans 1-4): FastAPI + SQLAlchemy async + JWT auth + LLM Gateway +
Chat + Memory + Tasks & Reminders + Knowledge Base (RAG). Frontend (PWA,
Plan 3) is a React/Vite PWA with chat, tasks, memory, and documents UIs.
Voice module comes in a later plan.

## Run locally

```bash
# 1. Backend
cd backend
cp .env.example .env   # then fill in USER_LLM_API_KEY with your own key
python3 -m pip install --break-system-packages -r requirements.txt
uvicorn app.main:app --reload

# 2. Frontend (separate terminal)
cd frontend
pnpm install
pnpm dev
```

Or run both with the start script:

```bash
./start.sh
```

- Backend: http://localhost:8000/docs (interactive API browser)
- Frontend: http://localhost:5001 (Vite dev server, proxies `/api` → backend)

## Endpoints (Plan 1)

- `POST /api/auth/signup` — create account, returns JWT
- `POST /api/auth/login` — login, returns JWT
- `GET  /api/auth/me` — current user
- `POST /api/memory` — manually save a memory (auto-embeds)
- `GET  /api/memory` — list memories
- `DELETE /api/memory/{id}` — delete a memory
- `POST /api/chat` — send a message, get JSON reply
- `POST /api/chat/stream` — send a message, get SSE stream (tool + delta + done events)
- `POST   /api/tasks` — create a task/reminder (201)
- `GET    /api/tasks` — list tasks (optional `?status=pending|done|cancelled`)
- `GET    /api/tasks/{id}` — get one task
- `PATCH  /api/tasks/{id}` — partially update a task
- `POST   /api/tasks/{id}/complete` — mark a task done
- `DELETE /api/tasks/{id}` — delete a task (204)

### Knowledge base (RAG, Plan 4)

- `POST /api/documents` — upload a file (TXT/MD/PDF/DOCX/HTML), splits + embeds
- `POST /api/documents/url` — ingest a web page from a URL
- `GET  /api/documents` — list documents
- `GET  /api/documents/{id}` — get one document
- `GET  /api/documents/{id}/content` — get the full extracted text
- `GET  /api/documents/search?q=...` — semantic search over chunks
- `DELETE /api/documents/{id}` — delete a document and its chunks (204)

Chat tool `search_documents` lets the assistant search the user's knowledge
base and answer with source attribution.

## Tests

```bash
cd backend
python3 -m pytest tests/ -v

cd frontend
pnpm lint && pnpm build
```

## Env vars

Only `USER_LLM_*` variables are used for the LLM. Supply your own key in `.env`.

- `DATABASE_URL` — `sqlite+aiosqlite:///./helios.db` (dev) or
  `postgresql+asyncpg://user:pass@host:5432/helios` (production)
- `USER_LLM_API_KEY`, `USER_LLM_BASE_URL`, `USER_LLM_MODEL`,
  `USER_LLM_EMBEDDING_MODEL`
