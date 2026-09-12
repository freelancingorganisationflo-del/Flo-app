from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, get_llm
from ..llm_gateway.client import LLMClient
from ..models import User
from .decision import VALID_MODES, decide_web_search, normalize_mode
from .pipeline import answer_from_evidence, gather_evidence
from .service import SearchError, fetch_page, search_web

router = APIRouter(prefix="/api/search", tags=["search"])
web_router = APIRouter(prefix="/api/web-search", tags=["search"])


class FetchRequest(BaseModel):
    url: str = Field(min_length=1)


class WebSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    conversation_id: str | None = None
    mode: str = "auto"


@router.get("")
async def search(
    q: str = Query(min_length=1),
    limit: int = Query(default=8, ge=1, le=20),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del user, db
    query = q.strip()
    if not query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query cannot be empty")
    try:
        results = await search_web(query, max_results=limit)
    except SearchError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"query": query, "results": results}


@router.post("/fetch")
async def fetch(
    req: FetchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del user, db
    try:
        return await fetch_page(req.url.strip())
    except SearchError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@web_router.post("")
async def web_search(
    req: WebSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    del db
    query = req.query.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Query cannot be empty"
        )
    if req.mode not in VALID_MODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid mode '{req.mode}'. Use one of: {', '.join(VALID_MODES)}",
        )
    mode = normalize_mode(req.mode)
    response: dict = {
        "query": query,
        "searched": False,
        "sources": [],
        "answer": "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "searchId": uuid4().hex,
        "mode": mode,
    }
    if not decide_web_search(query, mode):
        return response

    research = await gather_evidence(
        query, llm, search_fn=search_web, fetch_fn=fetch_page
    )
    response["searched"] = research["searched"]
    response["sources"] = research["sources"]
    if not research["searched"]:
        response["answer"] = "I couldn't find reliable information for this query."
        return response
    response["answer"] = await answer_from_evidence(query, research["evidence"], llm)
    return response
