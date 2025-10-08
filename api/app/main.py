# app/main.py

import os
import json
import jwt
import asyncio
from typing import Dict, Set

from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    Request,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from sqlalchemy import func, case, select
from sqlalchemy.orm import Session

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
        # Não bloquear fluxo em caso de erro de WS
        pass


# tenta usar decode_token se existir; senão, fallback simples a partir de SECRET_KEY
def _decode_token_fallback(token: str) -> dict:
    secret = os.getenv("SECRET_KEY", "secret")
    algorithms = [os.getenv("ALGORITHM", "HS256")]
    return jwt.decode(token, secret, algorithms=algorithms)

try:
    # se seu auth.py tem decode_token, usamos ele
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

from typing import Optional
from fastapi import Header

@app.get("/threads/{thread_id}/stream")
async def stream_thread(
    thread_id: int,
    request: Request,
    token: Optional[str] = Query(None, description="JWT de acesso (ou use Authorization: Bearer)"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    # 1) Aceitar Authorization: Bearer <token> como fallback
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
            # hello inicial
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

    # 2) Cabeçalhos para evitar buffering
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # nginx
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
    return [
        ThreadRead(id=t.id, title=t.title, human_takeover=t.human_takeover)
        for t in rows
    ]

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
    return ThreadRead(id=t.id, title=t.title, human_takeover=t.human_takeover)

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
    MessageRead(
        id=m.id,
        role=m.role,
        content=m.content,
        created_at=m.created_at,   # ✅
    )
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

    # registra mensagem do usuário
    m_user = Message(thread_id=thread_id, role="user", content=body.content)
    db.add(m_user); db.commit(); db.refresh(m_user)

    # 🔴 broadcast da mensagem do usuário (SSE + WS)
    await _broadcast(thread_id, {
        "type": "message.created",
        "message": {
            "id": m_assist.id,
            "role": m_assist.role,
            "content": m_assist.content,
            "created_at": m_assist.created_at.isoformat(),  # ✅
        }
    })

    # takeover ativo → não chama LLM
    if getattr(t, "human_takeover", False):
        return MessageRead(
            id=m_assist.id,
            role=m_assist.role,
            content=m_assist.content,
            created_at=m_assist.created_at,  # ✅
        )

    # histórico para a LLM
    hist = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.id.asc())
        .all()
    ]

    # Sinaliza “digitando” (opcional, útil no front)
    await _broadcast(thread_id, {"type": "assistant.typing.start"})

    reply = await run_llm(
        body.content,
        thread_history=hist,
        takeover=getattr(t, "human_takeover", False),
    )

    # Parar “digitando”
    await _broadcast(thread_id, {"type": "assistant.typing.stop"})

    if reply:
        m_assist = Message(thread_id=thread_id, role="assistant", content=reply)
        db.add(m_assist); db.commit(); db.refresh(m_assist)

        # 🔵 broadcast da resposta da IA
        await _broadcast(thread_id, {
            "type": "message.created",
            "message": {
                "id": m_assist.id,
                "role": m_assist.role,
                "content": m_assist.content,
                "created_at": m_assist.created_at.isoformat(),  # ✅
            }
        })

        return MessageRead(
            id=m_assist.id,
            role=m_assist.role,
            content=m_assist.content,
            created_at=m_assist.created_at,  # ✅
        )

    return MessageRead(
        id=m_assist.id,
        role=m_assist.role,
        content=m_assist.content,
        created_at=m_assist.created_at,  # ✅
    )


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

    m_assist = Message(thread_id=t.id, role="assistant", content=reply)
    db.add(m_assist); db.commit(); db.refresh(m_assist)

    # broadcast da IA
    await _broadcast(t.id, {
        "type": "message.created",
        "message": {"id": m_assist.id, "role": "assistant", "content": reply}
    })

    # envia ao cliente via Meta
    await meta_provider.send_text(from_, reply)
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
    m_assist = Message(thread_id=t.id, role="assistant", content=reply)
    db.add(m_assist); db.commit(); db.refresh(m_assist)

    # broadcast da IA
    await _broadcast(t.id, {
        "type": "message.created",
        "message": {"id": m_assist.id, "role": "assistant", "content": reply}
    })

    # envia ao cliente via Twilio (SDK síncrono → roda em thread para não travar)
    await asyncio.to_thread(twilio_provider.send_text, from_, reply, "BOT")
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
    last_activity = None
    if last_msg is not None:
        last_activity = getattr(last_msg, "created_at", None)
        if last_activity is None:
            last_activity = "—"

    return {
        "threads": threads_count,
        "user_messages": user_msgs,
        "assistant_messages": assistant_msgs,
        "total_messages": total_msgs,
        "last_activity": last_activity,
    }


# -----------------------------
# WebSocket por thread (tempo real)
# -----------------------------
@app.websocket("/ws/threads/{thread_id}")
async def ws_thread(websocket: WebSocket, thread_id: str):
    # Se tiver auth por token, valide aqui antes de accept()
    await hub.connect(thread_id, websocket)
    try:
        while True:
            # Se quiser receber “client typing” etc, leia mensagens do ws:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(thread_id, websocket)
