from sqlalchemy import select

from app.models import Task
from app.tasks.service import (
    complete_task,
    create_task,
    delete_task,
    get_task,
    list_tasks,
    update_task,
)


async def test_create_and_get_task(db_session):
    task = await create_task(db_session, user_id=1, title="call Ravi", priority="high")
    assert task.id is not None
    assert task.status == "pending"
    fetched = await get_task(db_session, 1, task.id)
    assert fetched is not None
    assert fetched.title == "call Ravi"
    assert await get_task(db_session, 2, task.id) is None


async def test_list_filters_by_status(db_session):
    await create_task(db_session, 1, "one")
    done = await create_task(db_session, 1, "two")
    await complete_task(db_session, 1, done.id)
    await create_task(db_session, 2, "other user's task")

    all_tasks = await list_tasks(db_session, 1)
    assert len(all_tasks) == 2
    pending = await list_tasks(db_session, 1, status="pending")
    assert [t.title for t in pending] == ["one"]
    assert [t.title for t in await list_tasks(db_session, 2)] == ["other user's task"]


async def test_update_task(db_session):
    task = await create_task(db_session, 1, "buy milk")
    updated = await update_task(db_session, 1, task.id, title="buy oat milk", priority="low")
    assert updated is not None
    assert updated.title == "buy oat milk"
    assert updated.priority == "low"
    assert await update_task(db_session, 9, task.id, title="x") is None


async def test_complete_task(db_session):
    task = await create_task(db_session, 1, "water plants")
    done = await complete_task(db_session, 1, task.id)
    assert done is not None
    assert done.status == "done"
    assert done.completed_at is not None
    assert await complete_task(db_session, 9, task.id) is None


async def test_delete_task(db_session):
    task = await create_task(db_session, 1, "temp")
    assert await delete_task(db_session, 1, task.id) is True
    assert await delete_task(db_session, 1, task.id) is False
    rows = (await db_session.execute(select(Task))).scalars().all()
    assert len(rows) == 0


async def test_update_task_ignores_unknown_fields(db_session):
    task = await create_task(db_session, 1, "guard")
    updated = await update_task(db_session, 1, task.id, owner_id=99, title="guarded")
    assert updated is not None
    assert updated.user_id == 1
    assert updated.title == "guarded"


async def test_update_status_tracks_completed_at(db_session):
    task = await create_task(db_session, 1, "flip")
    done = await update_task(db_session, 1, task.id, status="done")
    assert done is not None
    assert done.completed_at is not None
    reopened = await update_task(db_session, 1, task.id, status="pending")
    assert reopened is not None
    assert reopened.completed_at is None
