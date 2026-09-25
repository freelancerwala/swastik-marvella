from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import require_roles
from app.helpers import dues_by_flat, user_flat_ids
from app.models import Flat, Role, User
from app.schemas import FlatDirectoryUnit, FlatIn, FlatOut

router = APIRouter(prefix="/api/flats", tags=["flats"])


@router.get("", response_model=list[FlatOut])
def list_flats(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary, Role.owner, Role.rent)),
):
    query = db.query(Flat).order_by(Flat.wing, Flat.floor, Flat.number)
    if user.role != Role.secretary:
        ids = user_flat_ids(db, user)
        query = query.filter(Flat.id.in_(ids or [-1]))
    return query.all()


@router.get("/directory", response_model=list[FlatDirectoryUnit])
def flats_directory(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    dues = dues_by_flat(db)
    flats = (
        db.query(Flat)
        .options(joinedload(Flat.owner_profile), joinedload(Flat.tenants))
        .order_by(Flat.wing, Flat.floor, Flat.number)
        .all()
    )
    rows = []
    for flat in flats:
        tenant = next((item for item in flat.tenants if item.is_active), None)
        owner = flat.owner_profile
        money = dues.get(flat.id, {"dues": 0.0, "paid": 0.0})
        household = (1 if owner else 0) + (1 if tenant else 0)
        if tenant:
            occupant, kind, phone, email = tenant.full_name, "rented", tenant.phone, tenant.email
            move_in = tenant.start_date
        elif owner:
            occupant, kind, phone, email = owner.full_name, "owner", owner.phone, owner.email
            move_in = owner.move_in_date
        else:
            occupant, kind, phone, email, move_in = "", "vacant", "", "", None
        rows.append(
            FlatDirectoryUnit(
                id=flat.id,
                wing=flat.wing,
                number=flat.number,
                floor=flat.floor,
                area_sqft=flat.area_sqft,
                status=flat.status,
                layout=flat.layout or "",
                intercom=flat.intercom or "",
                facing=getattr(flat, "facing", "") or "",
                members=max(getattr(flat, "members", 1) or 1, household or 1),
                keys_at=getattr(flat, "keys_at", "") or "",
                bike_slot=getattr(flat, "bike_slot", "") or "",
                bike_vehicle=getattr(flat, "bike_vehicle", "") or "",
                notes=flat.notes or "",
                occupant=occupant,
                occupant_kind=kind,
                occupant_phone=phone or "",
                occupant_email=email or "",
                parking=owner.parking_slot if owner else "",
                vehicle=owner.vehicle_no if owner else "",
                dues=money["dues"],
                paid=money["paid"],
                move_in=move_in,
                owner_id=owner.id if owner else None,
                tenant_id=tenant.id if tenant else None,
            )
        )
    return rows


@router.post("", response_model=FlatOut)
def create_flat(
    payload: FlatIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    if db.query(Flat).filter(Flat.number == payload.number).first():
        raise HTTPException(status_code=400, detail="Flat number already exists")
    flat = Flat(**payload.model_dump())
    db.add(flat)
    db.commit()
    db.refresh(flat)
    return flat


@router.put("/{flat_id}", response_model=FlatOut)
def update_flat(
    flat_id: int,
    payload: FlatIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    flat = db.get(Flat, flat_id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")
    exists = db.query(Flat).filter(Flat.number == payload.number, Flat.id != flat.id).first()
    if exists:
        raise HTTPException(status_code=400, detail="Flat number already exists")
    for key, value in payload.model_dump().items():
        setattr(flat, key, value)
    db.commit()
    db.refresh(flat)
    return flat


@router.delete("/{flat_id}")
def delete_flat(
    flat_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    flat = db.get(Flat, flat_id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")
    db.delete(flat)
    db.commit()
    return {"ok": True}
