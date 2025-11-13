# app/routers/crm.py
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.db import get_db
from app.models import Contact, ContactTag, ContactNote, ContactReminder, Thread, Message, User
from app.schemas import (
    ContactCreate, ContactUpdate, ContactRead,
    ContactTagCreate, ContactTagRead,
    ContactNoteCreate, ContactNoteRead,
    ContactReminderCreate, ContactReminderRead
)
from app.auth import get_current_user

router = APIRouter(prefix="/contacts", tags=["crm"])


def _get_or_create_contact(thread_id: int, user_id: int, db: Session) -> Contact:
    """Obtém ou cria um contato para a thread"""
    contact = db.query(Contact).filter(Contact.thread_id == thread_id).first()
    if not contact:
        thread = db.get(Thread, thread_id)
        if not thread or thread.user_id != user_id:
            raise HTTPException(404, "Thread not found")
        
        # Extrai dados básicos da thread
        contact = Contact(
            thread_id=thread_id,
            user_id=user_id,
            phone=thread.external_user_phone,
            name=thread.title or f"Contato {thread_id}",
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)
    return contact


@router.get("/thread/{thread_id}", response_model=ContactRead)
def get_contact_by_thread(
    thread_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtém contato por thread_id (cria se não existir)"""
    contact = _get_or_create_contact(thread_id, user.id, db)
    return contact


@router.get("", response_model=List[ContactRead])
def list_contacts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista todos os contatos do usuário"""
    contacts = db.query(Contact).filter(Contact.user_id == user.id).order_by(desc(Contact.last_interaction_at)).all()
    return contacts


@router.get("/{contact_id}", response_model=ContactRead)
def get_contact(
    contact_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtém detalhes de um contato"""
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")
    return contact


@router.post("", response_model=ContactRead)
def create_contact(
    payload: ContactCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cria um novo contato"""
    thread = db.get(Thread, payload.thread_id)
    if not thread or thread.user_id != user.id:
        raise HTTPException(404, "Thread not found")
    
    # Verifica se já existe
    existing = db.query(Contact).filter(Contact.thread_id == payload.thread_id).first()
    if existing:
        raise HTTPException(400, "Contact already exists for this thread")
    
    contact = Contact(
        thread_id=payload.thread_id,
        user_id=user.id,
        name=payload.name,
        email=payload.email,
        phone=payload.phone or thread.external_user_phone,
        company=payload.company,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.patch("/{contact_id}", response_model=ContactRead)
def update_contact(
    contact_id: int,
    payload: ContactUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Atualiza dados do contato"""
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")
    
    if payload.name is not None:
        contact.name = payload.name
    if payload.email is not None:
        contact.email = payload.email
    if payload.phone is not None:
        contact.phone = payload.phone
    if payload.company is not None:
        contact.company = payload.company
    
    db.commit()
    db.refresh(contact)
    return contact


# ================== Tags ==================
@router.post("/{contact_id}/tags", response_model=ContactTagRead)
def add_tag(
    contact_id: int,
    payload: ContactTagCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Adiciona tag ao contato"""
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")
    
    # Verifica se já existe
    existing = db.query(ContactTag).filter(
        ContactTag.contact_id == contact_id,
        ContactTag.tag == payload.tag
    ).first()
    if existing:
        return existing
    
    tag = ContactTag(contact_id=contact_id, tag=payload.tag)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{contact_id}/tags/{tag_id}")
def remove_tag(
    contact_id: int,
    tag_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove tag do contato"""
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")
    
    tag = db.get(ContactTag, tag_id)
    if not tag or tag.contact_id != contact_id:
        raise HTTPException(404, "Tag not found")
    
    db.delete(tag)
    db.commit()
    return {"ok": True}


# ================== Notes ==================
@router.post("/{contact_id}/notes", response_model=ContactNoteRead)
def add_note(
    contact_id: int,
    payload: ContactNoteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Adiciona nota ao contato"""
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")
    
    note = ContactNote(
        contact_id=contact_id,
        user_id=user.id,
        content=payload.content
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{contact_id}/notes/{note_id}")
def delete_note(
    contact_id: int,
    note_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove nota do contato"""
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")
    
    note = db.get(ContactNote, note_id)
    if not note or note.contact_id != contact_id:
        raise HTTPException(404, "Note not found")
    
    db.delete(note)
    db.commit()
    return {"ok": True}


# ================== Reminders ==================
@router.post("/{contact_id}/reminders", response_model=ContactReminderRead)
def create_reminder(
    contact_id: int,
    payload: ContactReminderCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cria lembrete de follow-up"""
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")
    
    reminder = ContactReminder(
        contact_id=contact_id,
        user_id=user.id,
        message=payload.message,
        due_date=payload.due_date
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder


@router.patch("/{contact_id}/reminders/{reminder_id}", response_model=ContactReminderRead)
def update_reminder(
    contact_id: int,
    reminder_id: int,
    completed: Optional[bool] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Atualiza lembrete (marca como completo)"""
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")
    
    reminder = db.get(ContactReminder, reminder_id)
    if not reminder or reminder.contact_id != contact_id:
        raise HTTPException(404, "Reminder not found")
    
    if completed is not None:
        reminder.completed = completed
    
    db.commit()
    db.refresh(reminder)
    return reminder


@router.get("/{contact_id}/reminders", response_model=List[ContactReminderRead])
def list_reminders(
    contact_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista lembretes do contato"""
    contact = db.get(Contact, contact_id)
    if not contact or contact.user_id != user.id:
        raise HTTPException(404, "Contact not found")
    
    return contact.reminders

