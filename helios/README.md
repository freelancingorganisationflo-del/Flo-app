# Helios — Personal Assistant AI

Backend (Plans 1-4): FastAPI + SQLAlchemy async + JWT auth + LLM Gateway +
Chat + Memory + Tasks & Reminders + Knowledge Base (RAG) + Web Search.
Frontend (PWA, Plan 3) is a React/Vite PWA with chat, tasks, memory,
documents, web search, voice, and vision UIs.

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

### Vision (image understanding)

- `GET  /api/vision/models` — configured vision models
- `POST /api/vision/analyze` — multipart `file` (+ optional `question`/`model`)
  and gets a multimodal model to describe, OCR, or answer about the image

### Web search

- `GET  /api/search?q=...` — live web search (DuckDuckGo, no API key)
- `POST /api/search/fetch` — fetch a public page and extract readable text
- `POST /api/web-search` — full research pipeline: `{query, mode}` returns
  `{searched, sources[], answer, searchId, mode, timestamp}`

Chat tools `web_search` and `fetch_url` let the assistant look up current
information and cite sources. Private/local URLs are blocked.

#### Search modes

The chat UI (and `/api/web-search`) expose three modes, persisted per browser
as `helios_search_mode`:

- `auto` — HELIOS decides; factual/current questions search, while greetings,
  personal task/memory commands, and clock questions (`current_datetime` tool)
  skip the web.
- `web` — always run a live search.
- `off` — never search.

#### Research pipeline

`app/search/` is modular so the backend can be swapped or disabled:

- `providers/` — swappable `SearchProvider` backends (DuckDuckGo by default,
  selected with `SEARCH_PROVIDER`).
- `decision.py` — per-request mode + message heuristics.
- `pipeline.py` — `plan_queries` (1..N, Hinglish→English rewrite, dedup,
  spam drop), `rank_sources` (relevance/quality/freshness), untrusted-content
  sanitising, and `answer_from_evidence` grounded on live sources only.
- `cache.py` — short TTL cache for searches/pages.
- `security.py` — SSRF guard; `errors.py` — typed errors.

Streaming emits `stage`, `sources`, `tool`, `delta`, and `done` SSE events so
the UI can show a live progress indicator and a clickable Sources panel.


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
- `SEARCH_PROVIDER` — web-search backend, default `duckduckgo`
- `SEARCH_API_KEY` — optional key for keyed providers
- `WEB_SEARCH_MAX_RESULTS` (8), `WEB_SEARCH_MAX_QUERIES` (3),
  `WEB_SEARCH_RESULTS_PER_QUERY` (5), `WEB_FETCH_MAX_PAGES` (2),
  `WEB_FETCH_MAX_CHARS` (8000), `WEB_SEARCH_TIMEOUT_SECONDS` (20),
  `WEB_SEARCH_CACHE_TTL_SECONDS` (300)
- `USER_VISION_MODEL` — default model used for image analysis
  (e.g. `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, a free
  vision-capable model). Paid vision models like `google/gemini-2.5-flash`
  work too. Enable image-capable model ids in `USER_LLM_AVAILABLE_MODELS`
  so they appear in the Vision page picker.
