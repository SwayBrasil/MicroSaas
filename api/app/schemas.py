from pydantic import BaseModel, EmailStr
from typing import Optional

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

class ThreadRead(BaseModel):
    id: int
    title: str
    human_takeover: bool  # novo

class ThreadCreate(BaseModel):
    title: Optional[str] = None

class TakeoverToggle(BaseModel):
    active: bool

class HumanReplyBody(BaseModel):
    content: str