from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, get_vision
from ..models import User
from .client import IMAGE_MIME, VisionClient, VisionProviderError, enabled_models, resolve_model

router = APIRouter(prefix="/api/vision", tags=["vision"])


@router.get("/models")
async def list_models() -> dict:
    return {"default": resolve_model(None), "models": enabled_models()}


@router.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    question: str = Form(""),
    model: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    vision: VisionClient = Depends(get_vision),
) -> dict:
    del user, db
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image file is empty")
    if len(data) > vision.max_image_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image is too large",
        )
    mime = file.content_type or ""
    if mime not in IMAGE_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type '{mime}'. Allowed: {', '.join(IMAGE_MIME)}",
        )
    try:
        selected = resolve_model(model)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    try:
        reply = await vision.analyze(data, mime=mime, question=question or "", model=selected)
    except VisionProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"reply": reply, "model": selected}
