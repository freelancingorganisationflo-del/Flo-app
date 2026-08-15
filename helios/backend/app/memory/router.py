from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, get_llm
from ..llm_gateway.client import LLMClient
from ..models import User
from .service import add_memory, delete_memory, list_memories

router = APIRouter(prefix="/api/memory", tags=["memory"])


class AddMemoryRequest(BaseModel):
    content: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_memory(
    req: AddMemoryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> dict:
    embedding = await llm.embed(req.content)
    mem = await add_memory(db, user.id, req.content, embedding)
    return {"id": mem.id, "content": mem.content}


@router.get("")
async def get_memories(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    mems = await list_memories(db, user.id)
    return [{"id": m.id, "content": m.content, "created_at": str(m.created_at)} for m in mems]


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_memory(
    memory_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not await delete_memory(db, user.id, memory_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")
