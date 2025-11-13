# app/routers/tasks.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal, Optional, List, Dict, Union
from app.auth import get_current_user
from app.models import User

TaskStatus = Literal["open", "done"]

# ===== Schemas =====
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1)
    due_date: Optional[str] = Field(None, description="ISO (yyyy-mm-dd) ou null")
    notes: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    due_date: Optional[Optional[str]] = None  # permite setar null
    status: Optional[TaskStatus] = None
    notes: Optional[Optional[str]] = None      # permite setar null

class TaskOut(BaseModel):
    id: Union[int, str]
    title: str
    due_date: Optional[str] = None
    status: TaskStatus
    notes: Optional[str] = None

router = APIRouter(prefix="/tasks", tags=["tasks"])

# ===== Armazenamento em memória (por usuário) =====
_STORE: Dict[int, Dict[int, TaskOut]] = {}  # user_id -> {task_id: TaskOut}
_COUNTER: Dict[int, int] = {}               # user_id -> last_id

def _next_id(uid: int) -> int:
    _COUNTER[uid] = _COUNTER.get(uid, 0) + 1
    return _COUNTER[uid]

def _ensure_user_store(uid: int) -> Dict[int, TaskOut]:
    if uid not in _STORE:
        _STORE[uid] = {}
        _COUNTER[uid] = 0
    return _STORE[uid]

# ===== Endpoints =====
@router.get("", response_model=List[TaskOut])
def list_tasks(user: User = Depends(get_current_user)):
    store = _ensure_user_store(user.id)
    # retorna mais recentes primeiro
    return sorted(store.values(), key=lambda t: int(t.id), reverse=True)

@router.post("", response_model=TaskOut)
def create_task(payload: TaskCreate, user: User = Depends(get_current_user)):
    store = _ensure_user_store(user.id)
    tid = _next_id(user.id)
    task = TaskOut(
        id=tid,
        title=payload.title.strip(),
        due_date=payload.due_date or None,
        status="open",
        notes=(payload.notes or None),
    )
    store[tid] = task
    return task

@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, user: User = Depends(get_current_user)):
    store = _ensure_user_store(user.id)
    if task_id not in store:
        raise HTTPException(404, "Task not found")

    cur = store[task_id]
    updated = TaskOut(
        id=cur.id,
        title=payload.title.strip() if isinstance(payload.title, str) and payload.title.strip() else cur.title,
        due_date=payload.due_date if payload.due_date is not None else cur.due_date,
        status=payload.status or cur.status,
        notes=payload.notes if payload.notes is not None else cur.notes,
    )
    store[task_id] = updated
    return updated

@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, user: User = Depends(get_current_user)):
    store = _ensure_user_store(user.id)
    if task_id not in store:
        raise HTTPException(404, "Task not found")
    del store[task_id]
    return None
