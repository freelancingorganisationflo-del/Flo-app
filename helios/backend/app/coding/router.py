import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_code_llm, get_current_user
from ..llm_gateway.client import LLMClient, LLMProviderError
from ..models import CodeFile, CodeMessage, CodeSession, User
from ..search.decision import normalize_mode
from .service import (
    create_file,
    create_session,
    delete_file,
    delete_session,
    get_file,
    get_session,
    list_sessions,
    normalize_messages,
    rename_session,
    session_files,
    session_messages,
    stream_code,
    stream_code_session,
    update_file,
)

router = APIRouter(prefix="/api/coding", tags=["coding"])


class CodeMessageIn(BaseModel):
    role: str
    content: str


class CodeRequest(BaseModel):
    messages: list[CodeMessageIn]
    model: str | None = None


class SessionCreate(BaseModel):
    title: str | None = None


class SessionRename(BaseModel):
    title: str


class SessionChat(BaseModel):
    message: str
    model: str | None = None
    mode: str = "auto"


class FileIn(BaseModel):
    name: str
    language: str = "text"
    content: str = ""


class FilePatch(BaseModel):
    name: str | None = None
    language: str | None = None
    content: str | None = None


def _available_models() -> list[str]:
    from ..llm_gateway.profiles import resolve_route

    return list(resolve_route("code").available_models)


def _resolve_model(model: str | None) -> str | None:
    if model is None or model in ("default", "auto"):
        return None
    available = _available_models()
    if model not in available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model '{model}' is not enabled. Available: {', '.join(available)}",
        )
    return model


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _session_out(session: CodeSession) -> dict:
    return {
        "id": session.id,
        "title": session.title,
        "created_at": _iso(session.created_at),
        "updated_at": _iso(session.updated_at),
    }


def _message_out(message: CodeMessage) -> dict:
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "model": message.model,
        "created_at": _iso(message.created_at),
    }


def _file_out(file: CodeFile) -> dict:
    return {
        "id": file.id,
        "name": file.name,
        "language": file.language,
        "content": file.content,
        "updated_at": _iso(file.updated_at),
    }


async def _owned_session(db: AsyncSession, user: User, session_id: int) -> CodeSession:
    session = await get_session(db, user.id, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


# --------------------------------------------------------------------------- #
# Sessions
# --------------------------------------------------------------------------- #


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def new_session(
    req: SessionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    session = await create_session(db, user.id, title=req.title)
    return _session_out(session)


@router.get("/sessions")
async def get_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    sessions = await list_sessions(db, user.id)
    return [_session_out(s) for s in sessions]


@router.get("/sessions/{session_id}")
async def get_session_detail(
    session_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    session = await _owned_session(db, user, session_id)
    messages = await session_messages(db, session.id)
    files = await session_files(db, session.id)
    return {
        **_session_out(session),
        "messages": [_message_out(m) for m in messages],
        "files": [_file_out(f) for f in files],
    }


@router.patch("/sessions/{session_id}")
async def patch_session(
    session_id: int,
    req: SessionRename,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    session = await _owned_session(db, user, session_id)
    session = await rename_session(db, session, req.title)
    return _session_out(session)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    session = await _owned_session(db, user, session_id)
    await delete_session(db, session)


@router.post("/sessions/{session_id}/stream")
async def stream_session(
    session_id: int,
    req: SessionChat,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_code_llm),
) -> StreamingResponse:
    message = req.message.strip()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty"
        )
    session = await _owned_session(db, user, session_id)
    model = _resolve_model(req.model)
    mode = normalize_mode(req.mode)

    async def event_gen():
        try:
            async for event in stream_code_session(
                db, user.id, session, message, llm, model=model, mode=mode
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except LLMProviderError as exc:
            yield f"data: {json.dumps({'type': 'error', 'text': str(exc)})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# --------------------------------------------------------------------------- #
# Workspace files
# --------------------------------------------------------------------------- #


@router.post("/sessions/{session_id}/files", status_code=status.HTTP_201_CREATED)
async def add_file(
    session_id: int,
    req: FileIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    session = await _owned_session(db, user, session_id)
    file = await create_file(
        db, user.id, session.id, req.name, language=req.language, content=req.content
    )
    return _file_out(file)


@router.patch("/sessions/{session_id}/files/{file_id}")
async def patch_file(
    session_id: int,
    file_id: int,
    req: FilePatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _owned_session(db, user, session_id)
    file = await get_file(db, user.id, file_id)
    if file is None or file.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    file = await update_file(
        db, file, name=req.name, language=req.language, content=req.content
    )
    return _file_out(file)


@router.delete(
    "/sessions/{session_id}/files/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_file(
    session_id: int,
    file_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _owned_session(db, user, session_id)
    file = await get_file(db, user.id, file_id)
    if file is None or file.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await delete_file(db, file)


# --------------------------------------------------------------------------- #
# Stateless stream (kept for API clients)
# --------------------------------------------------------------------------- #


@router.post("/stream")
async def code_stream(
    req: CodeRequest,
    user: User = Depends(get_current_user),
    llm: LLMClient = Depends(get_code_llm),
) -> StreamingResponse:
    model = _resolve_model(req.model)
    try:
        messages = normalize_messages([m.model_dump() for m in req.messages])
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    async def event_gen():
        try:
            async for event in stream_code(messages, llm, model=model):
                yield f"data: {json.dumps(event)}\n\n"
        except LLMProviderError as exc:
            yield f"data: {json.dumps({'type': 'error', 'text': str(exc)})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
