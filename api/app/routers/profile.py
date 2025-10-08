# api/app/routers/profile.py
from fastapi import APIRouter, Request
from datetime import datetime, timezone

router = APIRouter()

def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()

def _mock_user(request: Request):
    email = request.headers.get("x-dev-email", "dev@local.com")
    return {
        "id": 34,
        "email": email,
        "name": "Usuário",
        "plan": "Trial",
        "created_at": None,
        "last_activity_at": None,
    }

@router.get("/me")
def get_me(request: Request):
    return _mock_user(request)

@router.get("/stats/usage")
def get_usage():
    return {"threads_total": 2, "messages_total": 14, "user_sent": 7, "assistant_sent": 7}

@router.get("/activities")
def get_activities(limit: int = 10):
    now = _utc_now_iso()
    items = [
        {"id": 1, "type": "login",  "title": "Login realizado",     "at": now},
        {"id": 2, "type": "thread", "title": "Nova conversa criada", "at": now},
        {"id": 3, "type": "message","title": "Mensagem enviada",     "at": now},
    ]
    return items[: max(1, min(limit, 50))]
