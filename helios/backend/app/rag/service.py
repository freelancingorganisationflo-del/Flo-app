import json

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Document, DocumentChunk
from ..memory.service import cosine_similarity
from .splitter import split_text


async def ingest_text(
    db: AsyncSession,
    user_id: int,
    title: str,
    text: str,
    embed,
    doc_type: str = "file",
    source: str | None = None,
) -> Document:
    """Split text, embed every chunk, and store the document + chunks."""
    doc = Document(user_id=user_id, title=title, type=doc_type, source=source)
    db.add(doc)
    await db.flush()

    chunks = split_text(text)
    for position, chunk in enumerate(chunks):
        embedding = await embed(chunk)
        db.add(
            DocumentChunk(
                user_id=user_id,
                document_id=doc.id,
                content=chunk,
                embedding_json=json.dumps(embedding),
                position=position,
            )
        )
    await db.commit()
    await db.refresh(doc)
    return doc


async def list_documents(db: AsyncSession, user_id: int) -> list[Document]:
    rows = (
        (
            await db.execute(
                select(Document)
                .where(Document.user_id == user_id)
                .order_by(Document.id.desc())
            )
        )
        .scalars()
        .all()
    )
    result = []
    for doc in rows:
        count = await db.scalar(
            select(DocumentChunk.id).where(DocumentChunk.document_id == doc.id).limit(1)
        )
        result.append((doc, count is not None))
    return result


async def get_document(db: AsyncSession, user_id: int, doc_id: int) -> Document | None:
    doc = await db.get(Document, doc_id)
    if doc is None or doc.user_id != user_id:
        return None
    return doc


async def delete_document(db: AsyncSession, user_id: int, doc_id: int) -> bool:
    doc = await get_document(db, user_id, doc_id)
    if doc is None:
        return False
    await db.execute(
        delete(DocumentChunk).where(DocumentChunk.document_id == doc_id)
    )
    await db.delete(doc)
    await db.commit()
    return True


async def search_documents(
    db: AsyncSession, user_id: int, query_embedding: list[float], top_k: int | None = None
) -> list[dict]:
    """Return top-k chunks (with document titles) for a query embedding.

    Only chunks whose similarity meets the configured minimum score are
    returned, and identical chunk text is deduplicated so near-duplicate
    documents don't flood the results.
    """
    top_k = top_k or settings.documents_top_k
    rows = (
        (await db.execute(select(DocumentChunk).where(DocumentChunk.user_id == user_id)))
        .scalars()
        .all()
    )
    scored: list[tuple[float, DocumentChunk]] = []
    seen_content: set[str] = set()
    for chunk in rows:
        if not chunk.embedding_json:
            continue
        emb = json.loads(chunk.embedding_json)
        score = cosine_similarity(query_embedding, emb)
        if score < settings.search_min_score:
            continue
        if chunk.content in seen_content:
            continue
        seen_content.add(chunk.content)
        scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)

    doc_titles: dict[int, str] = {}
    result: list[dict] = []
    for score, chunk in scored[:top_k]:
        if chunk.document_id not in doc_titles:
            doc = await db.get(Document, chunk.document_id)
            doc_titles[chunk.document_id] = doc.title if doc else "Untitled"
        result.append(
            {
                "content": chunk.content,
                "title": doc_titles[chunk.document_id],
                "score": round(score, 4),
            }
        )
    return result
