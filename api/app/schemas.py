# api/app/schemas.py
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, date


# =========================
# Auth / Threads / Messages
# =========================
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    token: str


class MessageCreate(BaseModel):
    content: str


class MessageRead(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True  # pydantic v2


class ThreadRead(BaseModel):
    id: int
    title: Optional[str] = None
    human_takeover: bool
    # (opcional) inclua created_at se quiser na UI:
    # created_at: datetime | None = None

    class Config:
        from_attributes = True


class ThreadCreate(BaseModel):
    title: Optional[str] = None


class TakeoverToggle(BaseModel):
    active: bool


class HumanReplyBody(BaseModel):
    content: str


# =========================
# CRM: Contacts / Deals / Obligations
# =========================
# --- Contacts ---
class ContactBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    stage: str = Field(default="lead", pattern="^(lead|client)$")
    heat: str = Field(default="cold", pattern="^(hot|warm|cold)$")
    await_status: str = Field(default="none", pattern="^(none|awaiting_client|awaiting_us|awaiting_payment)$")
    is_real: bool = False
    notes: Optional[str] = None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    stage: Optional[str] = None
    heat: Optional[str] = None
    await_status: Optional[str] = None
    is_real: Optional[bool] = None
    notes: Optional[str] = None


class ContactRead(ContactBase):
    id: int
    owner_user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Deals (Kanban) ---
class DealBase(BaseModel):
    contact_id: int
    title: str
    value: float = 0.0
    column: str = Field(default="novo")       # novo | qualificacao | proposta | fechamento | ganho | perdido
    priority: str = Field(default="normal")   # baixa | normal | alta
    due_date: Optional[date] = None
    tags: Optional[List[str]] = None


class DealCreate(DealBase):
    pass


class DealUpdate(BaseModel):
    contact_id: Optional[int] = None
    title: Optional[str] = None
    value: Optional[float] = None
    column: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    tags: Optional[List[str]] = None


class DealRead(DealBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Obligations (Calendar) ---
class ObligationBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: datetime
    status: str = Field(default="open")  # open | done
    contact_id: Optional[int] = None


class ObligationCreate(ObligationBase):
    pass


class ObligationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = None
    contact_id: Optional[int] = None


class ObligationRead(ObligationBase):
    id: int
    owner_user_id: int
    created_at: datetime

    class Config:
        from_attributes = True
