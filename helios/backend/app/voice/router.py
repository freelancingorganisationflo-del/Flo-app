import base64
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..chat.service import run_chat
from ..config import settings
from ..db import get_db
from ..deps import get_current_user, get_llm, get_voice
from ..llm_gateway.client import LLMClient
from ..llm_gateway.routing import route_model
from ..models import User
from ..tasks.service import list_tasks
from .client import STT_MIME, VoiceClient, VoiceProviderError
from .text import clean_for_speech

router = APIRouter(prefix="/api/voice", tags=["voice"])


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    voice: str | None = None


class TalkRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: str | None = None


def _greeting() -> str:
    hour = datetime.now().hour
    if hour < 5:
        return "Working late"
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    if hour < 21:
        return "Good evening"
    return "Good evening"


def _compose_wake(user: User, tasks: list) -> str:
    pending = [t for t in tasks if t.status == "pending"]
    if not pending:
        return (
            f"{_greeting()}. I'm HELIOS. You have no pending tasks, so you're all clear. "
            "What would you like to do?"
        )
    if len(pending) == 1:
        intro = f"{_greeting()}. I'm HELIOS. You have 1 pending task"
    else:
        intro = f"{_greeting()}. I'm HELIOS. You have {len(pending)} pending tasks"
    top = pending[:3]
    titles = ", ".join(f"{t.title}" for t in top)
    if len(pending) > len(top):
        titles += ", and a few more"
    return (
        f"{intro}: {titles}. "
        "Would you like me to go over them, or take care of something else?"
    )


@router.get("/config")
async def voice_config(user: User = Depends(get_current_user)) -> dict:
    return {
        "stt_model": settings.user_stt_model,
        "tts_model": settings.user_tts_model,
        "tts_voice": settings.user_tts_voice,
        "tts_voices": settings.user_tts_available_voices,
    }


def _audio_format(filename: str) -> str:
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "wav").lower()
    if ext not in STT_MIME:
        return "wav"
    return ext


@router.post("/wake")
async def wake(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> dict:
    tasks = await list_tasks(db, user.id, status=None)
    text = _compose_wake(user, tasks)
    return {
        "text": text,
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "due_at": t.due_at.isoformat() if t.due_at else None,
            }
            for t in tasks[:10]
        ],
    }


@router.post("/stt")
async def transcribe(
    file: UploadFile,
    user: User = Depends(get_current_user),
    voice: VoiceClient = Depends(get_voice),
) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Audio file is empty"
        )
    audio_format = _audio_format(file.filename or "audio.wav")
    try:
        text = await voice.transcribe(data, audio_format=audio_format)
    except VoiceProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"STT failed: {exc}"
        ) from exc
    return {"text": text}


@router.post("/talk")
async def talk(
    req: TalkRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
    voice: VoiceClient = Depends(get_voice),
) -> Response:
    """One-shot spoken conversation turn: reply (spoken style) + audio bytes.

    The model is asked to answer in short, natural spoken sentences that match
    the user's language (Hinglish or English). Emojis/markdown are stripped
    before synthesis so the voice never reads symbols aloud.
    """
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Text cannot be empty")
    model = route_model(text)
    try:
        reply, _tool_events, _used_model = await run_chat(
            db, user, text, llm, model=model, spoken=True
        )
    except Exception:
        await db.rollback()
        raise
    clean = clean_for_speech(reply)
    if not clean:
        clean = "Sorry, I did not catch that. Could you say it again?"
    try:
        audio = await voice.synthesize(clean, voice=req.voice)
    except VoiceProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"TTS failed: {exc}"
        ) from exc
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": 'inline; filename="helios.mp3"',
            "X-Helios-Reply": base64.b64encode(clean.encode("utf-8")).decode("ascii"),
        },
    )


@router.post("/tts")
async def synthesize(
    req: TtsRequest,
    user: User = Depends(get_current_user),
    voice: VoiceClient = Depends(get_voice),
) -> Response:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Text cannot be empty")
    clean = clean_for_speech(text)
    if not clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing speakable in text"
        )
    try:
        audio = await voice.synthesize(clean, voice=req.voice)
    except VoiceProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"TTS failed: {exc}"
        ) from exc
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Content-Disposition": 'inline; filename="helios.mp3"'},
    )
