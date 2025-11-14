# api/app/schemas.py
from datetime import datetime
from typing import Optional, Any, Dict

from pydantic import BaseModel, EmailStr, Field
from pydantic import ConfigDict


# ================== Auth ==================
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    token: str


# ================== Mensagens ==================
class MessageCreate(BaseModel):
    content: str


class MessageRead(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ================== Threads ==================
class ThreadCreate(BaseModel):
    title: Optional[str] = None


class ThreadUpdate(BaseModel):
    # usado para PATCH/PUT parciais (ex.: alterar origin, lead_level etc.)
    title: Optional[str] = None
    human_takeover: Optional[bool] = None
    origin: Optional[str] = None
    lead_level: Optional[str] = None
    lead_score: Optional[int] = None
    # aceita metadata via API; no modelo está em "meta"
    metadata: Optional[Dict[str, Any]] = Field(default=None)


class TakeoverToggle(BaseModel):
    active: bool


class HumanReplyBody(BaseModel):
    content: str


class ThreadRead(BaseModel):
    id: int
    title: Optional[str] = None
    human_takeover: bool

    # ✅ campos que a UI usa
    origin: Optional[str] = None
    lead_level: Optional[str] = None
    lead_score: Optional[int] = None

    # ✅ expõe "metadata" pegando do atributo ORM "meta"
    metadata: Optional[Dict[str, Any]] = Field(default=None, alias="meta")

    external_user_phone: Optional[str] = None

    # Pydantic v2
    model_config = ConfigDict(
        from_attributes=True,       # substitui orm_mode=True
        populate_by_name=True       # permite preencher "metadata" a partir de "meta"
    )


# ================== CRM Schemas ==================
class ContactCreate(BaseModel):
    thread_id: int
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None


class ContactTagCreate(BaseModel):
    tag: str = Field(..., min_length=1, max_length=64)


class ContactNoteCreate(BaseModel):
    content: str = Field(..., min_length=1)


class ContactReminderCreate(BaseModel):
    message: str = Field(..., min_length=1)
    due_date: datetime


class ContactTagRead(BaseModel):
    id: int
    tag: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ContactNoteRead(BaseModel):
    id: int
    content: str
    created_at: datetime
    user_id: int
    model_config = ConfigDict(from_attributes=True)


class ContactReminderRead(BaseModel):
    id: int
    message: str
    due_date: datetime
    completed: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ContactRead(BaseModel):
    id: int
    thread_id: int
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    total_orders: int
    total_spent: int  # em centavos
    average_ticket: Optional[int] = None  # em centavos
    most_bought_products: Optional[Dict[str, Any]] = None
    last_interaction_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    tags: list[ContactTagRead] = []
    notes: list[ContactNoteRead] = []
    reminders: list[ContactReminderRead] = []
    model_config = ConfigDict(from_attributes=True)
