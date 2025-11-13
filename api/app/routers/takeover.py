# app/routers/takeover.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Thread, Message, User
from app.schemas import TakeoverToggle, HumanReplyBody
from app.auth import get_current_user

# ✅ provider Twilio
from app.providers import twilio as twilio_provider

router = APIRouter(prefix="/threads", tags=["takeover"])

@router.post("/{thread_id}/takeover")
def set_takeover(thread_id: int, body: TakeoverToggle,
                 user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    t = db.get(Thread, thread_id)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Thread not found")
    t.human_takeover = bool(body.active)
    db.add(t); db.commit(); db.refresh(t)
    return {"ok": True, "human_takeover": t.human_takeover}

@router.post("/{thread_id}/human-reply")
def human_reply(thread_id: int, body: HumanReplyBody,
                user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    t = db.get(Thread, thread_id)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Thread not found")

    # 1) salva no histórico (marcado como mensagem humana)
    msg = Message(thread_id=t.id, role="assistant", content=body.content, is_human=True)
    db.add(msg); db.commit(); db.refresh(msg)

    # 2) envia para o cliente via Twilio
    phone = (t.external_user_phone or "").strip()
    if not phone:
        print(f"[HUMAN-REPLY] thread {t.id} sem external_user_phone; nada enviado")
        return {"ok": True, "message_id": msg.id, "sent": False}

    try:
        sid = twilio_provider.send_text(phone, body.content)  # <- síncrono, sem await
        print(f"[HUMAN-REPLY][TWILIO] thread={t.id} to={phone} sid={sid}")
        sent = True
    except Exception as e:
        print(f"[HUMAN-REPLY][TWILIO][ERROR] thread={t.id} to={phone} err={e}")
        sent = False

    return {"ok": True, "message_id": msg.id, "sent": sent}
