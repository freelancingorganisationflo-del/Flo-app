# Helios — Personal Assistant AI (Design Spec)

Date: 2026-08-15
Status: Approved by user (all 5 design sections)

## Overview

Helios is a multi-user personal assistant AI — a "Jarvis-style" assistant you talk to
with voice or text, that remembers facts about you, manages your tasks and reminders,
answers questions from your personal knowledge base (docs, web pages, audio notes),
and works well on mobile (PWA).

## Architecture

Standalone project. Single deployable: one FastAPI server + one React PWA build.

```
┌─────────────────────────────────────────────┐
│              React PWA (Client)              │
│   Chat UI · Tasks UI · Documents UI · Voice  │
└────────────────────┬────────────────────────┘
                     │ HTTPS / WebSocket
┌────────────────────▼────────────────────────┐
│             FastAPI (Backend)                │
│  ┌─────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │
│  │ Auth    │ │ Chat+  │ │ Tasks  │ │ RAG   │ │
│  │ Module  │ │ Memory │ │ Module │ │Module │ │
│  └─────────┘ └────────┘ └────────┘ └───────┘ │
│  ┌───────────┐ ┌─────────────┐                │
│  │ Voice     │ │ LLM Gateway │                │
│  │ Module    │ │ (provider-  │                │
│  │ (STT/TTS) │ │  agnostic)  │                │
│  └───────────┘ └─────────────┘                │
└───────┬────────────────────────────┬──────────┘
        │                            │
   ┌────▼─────┐              ┌───────▼────────┐
   │  Postgres│              │ LLM Provider   │
   │ + pgvector│             │ (OpenAI/Claude/│
   │ (Supabase)│             │  DeepSeek/any) │
   └──────────┘              └────────────────┘
```

### Key decisions

- **Single deployable**: one FastAPI server + one React build. No microservices.
- **LLM Gateway module**: all AI calls go through this one module — OpenAI, Claude,
  DeepSeek, any provider, switched via config. The user supplies their own API key;
  code reads it from `USER_LLM_API_KEY` (project-scoped env var), with placeholders
  in `.env.example`. Never reads or hardcodes Agent-runtime keys.
- **Supabase/Postgres**: chat history, memories, tasks, documents, and embeddings
  (pgvector) all here.
- **Multi-user**: each user's data is isolated via RLS; no cross-user access.

## Module 1 — Auth

- Multi-user accounts with login/signup.
- Auth via Supabase Auth (email/password), JWT sessions.
- Row Level Security on every table scoped to `user_id`.
- First-version roles: a user is either a regular member of their own data only.

## Module 2 — Chat + Memory

### Chat flow

```
User message → LLM Gateway → Assistant reply
      │                              │
      └── 1. Memory check ────────────┘
              │
              ├─ "Remember that..." → saves fact to memory store
              ├─ "What's my name?" → pulls from memory store
              └─ normal chat → replies normally
```

Routing via LLM tool-calling — `search_memory`, `search_documents`, and task tools
(`create_task`, `list_tasks`, etc.) are all available to the LLM on every message.
The LLM itself decides which tool to call based on the user's intent — no
keyword-matching.

### Memory store (`memories` table)

| Field | Purpose |
|---|---|
| `id`, `user_id` | ownership |
| `content` | one fact or detail (e.g. "birthday is Jan 5") |
| `embedding` | pgvector — semantic search |
| `created_at` | timestamp |

- When the user says something memorable, the assistant (via LLM) automatically
  decides whether to save it to memory. The memory-save decision is a **tool-call
  in the same LLM request** (e.g., `save_memory`) — no extra round-trip, which
  keeps latency under control.
- When replying, the assistant first searches relevant memories (semantic) and
  injects them into context.
- Manual add/delete from the UI is also supported.

### Chat storage (`messages` table)

- **No `conversations` table.** Full history is one continuous stream of messages
  per user — no `conversation_id`, no session grouping.
- Replies stream token-by-token (Server-Sent Events or WebSocket).

## Module 3 — Tasks & Reminders (production-ready)

### Tasks (`tasks` table)

| Field | Purpose |
|---|---|
| `id`, `user_id` | ownership |
| `title`, `notes` | what to do |
| `due_at` | due date/time (optional) |
| `priority` | high / medium / low |
| `status` | pending / done / cancelled |
| `created_at` | timestamp |
| `reminder_at` | exact time the reminder should fire (nullable) |
| `recurrence` | JSONB: `{"freq": "daily"\|"weekly"\|"monthly", "interval": 1, "by_day": [1,5], "time": "08:00"}` (nullable) |
| `completed_at` | when task was marked done (nullable) |
| `reminded_at` | when the reminder last fired (nullable; null = not yet reminded) |
| `updated_at` | auto-updated on every change |

### Reminder worker

- Runs inside the FastAPI app as a long-running `asyncio` task
  (`BackgroundTasks` / app lifespan).
- Polls every ~30s for pending reminders: `reminder_at <= now` AND `status = pending`
  AND not-yet-reminded.
- When one fires: sends a notification, marks it as reminded.
- **Recurring reminders**: after firing, the worker computes the next occurrence from
  the recurrence rules and updates `reminder_at`.
- **Crash-safe**: on worker restart, missed reminders are picked up (based on the
  "reminded" flag).
- Designed so it can be extracted later into a separate worker process
  (e.g., Celery/APScheduler) without changing the schema.

**MVP limitation**: the worker is **single-instance** for now. If you scale to
multiple app instances, each would run its own worker and the same reminder could
fire more than once (duplicate notifications). Extracting to Celery/APScheduler
(or adding a DB-level lock / `FOR UPDATE SKIP LOCKED`) becomes **required** before
running more than one instance.

### Natural-language parsing (LLM tool-calling)

- "Remind me tomorrow at 5 PM" → one-time task + `reminder_at` = tomorrow 5 PM.
- "Remind me every Monday at 8 AM" → `recurrence` = `{"freq":"weekly","by_day":[1],"time":"08:00"}` + `reminder_at` = next Monday 8 AM.
- The assistant always confirms parsed details before saving.

### Reminder delivery

- PWA web-push notification; also shows a banner inside the chat UI.
- Optional daily summary of pending tasks.

### Task commands (tools exposed to the LLM)

`create_task`, `list_tasks`, `complete_task`, `update_task`, `delete_task`.

- "What's on my plate today?" → lists tasks.
- "Mark 'call Ravi' done" → completes it.

### Compatibility

`Chat + Memory` modules are untouched. `tasks` only adds new tools to the LLM Gateway.
Schema evolution is additive (new columns only); no breaking changes.

## Module 4 — RAG (Knowledge Base)

### Ingestion pipeline

```
Upload doc / paste URL / record voice note
        │
        ▼
[Extractor] PDF · Word · TXT · Markdown · HTML
        │
        ▼
[Text splitter] chunks (500-1000 chars, overlap)
        │
        ▼
[Embedder] → pgvector embeddings
        │
        ▼
[Postgres] documents + chunks + embeddings
```

### Tables

| Table | Purpose |
|---|---|
| `documents` | metadata — `id, user_id, title, type (file/url/audio), source, created_at` |
| `document_chunks` | `id, document_id, content, embedding (pgvector), position` |

### Supported sources

- **Files**: PDF, DOCX, TXT, Markdown — file upload.
- **Web pages**: URL paste → fetch + clean HTML → index.
- **Audio notes**: voice note upload → speech-to-text transcription → index
  (transcribed text is chunked).

### Query flow

```
User: "What did I write about my project plans?"
        │
        ▼
1. Embed question
2. Semantic search → top 5 relevant chunks
3. Inject as context to LLM
4. Assistant answers WITH source citations
```

### Privacy

Every `document` / `chunk` is user-owned (multi-user RLS). A user can never see
another user's data.

### Management UI

- Documents list, upload, delete, re-index.
- The chat automatically detects when a question targets the knowledge base
  (vs memory vs normal chat).

### Modularity

`rag` module is standalone — `ingest` + `search` interfaces. The chat module only
uses RAG results through the LLM Gateway; no tight coupling.

## Module 5 — Voice (STT / TTS)

```
User speaks → [Mic → Web Audio → audio file/blob]
        │
        ▼
[STT] speech-to-text (backend)
        │
        ▼
[Chat pipeline] (memory + tasks + RAG, same as text)
        │
        ▼
[TTS] text-to-speech → audio stream
        │
        ▼
User hears reply (playback in app)
```

### Speech-to-Text (STT)

- Backend endpoint `/api/voice/stt` — audio upload → text.
- Provider-agnostic (through LLM Gateway): OpenAI Whisper, DeepSeek-compatible,
  or any STT service — switched via config.
- Voice notes (for RAG) are transcribed with the same STT.

### Text-to-Speech (TTS)

- Endpoint `/api/voice/tts` — text → audio bytes.
- Provider-agnostic, switched via config.
- Streaming TTS: long replies stream audio chunk-by-chunk.

### PWA mic handling

- Browser `MediaRecorder` API → blob → backend.
- Push-to-talk button (tap-to-speak) + audio auto-play.
- Works on mobile (PWA mic support).

### Error handling

- No mic permission → text input fallback with a clear prompt.
- STT failure → assistant asks "Couldn't hear that, want to type it?"
- TTS failure → text reply still shows, no silent failure.

### Modularity

`voice` module is standalone — `STT` and `TTS` interfaces. Chat uses the normal text
flow; voice only converts input/output. RAG audio notes reuse `voice.STT`.

## Configuration (LLM keys)

- User-supplied, project-scoped env vars only, e.g.:
  - `USER_LLM_API_KEY`
  - `USER_LLM_BASE_URL`
  - `USER_LLM_MODEL`
- `.env.example` contains placeholders (never real values).
- The backend reads these at runtime; the user fills in their own key.

## Testing strategy

- Unit tests per module (pytest for backend).
- RAG pipeline tested with sample docs (small PDF/text fixtures).
- Reminder worker tested with a fake clock / short intervals.
- Chat + tool-calling tested with mocked LLM responses.
- Frontend: manual QA checklist (no test framework decided yet — to be decided in
  the implementation plan).

## Out of scope (MVP)

- Native Android/iOS apps (PWA covers mobile for now).
- Multi-device push outside the browser.
- Full natural-language task parsing beyond reminders.
- Celery/APScheduler worker extraction (schema is ready for it, but it ships
  as an in-process task).
