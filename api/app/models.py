# api/app/models.py
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import String, Boolean, ForeignKey, Text, DateTime, func, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# -----------------------------
# Base declarativa (SQLAlchemy 2.x)
# -----------------------------
class Base(DeclarativeBase):
    pass


# -----------------------------
# Tabelas
# -----------------------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # RELACIONAMENTOS
    threads: Mapped[List["Thread"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


class Thread(Base):
    __tablename__ = "threads"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Se você usa um ID externo (ex.: ID de conversa no provedor)
    external_thread_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    title: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    # Dono da thread (seu usuário interno do painel)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # 🔒 takeover: quando True, IA não responde
    human_takeover: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # (Opcional) telefone/wa_id do cliente para envio via WhatsApp
    external_user_phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # RELACIONAMENTOS
    user: Mapped["User"] = relationship(back_populates="threads")
    messages: Mapped[List["Message"]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        order_by="Message.id.asc()",
    )

    def __repr__(self) -> str:
        return f"<Thread id={self.id} title={self.title!r} takeover={self.human_takeover}>"


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)

    thread_id: Mapped[int] = mapped_column(ForeignKey("threads.id"), index=True)

    # "user" | "assistant" | (opcional) "system"
    role: Mapped[str] = mapped_column(String(32))

    content: Mapped[str] = mapped_column(Text)

    # Se você integra com um provedor e quer guardar o ID externo
    external_message_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Marcador para respostas enviadas por atendente humano
    is_human: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # RELACIONAMENTOS
    thread: Mapped["Thread"] = relationship(back_populates="messages")

    def __repr__(self) -> str:
        return f"<Message id={self.id} role={self.role} human={self.is_human}>"
