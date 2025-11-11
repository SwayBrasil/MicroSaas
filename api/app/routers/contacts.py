from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Contact
from ..schemas import ContactCreate, ContactUpdate, ContactRead
from ..auth import get_current_user

router = APIRouter(prefix="/contacts", tags=["contacts"])

@router.get("", response_model=list[ContactRead])
def list_contacts(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(Contact).filter(Contact.owner_user_id == user.id).order_by(Contact.id.desc()).all()

@router.get("/{cid}", response_model=ContactRead)
def get_contact(cid: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Contact).filter(Contact.owner_user_id == user.id, Contact.id == cid).first()
    if not c: raise HTTPException(404, "Contact not found")
    return c

@router.post("", response_model=ContactRead)
def create_contact(body: ContactCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = Contact(owner_user_id=user.id, **body.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    return c

@router.patch("/{cid}", response_model=ContactRead)
def update_contact(cid: int, body: ContactUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Contact).filter(Contact.owner_user_id == user.id, Contact.id == cid).first()
    if not c: raise HTTPException(404, "Contact not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    return c

@router.delete("/{cid}")
def delete_contact(cid: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Contact).filter(Contact.owner_user_id == user.id, Contact.id == cid).first()
    if not c: raise HTTPException(404, "Contact not found")
    db.delete(c); db.commit()
    return {"ok": True}
