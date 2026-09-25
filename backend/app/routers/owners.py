import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import Flat, FlatStatus, OwnerProfile, Role, User
from app.schemas import OwnerIn, OwnerOut

router = APIRouter(prefix="/api/owners", tags=["owners"])

WHEELER = {"two": "Two wheeler", "three": "Three wheeler", "four": "Four wheeler"}


def vehicle_summary(raw: str | None) -> str:
    try:
        items = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return ""
    if not isinstance(items, list):
        return ""
    parts = []
    for item in items:
        if not isinstance(item, dict):
            continue
        number = str(item.get("number") or "").strip()
        if not number:
            continue
        parts.append(f"{WHEELER.get(item.get('type'), 'Vehicle')} {number}")
    return " · ".join(parts)


def _load(db: Session, owner_id: int) -> OwnerProfile | None:
    return (
        db.query(OwnerProfile)
        .options(joinedload(OwnerProfile.user), joinedload(OwnerProfile.flat))
        .filter(OwnerProfile.id == owner_id)
        .first()
    )


@router.get("", response_model=list[OwnerOut])
def list_owners(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(OwnerProfile).options(joinedload(OwnerProfile.user), joinedload(OwnerProfile.flat))
    if user.role == Role.owner:
        query = query.filter(OwnerProfile.user_id == user.id)
    elif user.role == Role.rent:
        if not user.tenant_profile:
            return []
        query = query.filter(OwnerProfile.id == user.tenant_profile.owner_id)
    return query.order_by(OwnerProfile.id.desc()).all()


@router.post("", response_model=OwnerOut)
def create_owner(
    payload: OwnerIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user_id = payload.user_id
    if user.role == Role.owner:
        user_id = user.id
        if user.owner_profile:
            raise HTTPException(status_code=400, detail="Owner details already exist")
    elif user.role != Role.secretary:
        raise HTTPException(status_code=403, detail="Only secretary or owner can add owner details")
    if user.role == Role.secretary and not user_id:
        owner_user = None
    else:
        if not user_id:
            raise HTTPException(status_code=400, detail="Select an owner login")
        owner_user = db.get(User, user_id)
        if not owner_user or owner_user.role != Role.owner:
            raise HTTPException(status_code=400, detail="Selected user must be an owner login")
        if db.query(OwnerProfile).filter(OwnerProfile.user_id == user_id).first():
            raise HTTPException(status_code=400, detail="This owner login already has details")
    if db.query(OwnerProfile).filter(OwnerProfile.flat_id == payload.flat_id).first():
        raise HTTPException(status_code=400, detail="This flat already has an owner")
    flat = db.get(Flat, payload.flat_id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")
    saved_vehicles = payload.vehicles if payload.vehicles is not None else "[]"
    owner = OwnerProfile(
        user_id=user_id,
        flat_id=payload.flat_id,
        full_name=payload.full_name,
        phone=payload.phone or (owner_user.phone if owner_user else ""),
        email=payload.email or (owner_user.email if owner_user else ""),
        alt_phone=payload.alt_phone,
        parking_slot=payload.parking_slot,
        vehicle_no=vehicle_summary(saved_vehicles) or payload.vehicle_no,
        vehicles=saved_vehicles,
        move_in_date=payload.move_in_date,
        notes=payload.notes,
    )
    if flat.status == FlatStatus.vacant:
        flat.status = FlatStatus.occupied_owner
    db.add(owner)
    db.commit()
    return _load(db, owner.id)


@router.put("/{owner_id}", response_model=OwnerOut)
def update_owner(
    owner_id: int,
    payload: OwnerIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    owner = db.get(OwnerProfile, owner_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    if user.role == Role.owner and owner.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can edit only your owner details")
    if user.role == Role.rent:
        raise HTTPException(status_code=403, detail="Tenant cannot edit owner details")
    if user.role == Role.secretary and payload.user_id and payload.user_id != owner.user_id:
        raise HTTPException(status_code=400, detail="Owner login cannot be changed here")
    if payload.flat_id != owner.flat_id:
        if user.role != Role.secretary:
            raise HTTPException(status_code=403, detail="Only secretary can change the assigned flat")
        if db.query(OwnerProfile).filter(OwnerProfile.flat_id == payload.flat_id, OwnerProfile.id != owner.id).first():
            raise HTTPException(status_code=400, detail="This flat already has an owner")
    data = payload.model_dump()
    data.pop("user_id", None)
    vehicles = data.pop("vehicles", None)
    if vehicles is not None:
        data["vehicles"] = vehicles
        data["vehicle_no"] = vehicle_summary(vehicles)
    for key, value in data.items():
        setattr(owner, key, value)
    db.commit()
    return _load(db, owner.id)


@router.delete("/{owner_id}")
def delete_owner(
    owner_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    owner = db.get(OwnerProfile, owner_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    db.delete(owner)
    db.commit()
    return {"ok": True}
