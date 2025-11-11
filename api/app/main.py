# app/main.py

import os
import json
import jwt
import asyncio
from typing import Dict, Set, Optional

from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    Request,
    Query,
    WebSocket,
    WebSocketDisconnect,
    Header,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from sqlalchemy import func, case, select, and_
from sqlalchemy.orm import Session

from pydantic import BaseModel

from .db import get_db, engine, SessionLocal
from .models import Base, User, Thread, Message, Contact, Deal, Obligation
from .schemas import (
    # auth/threads/messages
    LoginRequest, LoginResponse,
    MessageCreate, MessageRead,
    ThreadCreate, ThreadRead,
    # CRM
    ContactCreate, ContactUpdate, ContactRead,
    DealCreate, DealUpdate, DealRead,
    ObligationCreate, ObligationUpdate, ObligationRead,
)
from .auth import create_token, verify_password, hash_password, get_current_user
from .services.llm_service import run_llm

from .providers import twilio as twilio_provider
from .providers import meta as meta_provider

# Realtime via WebSocket
from .realtime import hub


# -----------------------------
# App & CORS
# -----------------------------
Base.metadata.create_all(bind=engine)

app = FastAPI(title=os.getenv("APP_NAME", "MVP Chat"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

# ------- Routers extras (ex.: takeover) -------
from app.routers import takeover
app.include_router(takeover.router)
# ---------------------------------------------


# -----------------------------
# Seed mínimo
# -----------------------------
@app.on_event("startup")
def seed_user():
    db = SessionLocal()
    try:
        exists = db.execute(
            select(User).where(User.email == "dev@local.com")
        ).scalar_one_or_none()
        if not exists:
            u = User(email="dev@local.com", password_hash=hash_password("123"))
            db.add(u)
            db.commit()
    finally:
        db.close()


# -----------------------------
# Auth
# -----------------------------
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


# -----------------------------
# SSE infra (tempo real)
# -----------------------------
SUBS: Dict[int, Set[asyncio.Queue]] = {}
SUBS_LOCK = asyncio.Lock()

async def _subscribe(thread_id: int) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    async with SUBS_LOCK:
        SUBS.setdefault(thread_id, set()).add(q)
    return q

async def _unsubscribe(thread_id: int, q: asyncio.Queue):
    async with SUBS_LOCK:
        if thread_id in SUBS and q in SUBS[thread_id]:
            SUBS[thread_id].remove(q)
            if not SUBS[thread_id]:
                SUBS.pop(thread_id, None)

async def _broadcast(thread_id: int, payload: dict):
    """
    Envia o payload para todos assinantes SSE e também para os clientes WebSocket
    do mesmo thread_id (via hub).
    """
    # SSE
    async with SUBS_LOCK:
        queues = list(SUBS.get(thread_id, set()))
    for q in queues:
        try:
            await q.put(payload)
        except Exception:
            pass

    # WS
    try:
        await hub.broadcast(str(thread_id), payload)
    except Exception:
        pass


# tenta usar decode_token se existir; senão, fallback simples a partir de SECRET_KEY
def _decode_token_fallback(token: str) -> dict:
    secret = os.getenv("SECRET_KEY", "secret")
    algorithms = [os.getenv("ALGORITHM", "HS256")]
    return jwt.decode(token, secret, algorithms=algorithms)

try:
    from .auth import decode_token as _decode_token
except Exception:
    _decode_token = _decode_token_fallback  # type: ignore

def _user_from_query_token(db: Session, token: str) -> User:
    if not token:
        raise HTTPException(401, "missing token")
    try:
        payload = _decode_token(token)
        uid = int(payload["sub"])
    except Exception:
        raise HTTPException(401, "invalid token")
    u = db.get(User, uid)
    if not u:
        raise HTTPException(401, "invalid user")
    return u


# -----------------------------
# SSE por thread
# -----------------------------
@app.get("/threads/{thread_id}/stream")
async def stream_thread(
    thread_id: int,
    request: Request,
    token: Optional[str] = Query(None, description="JWT de acesso (ou use Authorization: Bearer)"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    # Authorization: Bearer <token> como fallback
    if not token and authorization:
        if authorization.lower().startswith("bearer "):
            token = authorization.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(401, "missing token")

    user = _user_from_query_token(db, token)

    t = db.get(Thread, thread_id)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Thread not found")

    q = await _subscribe(thread_id)

    async def event_gen():
        try:
            yield "event: ping\ndata: ok\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=30)
                    data = json.dumps(payload, ensure_ascii=False)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield "event: keepalive\ndata: {}\n\n"
        finally:
            await _unsubscribe(thread_id, q)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_gen(), media_type="text/event-stream", headers=headers)


# -----------------------------
# Threads
# -----------------------------
@app.get("/threads", response_model=list[ThreadRead])
def list_threads(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Thread).where(Thread.user_id == user.id).order_by(Thread.id.desc())
    ).scalars().all()
    return [ThreadRead(id=t.id, title=t.title, human_takeover=t.human_takeover) for t in rows]

@app.post("/threads", response_model=ThreadRead)
def create_thread(
    body: ThreadCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = Thread(user_id=user.id, title=body.title or "Nova conversa")
    db.add(t); db.commit(); db.refresh(t)
    return ThreadRead(id=t.id, title=t.title, human_takeover=t.human_takeover)

@app.delete("/threads/{thread_id}", status_code=204)
def delete_thread(
    thread_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    t = db.get(Thread, thread_id)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Thread not found")
    db.query(Message).filter(Message.thread_id == thread_id).delete()
    db.delete(t); db.commit()
    return


# -----------------------------
# Messages
# -----------------------------
@app.get("/threads/{thread_id}/messages", response_model=list[MessageRead])
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
    return [
        MessageRead(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
        for m in msgs
    ]

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

    # 1) registra e retorna/broadcasta a mensagem do usuário
    m_user = Message(thread_id=thread_id, role="user", content=body.content)
    db.add(m_user); db.commit(); db.refresh(m_user)

    # 🔴 broadcast da mensagem do usuário (SSE + WS)
    await _broadcast(thread_id, {
        "type": "message.created",
        "message": {
            "id": m_user.id,
            "role": m_user.role,
            "content": m_user.content,
            "created_at": m_user.created_at.isoformat(),
        }
    })

    # 2) takeover ativo → não chama LLM
    if getattr(t, "human_takeover", False):
        return MessageRead(
            id=m_user.id, role=m_user.role, content=m_user.content, created_at=m_user.created_at
        )

    # 3) histórico para a LLM
    hist = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.id.asc())
        .all()
    ]

    # 4) “digitando…”
    await _broadcast(thread_id, {"type": "assistant.typing.start"})

    reply = await run_llm(
        body.content,
        thread_history=hist,
        takeover=getattr(t, "human_takeover", False),
    )

    await _broadcast(thread_id, {"type": "assistant.typing.stop"})

    # 5) salva resposta da IA (se houver)
    if reply is None:
        reply = ""

    m_assist = Message(thread_id=thread_id, role="assistant", content=reply)
    db.add(m_assist); db.commit(); db.refresh(m_assist)

    # 🔵 broadcast da resposta da IA
    await _broadcast(thread_id, {
        "type": "message.created",
        "message": {
            "id": m_assist.id,
            "role": m_assist.role,
            "content": m_assist.content,
            "created_at": m_assist.created_at.isoformat(),
        }
    })

    return MessageRead(
        id=m_assist.id, role=m_assist.role, content=m_assist.content, created_at=m_assist.created_at
    )


# -----------------------------
# CRM — Contacts
# -----------------------------
@app.get("/contacts", response_model=list[ContactRead])
def contacts_list(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Contact)
        .filter(Contact.owner_user_id == user.id)
        .order_by(Contact.id.desc())
        .all()
    )
    return [ContactRead.model_validate(r, from_attributes=True) for r in rows]

@app.get("/contacts/{contact_id}", response_model=ContactRead)
def contacts_get(
    contact_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    c = db.get(Contact, contact_id)
    if not c or c.owner_user_id != user.id:
        raise HTTPException(404, "Contact not found")
    return ContactRead.model_validate(c, from_attributes=True)

@app.post("/contacts", response_model=ContactRead)
def contacts_create(
    body: ContactCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    c = Contact(owner_user_id=user.id, **body.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    return ContactRead.model_validate(c, from_attributes=True)

@app.patch("/contacts/{contact_id}", response_model=ContactRead)
def contacts_update(
    contact_id: int, body: ContactUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    c = db.get(Contact, contact_id)
    if not c or c.owner_user_id != user.id:
        raise HTTPException(404, "Contact not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.add(c); db.commit(); db.refresh(c)
    return ContactRead.model_validate(c, from_attributes=True)

@app.delete("/contacts/{contact_id}")
def contacts_delete(
    contact_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    c = db.get(Contact, contact_id)
    if not c or c.owner_user_id != user.id:
        raise HTTPException(404, "Contact not found")
    db.delete(c); db.commit()
    return {"ok": True}


# -----------------------------
# CRM — Deals (Kanban)
# -----------------------------
@app.get("/deals", response_model=list[DealRead])
def deals_list(
    column: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Deal).join(Contact, Contact.id == Deal.contact_id).filter(Contact.owner_user_id == user.id)
    if column:
        q = q.filter(Deal.column == column)
    rows = q.order_by(Deal.id.desc()).all()
    return [DealRead.model_validate(r, from_attributes=True) for r in rows]

@app.post("/deals", response_model=DealRead)
def deals_create(
    body: DealCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # garante que o contato pertence ao usuário
    c = db.get(Contact, body.contact_id)
    if not c or c.owner_user_id != user.id:
        raise HTTPException(400, "invalid contact_id")
    d = Deal(**body.model_dump())
    db.add(d); db.commit(); db.refresh(d)
    return DealRead.model_validate(d, from_attributes=True)

@app.patch("/deals/{deal_id}", response_model=DealRead)
def deals_update(
    deal_id: int, body: DealUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    d = db.get(Deal, deal_id)
    if not d:
        raise HTTPException(404, "Deal not found")
    # valida troca de contato (se enviada)
    payload = body.model_dump(exclude_unset=True)
    if "contact_id" in payload:
        c = db.get(Contact, payload["contact_id"])
        if not c or c.owner_user_id != user.id:
            raise HTTPException(400, "invalid contact_id")
    else:
        # valida o contato atual pertence ao usuário
        c = db.get(Contact, d.contact_id)
        if not c or c.owner_user_id != user.id:
            raise HTTPException(403, "forbidden")
    for k, v in payload.items():
        setattr(d, k, v)
    db.add(d); db.commit(); db.refresh(d)
    return DealRead.model_validate(d, from_attributes=True)

@app.delete("/deals/{deal_id}")
def deals_delete(
    deal_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    d = db.get(Deal, deal_id)
    if not d:
        return {"ok": True}
    c = db.get(Contact, d.contact_id)
    if not c or c.owner_user_id != user.id:
        raise HTTPException(403, "forbidden")
    db.delete(d); db.commit()
    return {"ok": True}


# -----------------------------
# CRM — Obligations (Calendar)
# -----------------------------
@app.get("/obligations", response_model=list[ObligationRead])
def obligations_list(
    start: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Obligation).filter(Obligation.owner_user_id == user.id)
    if start:
        q = q.filter(Obligation.due_date >= f"{start} 00:00:00")
    if end:
        q = q.filter(Obligation.due_date <= f"{end} 23:59:59")
    rows = q.order_by(Obligation.due_date.asc()).all()
    return [ObligationRead.model_validate(r, from_attributes=True) for r in rows]

@app.post("/obligations", response_model=ObligationRead)
def obligations_create(
    body: ObligationCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # se vier contact_id, valida a posse
    if body.contact_id:
        c = db.get(Contact, body.contact_id)
        if not c or c.owner_user_id != user.id:
            raise HTTPException(400, "invalid contact_id")
    o = Obligation(owner_user_id=user.id, **body.model_dump())
    db.add(o); db.commit(); db.refresh(o)
    return ObligationRead.model_validate(o, from_attributes=True)

@app.patch("/obligations/{obligation_id}", response_model=ObligationRead)
def obligations_update(
    obligation_id: int, body: ObligationUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    o = db.get(Obligation, obligation_id)
    if not o or o.owner_user_id != user.id:
        raise HTTPException(404, "Obligation not found")
    payload = body.model_dump(exclude_unset=True)
    if "contact_id" in payload and payload["contact_id"]:
        c = db.get(Contact, payload["contact_id"])
        if not c or c.owner_user_id != user.id:
            raise HTTPException(400, "invalid contact_id")
    for k, v in payload.items():
        setattr(o, k, v)
    db.add(o); db.commit(); db.refresh(o)
    return ObligationRead.model_validate(o, from_attributes=True)

@app.delete("/obligations/{obligation_id}")
def obligations_delete(
    obligation_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    o = db.get(Obligation, obligation_id)
    if not o or o.owner_user_id != user.id:
        return {"ok": True}
    db.delete(o); db.commit()
    return {"ok": True}


# -----------------------------
# Webhooks WhatsApp - Meta
# -----------------------------
@app.get("/webhooks/meta")
def meta_verify(
    hub_mode: str | None = None,
    hub_challenge: str | None = None,
    hub_verify_token: str | None = None,
):
    expected = os.getenv("META_VERIFY_TOKEN")
    if hub_verify_token == expected:
        try:
            return int(hub_challenge or 0)
        except Exception:
            return hub_challenge or "OK"
    raise HTTPException(403, "Invalid verify token")

@app.post("/webhooks/meta")
async def meta_webhook(req: Request, db: Session = Depends(get_db)):
    data = await req.json()
    try:
        changes = data["entry"][0]["changes"][0]["value"]["messages"][0]
        from_ = changes["from"]  # wa_id
        text = (changes.get("text", {}) or {}).get("body", "") or ""
    except Exception:
        return {"status": "ignored"}

    # Operador dono da inbox
    owner_email = os.getenv("INBOX_OWNER_EMAIL", "dev@local.com")
    owner = db.query(User).filter(User.email == owner_email).first()
    if not owner:
        owner = User(email=owner_email, password_hash=hash_password("123"))
        db.add(owner); db.commit(); db.refresh(owner)

    # Thread por telefone
    t = (
        db.query(Thread)
        .filter(Thread.user_id == owner.id, Thread.external_user_phone == from_)
        .order_by(Thread.id.desc())
        .first()
    )
    if not t:
        t = Thread(
            user_id=owner.id,
            title=f"WhatsApp {from_[-4:]}",
            external_user_phone=from_,
        )
        db.add(t); db.commit(); db.refresh(t)

    # salva msg do cliente
    m_user = Message(thread_id=t.id, role="user", content=text)
    db.add(m_user); db.commit(); db.refresh(m_user)

    # broadcast da msg recebida
    await _broadcast(t.id, {
        "type": "message.created",
        "message": {"id": m_user.id, "role": "user", "content": text}
    })

    # takeover ativo → não responde
    if getattr(t, "human_takeover", False):
        return {"status": "ok", "skipped_llm": True}

    # histórico e resposta
    hist = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message)
        .filter(Message.thread_id == t.id)
        .order_by(Message.id.asc())
        .all()
    ]

    await _broadcast(t.id, {"type": "assistant.typing.start"})
    reply = await run_llm(text, thread_history=hist, takeover=False)
    await _broadcast(t.id, {"type": "assistant.typing.stop"})

    m_assist = Message(thread_id=t.id, role="assistant", content=reply or "")
    db.add(m_assist); db.commit(); db.refresh(m_assist)

    # broadcast da IA
    await _broadcast(t.id, {
        "type": "message.created",
        "message": {"id": m_assist.id, "role": "assistant", "content": m_assist.content}
    })

    # envia ao cliente via Meta
    await meta_provider.send_text(from_, m_assist.content)
    return {"status": "ok"}


# -----------------------------
# Webhooks WhatsApp - Twilio
# -----------------------------
@app.post("/webhooks/twilio")
async def twilio_webhook(req: Request, db: Session = Depends(get_db)):
    form = await req.form()
    from_ = str(form.get("From", "")).replace("whatsapp:", "")
    body = form.get("Body", "") or ""

    # Operador padrão
    owner_email = os.getenv("INBOX_OWNER_EMAIL", "dev@local.com")
    owner = db.query(User).filter(User.email == owner_email).first()
    if not owner:
        owner = User(email=owner_email, password_hash=hash_password("123"))
        db.add(owner); db.commit(); db.refresh(owner)

    # Thread por telefone
    t = (
        db.query(Thread)
        .filter(Thread.user_id == owner.id, Thread.external_user_phone == from_)
        .order_by(Thread.id.desc())
        .first()
    )
    if not t:
        t = Thread(
            user_id=owner.id,
            title=f"WhatsApp {from_[-4:]}",
            external_user_phone=from_,
        )
        db.add(t); db.commit(); db.refresh(t)

    # salva msg do cliente
    m_user = Message(thread_id=t.id, role="user", content=body)
    db.add(m_user); db.commit(); db.refresh(m_user)

    # broadcast da msg recebida
    await _broadcast(t.id, {
        "type": "message.created",
        "message": {"id": m_user.id, "role": "user", "content": body}
    })

    # takeover ativo → não responde
    if getattr(t, "human_takeover", False):
        return {"status": "ok", "skipped_llm": True}

    # histórico e resposta
    hist = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message)
        .filter(Message.thread_id == t.id)
        .order_by(Message.id.asc())
        .all()
    ]

    await _broadcast(t.id, {"type": "assistant.typing.start"})
    reply = await run_llm(body, thread_history=hist, takeover=False)
    await _broadcast(t.id, {"type": "assistant.typing.stop"})

    # salva resposta da IA
    m_assist = Message(thread_id=t.id, role="assistant", content=reply or "")
    db.add(m_assist); db.commit(); db.refresh(m_assist)

    # broadcast da IA
    await _broadcast(t.id, {
        "type": "message.created",
        "message": {"id": m_assist.id, "role": "assistant", "content": m_assist.content}
    })

    # envia ao cliente via Twilio (SDK síncrono → roda em thread para não travar)
    await asyncio.to_thread(twilio_provider.send_text, from_, m_assist.content, "BOT")
    return {"status": "ok"}


# -----------------------------
# Stats (dashboard)
# -----------------------------
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
    last_activity = getattr(last_msg, "created_at", None) if last_msg else None
    if last_activity is None:
        last_activity = "—"

    return {
        "threads": max(0, threads_count),
        "user_messages": max(0, user_msgs),
        "assistant_messages": max(0, assistant_msgs),
        "total_messages": max(0, total_msgs),
        "last_activity": last_activity,
    }


# -----------------------------
# WebSocket por thread (tempo real)
# -----------------------------
@app.websocket("/ws/threads/{thread_id}")
async def ws_thread(websocket: WebSocket, thread_id: str):
    await hub.connect(thread_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(thread_id, websocket)
