from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Deal, Contact
from ..schemas import DealCreate, DealUpdate, DealRead
from ..auth import get_current_user

router = APIRouter(prefix="/deals", tags=["deals"])

@router.get("", response_model=list[DealRead])
def list_deals(
    column: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(Deal).join(Contact, Deal.contact_id == Contact.id).filter(Contact.owner_user_id == user.id)
    if column:
        q = q.filter(Deal.column == column)
    return q.order_by(Deal.id.desc()).all()

@router.post("", response_model=DealRead)
def create_deal(body: DealCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    # valida se o contato é do usuário
    contact = db.query(Contact).filter(Contact.owner_user_id == user.id, Contact.id == body.contact_id).first()
    if not contact: raise HTTPException(404, "Contact not found")
    d = Deal(**body.model_dump())
    db.add(d); db.commit(); db.refresh(d)
    return d

@router.patch("/{did}", response_model=DealRead)
def update_deal(did: int, body: DealUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(Deal).join(Contact).filter(Contact.owner_user_id == user.id, Deal.id == did)
    d = q.first()
    if not d: raise HTTPException(404, "Deal not found")
    # impedimos mover para contato de outro user
    payload = body.model_dump(exclude_unset=True)
    if "contact_id" in payload:
        c = db.query(Contact).filter(Contact.owner_user_id == user.id, Contact.id == payload["contact_id"]).first()
        if not c: raise HTTPException(400, "Invalid contact_id")
    for k, v in payload.items(): setattr(d, k, v)
    db.commit(); db.refresh(d)
    return d

@router.delete("/{did}")
def delete_deal(did: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(Deal).join(Contact).filter(Contact.owner_user_id == user.id, Deal.id == did)
    d = q.first()
    if not d: raise HTTPException(404, "Deal not found")
    db.delete(d); db.commit()
    return {"ok": True}
