# api/app/models.py
from __future__ import annotations

from datetime import datetime, date
from typing import List, Optional

from sqlalchemy import (
    String, Boolean, ForeignKey, Text, DateTime, Date, Float, func, Integer
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# -----------------------------
# Base declarativa (SQLAlchemy 2.x)
# -----------------------------
class Base(DeclarativeBase):
    pass


# -----------------------------
# Tabelas principais (já existentes)
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

    # CRM
    contacts: Mapped[List["Contact"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
    )
    obligations: Mapped[List["Obligation"]] = relationship(
        back_populates="owner",
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


# -----------------------------
# CRM: Contatos / Kanban / Calendário
# -----------------------------
class Contact(Base):
    """
    Contato pertencente a um usuário (owner_user_id).
    - stage: 'lead' | 'client'
    - heat: 'hot' | 'warm' | 'cold'
    - await_status: 'none' | 'awaiting_client' | 'awaiting_us' | 'awaiting_payment'
    - is_real: cliente real (True/False)
    """
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)

    stage: Mapped[str] = mapped_column(String(20), default="lead")         # lead | client
    heat: Mapped[str] = mapped_column(String(10), default="cold")          # hot | warm | cold
    await_status: Mapped[str] = mapped_column(String(24), default="none")  # none | awaiting_client | awaiting_us | awaiting_payment
    is_real: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # relationships
    owner: Mapped["User"] = relationship(back_populates="contacts")
    deals: Mapped[List["Deal"]] = relationship(back_populates="contact", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Contact id={self.id} name={self.name!r} stage={self.stage} heat={self.heat}>"


class Deal(Base):
    """
    Negócio para Kanban:
    - column: 'novo' | 'qualificacao' | 'proposta' | 'fechamento' | 'ganho' | 'perdido'
    - priority: 'baixa' | 'normal' | 'alta'
    """
    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(primary_key=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id"), index=True)

    title: Mapped[str] = mapped_column(String(200))
    value: Mapped[float] = mapped_column(Float, default=0.0)

    column: Mapped[str] = mapped_column(String(24), default="novo")
    priority: Mapped[str] = mapped_column(String(12), default="normal")
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string list

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    contact: Mapped["Contact"] = relationship(back_populates="deals")

    def __repr__(self) -> str:
        return f"<Deal id={self.id} title={self.title!r} column={self.column}>"


class Obligation(Base):
    """
    Obrigações do calendário (tarefas com data):
    - status: 'open' | 'done'
    - relacionamento opcional com Contact
    """
    __tablename__ = "obligations"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(10), default="open")  # open | done
    contact_id: Mapped[Optional[int]] = mapped_column(ForeignKey("contacts.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="obligations")
