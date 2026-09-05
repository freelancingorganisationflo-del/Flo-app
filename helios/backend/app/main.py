import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .auth.router import router as auth_router
from .chat.router import router as chat_router
from .db import Base, engine
from .memory.router import router as memory_router
from .rag.router import router as rag_router
from .search.router import router as search_router
from .tasks.router import router as tasks_router
from .tasks.worker import run_reminder_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    stop_event = asyncio.Event()
    worker_task = asyncio.create_task(run_reminder_worker(stop_event))
    yield
    stop_event.set()
    await worker_task


app = FastAPI(title="Helios", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(memory_router)
app.include_router(chat_router)
app.include_router(tasks_router)
app.include_router(rag_router)
app.include_router(search_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
