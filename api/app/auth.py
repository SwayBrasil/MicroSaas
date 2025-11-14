import os
import jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .db import get_db
from .models import User
from passlib.hash import pbkdf2_sha256

JWT_SECRET = os.getenv("JWT_SECRET", "trocar")
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "1440"))

def hash_password(p: str) -> str:
    return pbkdf2_sha256.hash(p)

def verify_password(p: str, hashed: str) -> bool:
    try:
        return pbkdf2_sha256.verify(p, hashed)
    except Exception:
        return False

def create_token(user_id: int) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRES_MINUTES),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

auth_scheme = HTTPBearer()

def decode_token(token: str) -> dict:
    """Decode JWT token - can be imported by main.py"""
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(auth_scheme),
                     db: Session = Depends(get_db)) -> User:
    token = creds.credentials
    try:
        data = decode_token(token)
        uid = data.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")

    user = db.get(User, uid)
    if not user:
        raise HTTPException(401, "User not found")
    return user
