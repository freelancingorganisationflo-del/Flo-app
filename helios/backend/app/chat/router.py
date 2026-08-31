import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..deps import get_current_user, get_llm
from ..llm_gateway.client import LLMClient
from ..llm_gateway.routing import route_model
from ..models import User
from .service import run_chat, stream_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    model: str | None = None


def _resolve_model(model: str | None, message: str) -> str | None:
    if model is None or model in ("default", "auto"):
        return route_model(message)
    available = settings.user_llm_available_models
    if model not in available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model '{model}' is not enabled. Available: {', '.join(available)}",
        )
    return model


@router.get("/models")
async def list_models() -> dict:
    default = settings.user_llm_model
    models = list(settings.user_llm_available_models)
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
    final, tool_events, used_model = await run_chat(db, user, req.message.strip(), llm, model=model)
    return {"reply": final, "tool_events": tool_events, "model": used_model or settings.user_llm_model}


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

    async def event_gen():
        async for event in stream_chat(db, user, req.message.strip(), llm, model=model):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
