import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, get_llm
from ..llm_gateway.client import LLMClient, LLMProviderError
from ..llm_gateway.profiles import resolve_route
from ..llm_gateway.routing import route_model
from ..models import User
from ..search.decision import normalize_mode
from .service import run_chat_with_sources, stream_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    model: str | None = None
    spoken: bool = False
    mode: str = "auto"


def _general_route():
    return resolve_route("general")


def _resolve_model(model: str | None, message: str) -> str | None:
    if model is None or model in ("default", "auto"):
        return route_model(message)
    available = _general_route().available_models
    if model not in available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model '{model}' is not enabled. Available: {', '.join(available)}",
        )
    return model


@router.get("/models")
async def list_models() -> dict:
    route = _general_route()
    default = route.model
    models = list(route.available_models)
    if default not in models:
        models.insert(0, default)
    return {"default": default, "models": models}


@router.post("")
async def chat(
    req: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    if not req.message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")
    model = _resolve_model(req.model, req.message.strip())
    try:
        final, tool_events, used_model, sources = await run_chat_with_sources(
            db,
            user,
            req.message.strip(),
            llm,
            model=model,
            spoken=req.spoken,
            mode=normalize_mode(req.mode),
        )
    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return {
        "reply": final,
        "tool_events": tool_events,
        "sources": sources,
        "model": used_model or _general_route().model,
    }


@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> StreamingResponse:
    if not req.message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")
    model = _resolve_model(req.model, req.message.strip())
    mode = normalize_mode(req.mode)

    async def event_gen():
        try:
            async for event in stream_chat(
                db, user, req.message.strip(), llm, model=model, spoken=req.spoken, mode=mode
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except LLMProviderError as exc:
            yield f"data: {json.dumps({'type': 'error', 'text': str(exc)})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
