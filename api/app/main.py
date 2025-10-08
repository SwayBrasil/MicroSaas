# api/app/main.py
import os
from datetime import datetime, timezone
from typing import List

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, case, select
from pydantic import BaseModel

from .db import get_db, engine, SessionLocal
from .models import Base, User, Thread, Message
from .schemas import (
    LoginRequest,
    LoginResponse,
    MessageCreate,
    MessageRead,
    ThreadCreate,
    ThreadRead,
)
from .auth import create_token, verify_password, hash_password, get_current_user
from .services.llm_service import run_llm

# -----------------------------------------------------------------------------
# App & Middlewares
# -----------------------------------------------------------------------------
app = FastAPI(title=os.getenv("APP_NAME", "MVP Chat"))

# CORS via .env (ex.: "http://localhost:3000,https://seu-ngrok")
_cors_env = os.getenv("CORS_ALLOW_ORIGINS", "*")
_allow_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cria tabelas (backup; o start.sh também faz)
Base.metadata.create_all(bind=engine)

# Health
@app.get("/health")
def health():
    return {"status": "ok"}

# -----------------------------------------------------------------------------
# Seed (usuário dev)
# -----------------------------------------------------------------------------
@app.on_event("startup")
def seed_user():
    db = SessionLocal()
    try:
        exists = db.execute(select(User).where(User.email == "dev@local.com")).scalar_one_or_none()
        if not exists:
            u = User(email="dev@local.com", password_hash=hash_password("123"))
            db.add(u)
            db.commit()
    finally:
        db.close()

# -----------------------------------------------------------------------------
# Auth
# -----------------------------------------------------------------------------
@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    u = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if not u or not verify_password(payload.password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
    return LoginResponse(token=create_token(u.id))

class MeOut(BaseModel):
    id: int
    email: str

@app.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return MeOut(id=user.id, email=user.email)

# -----------------------------------------------------------------------------
# Threads
# -----------------------------------------------------------------------------
@app.get("/threads", response_model=List[ThreadRead])
def list_threads(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Thread).where(Thread.user_id == user.id).order_by(Thread.id.desc())
    ).scalars().all()
    return [ThreadRead(id=t.id, title=t.title) for t in rows]

@app.post("/threads", response_model=ThreadRead)
def create_thread(
    body: ThreadCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = Thread(user_id=user.id, title=body.title or "Nova conversa")
    db.add(t)
    db.commit()
    db.refresh(t)
    return ThreadRead(id=t.id, title=t.title)

@app.delete("/threads/{thread_id}", status_code=204)
def delete_thread(
    thread_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    t = db.get(Thread, thread_id)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Thread not found")
    db.query(Message).filter(Message.thread_id == thread_id).delete()
    db.delete(t)
    db.commit()
    return

# -----------------------------------------------------------------------------
# Messages
# -----------------------------------------------------------------------------
@app.get("/threads/{thread_id}/messages", response_model=List[MessageRead])
def get_messages(
    thread_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    t = db.get(Thread, thread_id)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Thread not found")
    msgs = (
        db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.id.asc())
        .all()
    )
    return [MessageRead(id=m.id, role=m.role, content=m.content) for m in msgs]

@app.post("/threads/{thread_id}/messages", response_model=MessageRead)
async def send_message(
    thread_id: int,
    body: MessageCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = db.get(Thread, thread_id)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Thread not found")

    m_user = Message(thread_id=thread_id, role="user", content=body.content)
    db.add(m_user)
    db.commit()
    db.refresh(m_user)

    hist = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.id.asc())
        .all()
    ]
    reply = await run_llm(body.content, thread_history=hist)

    m_assist = Message(thread_id=thread_id, role="assistant", content=reply)
    db.add(m_assist)
    db.commit()
    db.refresh(m_assist)
    return MessageRead(id=m_assist.id, role=m_assist.role, content=m_assist.content)

# -----------------------------------------------------------------------------
# Webhooks (WhatsApp)
# -----------------------------------------------------------------------------
@app.get("/webhooks/meta")
def meta_verify(
    hub_mode: str | None = None,
    hub_challenge: str | None = None,
    hub_verify_token: str | None = None,
):
    expected = os.getenv("META_VERIFY_TOKEN")
    if hub_verify_token == expected:
        return int(hub_challenge or 0)
    raise HTTPException(403, "Invalid verify token")

@app.post("/webhooks/meta")
async def meta_webhook(req: Request, db: Session = Depends(get_db)):
    # import lazy
    try:
        from .providers import meta as meta_provider
    except Exception:
        raise HTTPException(500, "Meta provider indisponível no servidor.")

    data = await req.json()
    try:
        changes = data["entry"][0]["changes"][0]["value"]["messages"][0]
        from_ = changes["from"]  # wa_id (E.164 sem +? normalmente vem com números)
        text = changes.get("text", {}).get("body") or ""
    except Exception:
        return {"status": "ignored"}

    # --- NOVO: rota por e-mail fixo (se configurado) ---
    route_email = os.getenv("WA_ROUTE_TO_EMAIL")
    if route_email:
        user = db.query(User).filter(User.email == route_email).first()
        if not user:
            user = User(email=route_email, password_hash=hash_password("nopass"))
            db.add(user); db.commit(); db.refresh(user)
        # 1 thread por contato WA sob o MESMO usuário
        thread_title = f"WhatsApp {from_}"
        t = (
            db.query(Thread)
            .filter(Thread.user_id == user.id, Thread.title == thread_title)
            .first()
        )
        if not t:
            t = Thread(user_id=user.id, title=thread_title)
            db.add(t); db.commit(); db.refresh(t)
    else:
        # comportamento antigo: usuário sintético por número
        user = db.query(User).filter(User.email == f"{from_}@wa").first()
        if not user:
            user = User(email=f"{from_}@wa", password_hash=hash_password("nopass"))
            db.add(user); db.commit(); db.refresh(user)
        t = db.query(Thread).filter(Thread.user_id == user.id).order_by(Thread.id.desc()).first()
        if not t:
            t = Thread(user_id=user.id, title="WhatsApp")
            db.add(t); db.commit(); db.refresh(t)

    m_user = Message(thread_id=t.id, role="user", content=text)
    db.add(m_user); db.commit(); db.refresh(m_user)

    hist = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message).filter(Message.thread_id == t.id).order_by(Message.id.asc()).all()
    ]
    reply = await run_llm(text, thread_history=hist)

    m_assist = Message(thread_id=t.id, role="assistant", content=reply)
    db.add(m_assist); db.commit(); db.refresh(m_assist)

    await meta_provider.send_text(from_, reply)
    return {"status": "ok"}


@app.post("/webhooks/twilio")
async def twilio_webhook(req: Request, db: Session = Depends(get_db)):
    # import lazy
    try:
        from .providers import twilio as twilio_provider
    except Exception:
        raise HTTPException(500, "Twilio provider indisponível no servidor.")

    form = await req.form()
    # Twilio envia From="whatsapp:+5561984081114"
    from_raw = str(form.get("From", "")).strip()
    from_ = from_raw.replace("whatsapp:", "").replace("+", "")
    # body é texto puro
    body = (form.get("Body", "") or "").strip()

    # --- NOVO: rota por e-mail fixo (se configurado) ---
    route_email = os.getenv("WA_ROUTE_TO_EMAIL")
    if route_email:
        user = db.query(User).filter(User.email == route_email).first()
        if not user:
            user = User(email=route_email, password_hash=hash_password("nopass"))
            db.add(user); db.commit(); db.refresh(user)
        thread_title = f"WhatsApp +{from_}"
        t = (
            db.query(Thread)
            .filter(Thread.user_id == user.id, Thread.title == thread_title)
            .first()
        )
        if not t:
            t = Thread(user_id=user.id, title=thread_title)
            db.add(t); db.commit(); db.refresh(t)
    else:
        # comportamento antigo: usuário sintético por número
        user = db.query(User).filter(User.email == f"+{from_}@wa").first()
        if not user:
            user = User(email=f"+{from_}@wa", password_hash=hash_password("nopass"))
            db.add(user); db.commit(); db.refresh(user)
        t = db.query(Thread).filter(Thread.user_id == user.id).order_by(Thread.id.desc()).first()
        if not t:
            t = Thread(user_id=user.id, title="WhatsApp")
            db.add(t); db.commit(); db.refresh(t)

    # grava mensagem do usuário
    m_user = Message(thread_id=t.id, role="user", content=body)
    db.add(m_user); db.commit(); db.refresh(m_user)

    # histórico
    hist = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message).filter(Message.thread_id == t.id).order_by(Message.id.asc()).all()
    ]
    reply = await run_llm(body, thread_history=hist)

    # grava resposta
    m_assist = Message(thread_id=t.id, role="assistant", content=reply)
    db.add(m_assist); db.commit(); db.refresh(m_assist)

    # responde via Twilio
    await twilio_provider.send_text(f"+{from_}", reply)
    return {"status": "ok"}

# -----------------------------------------------------------------------------
# Stats (dashboard)
# -----------------------------------------------------------------------------
@app.get("/stats")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    threads_count = (
        db.query(func.count(Thread.id)).filter(Thread.user_id == user.id).scalar() or 0
    )

    q_msgs = (
        db.query(
            func.sum(case((Message.role == "user", 1), else_=0)),
            func.sum(case((Message.role == "assistant", 1), else_=0)),
        )
        .join(Thread, Thread.id == Message.thread_id)
        .filter(Thread.user_id == user.id)
    )
    user_msgs, assistant_msgs = q_msgs.one() if q_msgs else (0, 0)
    user_msgs = int(user_msgs or 0)
    assistant_msgs = int(assistant_msgs or 0)
    total_msgs = user_msgs + assistant_msgs

    last_msg = (
        db.query(Message)
        .join(Thread, Thread.id == Message.thread_id)
        .filter(Thread.user_id == user.id)
        .order_by(Message.id.desc())
        .first()
    )
    last_activity = getattr(last_msg, "created_at", None) if last_msg is not None else None
    if last_msg is not None and last_activity is None:
        last_activity = "—"

    return {
        "threads": threads_count,
        "user_messages": user_msgs,
        "assistant_messages": assistant_msgs,
        "total_messages": total_msgs,
        "last_activity": last_activity,
    }

# -----------------------------------------------------------------------------
# Endpoints extras para a tela de Profile
# -----------------------------------------------------------------------------
@app.get("/stats/usage")
def stats_usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = (
        db.query(
            func.count(Thread.id),
            func.sum(case((Message.role == "user", 1), else_=0)),
            func.sum(case((Message.role == "assistant", 1), else_=0)),
        )
        .select_from(Thread)
        .outerjoin(Message, Message.thread_id == Thread.id)
        .filter(Thread.user_id == user.id)
    ).first()

    threads_total = int(q[0] or 0)
    user_sent = int(q[1] or 0)
    assistant_sent = int(q[2] or 0)
    messages_total = user_sent + assistant_sent

    return {
        "threads_total": threads_total,
        "messages_total": messages_total,
        "user_sent": user_sent,
        "assistant_sent": assistant_sent,
    }

@app.get("/activities")
def activities(user: User = Depends(get_current_user), db: Session = Depends(get_db), limit: int = 10):
    items = []

    msgs = (
        db.query(Message, Thread.title)
        .join(Thread, Thread.id == Message.thread_id)
        .filter(Thread.user_id == user.id)
        .order_by(Message.id.desc())
        .limit(limit)
        .all()
    )
    for m, title in msgs:
        items.append({
            "id": f"msg-{m.id}",
            "type": "message",
            "title": f"Mensagem em: {title or 'Sem título'}",
            "at": getattr(m, "created_at", None) or datetime.now(timezone.utc).isoformat(),
        })

    if len(items) < limit:
        rest = limit - len(items)
        ths = (
            db.query(Thread)
            .filter(Thread.user_id == user.id)
            .order_by(Thread.id.desc())
            .limit(rest)
            .all()
        )
        for t in ths:
            items.append({
                "id": f"thr-{t.id}",
                "type": "thread",
                "title": f"Conversa criada: {t.title or 'Sem título'}",
                "at": getattr(t, "created_at", None) or datetime.now(timezone.utc).isoformat(),
            })

    try:
        items.sort(key=lambda x: x.get("at") or "", reverse=True)
    except Exception:
        pass

    return items[:limit]
