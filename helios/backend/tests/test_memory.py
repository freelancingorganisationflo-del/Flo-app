from sqlalchemy import select

from app.memory.service import (
    add_memory,
    cosine_similarity,
    delete_memory,
    list_memories,
    search_memories,
)
from app.models import Memory


def test_cosine_similarity_basics():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert abs(cosine_similarity([1.0, 0.0], [0.0, 1.0])) < 1e-9
    assert cosine_similarity([], [1.0]) == 0.0


async def test_add_and_list_memory(db_session):
    mem = await add_memory(db_session, user_id=1, content="likes coffee", embedding=[1.0, 0.0])
    assert mem.id is not None
    mems = await list_memories(db_session, 1)
    assert len(mems) == 1
    assert mems[0].content == "likes coffee"


async def test_search_ranks_relevant_first(db_session):
    await add_memory(db_session, 1, "I love hiking in the mountains", [1.0, 0.0, 0.0])
    await add_memory(db_session, 1, "My cat is named Milo", [0.0, 1.0, 0.0])
    results = await search_memories(db_session, 1, [0.9, 0.1, 0.0], top_k=2)
    assert results[0].content == "I love hiking in the mountains"


async def test_search_scoped_to_user(db_session):
    await add_memory(db_session, 1, "user one secret", [1.0, 0.0])
    await add_memory(db_session, 2, "user two secret", [1.0, 0.0])
    results = await search_memories(db_session, 1, [1.0, 0.0], top_k=5)
    assert len(results) == 1
    assert results[0].content == "user one secret"


async def test_delete_memory(db_session):
    mem = await add_memory(db_session, 1, "temp", [1.0])
    assert await delete_memory(db_session, 1, mem.id) is True
    assert await delete_memory(db_session, 1, mem.id) is False
    rows = (await db_session.execute(select(Memory))).scalars().all()
    assert len(rows) == 0
