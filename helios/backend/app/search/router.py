from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import User
from .service import SearchError, fetch_page, search_web

router = APIRouter(prefix="/api/search", tags=["search"])


class FetchRequest(BaseModel):
    url: str = Field(min_length=1)


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
