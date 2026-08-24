import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, get_llm
from ..llm_gateway.client import LLMClient, LLMProviderError
from ..models import User
from .extract import ExtractionError, extract_text_from_bytes, extract_text_from_html
from .service import (
    delete_document,
    get_document,
    ingest_text,
    list_documents,
    search_documents,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])


class UrlIngestRequest(BaseModel):
    url: str = Field(min_length=1)


def _to_dict(doc, indexed: bool) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "type": doc.type,
        "source": doc.source,
        "indexed": indexed,
        "created_at": str(doc.created_at),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    data = await file.read()
    try:
        text = extract_text_from_bytes(data, file.filename or "upload")
    except ExtractionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No readable text found in the file",
        )

    async def embed(text: str) -> list[float]:
        try:
            return await llm.embed(text)
        except (LLMProviderError, httpx.HTTPError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM service unavailable: {exc}",
            ) from exc

    title = (file.filename or "Untitled").rsplit(".", 1)[0]
    try:
        doc = await ingest_text(db, user.id, title, text, embed, doc_type="file", source=file.filename)
    except Exception:
        await db.rollback()
        raise
    return _to_dict(doc, indexed=True)


@router.post("/url", status_code=status.HTTP_201_CREATED)
async def ingest_url(
    req: UrlIngestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(
                req.url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
                    ),
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        hint = (
            "The site blocked automated access (403). Try copying the page "
            "content into a text file instead."
            if code == 403
            else f"The site returned HTTP {code}."
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Could not fetch URL: {hint}"
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Could not fetch URL: {exc}"
        ) from exc

    text = extract_text_from_html(resp.text)
    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No readable text found at that URL",
        )

    async def embed(text: str) -> list[float]:
        try:
            return await llm.embed(text)
        except (LLMProviderError, httpx.HTTPError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM service unavailable: {exc}",
            ) from exc

    title = req.url.split("//")[-1].split("/")[0] or req.url
    try:
        doc = await ingest_text(db, user.id, title, text, embed, doc_type="url", source=req.url)
    except Exception:
        await db.rollback()
        raise
    return _to_dict(doc, indexed=True)


@router.get("")
async def list_all(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    docs = await list_documents(db, user.id)
    return [_to_dict(doc, indexed) for doc, indexed in docs]


@router.get("/search")
async def search(
    q: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    if not q.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query cannot be empty")
    try:
        embedding = await llm.embed(q.strip())
    except (LLMProviderError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM service unavailable: {exc}",
        ) from exc
    results = await search_documents(db, user.id, embedding)
    return {"results": results}


@router.get("/{document_id}")
async def read_one(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_document(db, user.id, document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return _to_dict(doc, indexed=True)


@router.get("/{document_id}/content")
async def read_content(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_document(db, user.id, document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    from sqlalchemy import select

    from ..models import DocumentChunk

    rows = (
        (
            await db.execute(
                select(DocumentChunk)
                .where(DocumentChunk.document_id == document_id)
                .order_by(DocumentChunk.position)
            )
        )
        .scalars()
        .all()
    )
    return {"chunks": [r.content for r in rows]}


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not await delete_document(db, user.id, document_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
