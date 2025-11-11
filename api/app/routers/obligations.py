from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime
from ..db import get_db
from ..models import Obligation
from ..schemas import ObligationCreate, ObligationUpdate, ObligationRead
from ..auth import get_current_user

router = APIRouter(prefix="/obligations", tags=["obligations"])

@router.get("", response_model=list[ObligationRead])
def list_obligations(
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(Obligation).filter(Obligation.owner_user_id == user.id)
    if start: q = q.filter(Obligation.due_date >= start)
    if end: q = q.filter(Obligation.due_date < end)
    return q.order_by(Obligation.due_date.asc()).all()

@router.post("", response_model=ObligationRead)
def create_obligation(body: ObligationCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    o = Obligation(owner_user_id=user.id, **body.model_dump())
    db.add(o); db.commit(); db.refresh(o)
    return o

@router.patch("/{oid}", response_model=ObligationRead)
def update_obligation(oid: int, body: ObligationUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    o = db.query(Obligation).filter(Obligation.owner_user_id == user.id, Obligation.id == oid).first()
    if not o: raise HTTPException(404, "Obligation not found")
    for k, v in body.model_dump(exclude_unset=True).items(): setattr(o, k, v)
    db.commit(); db.refresh(o)
    return o

@router.delete("/{oid}")
def delete_obligation(oid: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    o = db.query(Obligation).filter(Obligation.owner_user_id == user.id, Obligation.id == oid).first()
    if not o: raise HTTPException(404, "Obligation not found")
    db.delete(o); db.commit()
    return {"ok": True}
