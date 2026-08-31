import json
import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Memory


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def add_memory(db: AsyncSession, user_id: int, content: str, embedding: list[float]) -> Memory:
    mem = Memory(user_id=user_id, content=content, embedding_json=json.dumps(embedding))
    db.add(mem)
    await db.commit()
    await db.refresh(mem)
    return mem


async def search_memories(
    db: AsyncSession, user_id: int, query_embedding: list[float], top_k: int | None = None
) -> list[Memory]:
    top_k = top_k or settings.memory_top_k
    rows = (
        (await db.execute(select(Memory).where(Memory.user_id == user_id))).scalars().all()
    )
    scored = []
    for mem in rows:
        if not mem.embedding_json:
            continue
        emb = json.loads(mem.embedding_json)
        score = cosine_similarity(query_embedding, emb)
        if score < settings.search_min_score:
            continue
        scored.append((score, mem))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [mem for _, mem in scored[:top_k]]


async def list_memories(db: AsyncSession, user_id: int) -> list[Memory]:
    return (
        (
            await db.execute(
                select(Memory).where(Memory.user_id == user_id).order_by(Memory.id.desc())
            )
        )
        .scalars()
        .all()
    )


async def delete_memory(db: AsyncSession, user_id: int, memory_id: int) -> bool:
    mem = await db.get(Memory, memory_id)
    if mem is None or mem.user_id != user_id:
        return False
    await db.delete(mem)
    await db.commit()
    return True
