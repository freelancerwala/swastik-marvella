import json

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.helpers import default_due_date
from app.config import settings
from app.models import Flat, FlatStatus, MaintenanceCharge, OwnerProfile, Role, SocietyModule, SocietyRecord, User

DEMO_EMAILS = {
    "secretary@swastikmarvella.in",
    "owner.a101@swastikmarvella.in",
    "rent.a101@swastikmarvella.in",
}


def should_reset_demo(db: Session) -> bool:
    emails = {row[0] for row in db.query(User.email).all()}
    return bool(emails) and emails <= DEMO_EMAILS and "owner.a101@swastikmarvella.in" in emails


def seed_if_empty(db: Session) -> None:
    if db.query(User).first():
        return

    db.add(
        User(
            name=settings.secretary_name,
            email=settings.secretary_email.lower(),
            phone=settings.secretary_phone,
            password_hash=hash_password(settings.secretary_password),
            role=Role.secretary,
        )
    )
    db.commit()


def layout_for(wing: str, floor: int = 0) -> str:
    if str(wing).upper() == "B" and int(floor or 0) == 11:
        return "3 BHK"
    return "3 BHK" if str(wing).upper() == "A" else "2 BHK"


def ensure_tower(db: Session) -> None:
    """Wing A is 3 BHK. Wing B is 2 BHK, except the 11th floor which is 3 BHK."""
    by_number = {flat.number: flat for flat in db.query(Flat).all()}
    changed = False
    for wing in ("A", "B"):
        for floor in range(1, 12):
            layout = layout_for(wing, floor)
            for unit in range(1, 5):
                number = f"{wing}-{floor}{unit:02d}"
                flat = by_number.get(number)
                if flat:
                    if flat.layout != layout:
                        flat.layout = layout
                        changed = True
                    continue
                db.add(Flat(
                    wing=wing,
                    number=number,
                    floor=floor,
                    area_sqft=0,
                    status=FlatStatus.vacant,
                    layout=layout,
                ))
                changed = True
    for flat in db.query(Flat).filter(Flat.wing.in_(("A", "B"))).all():
        layout = layout_for(flat.wing, flat.floor)
        if flat.layout != layout:
            flat.layout = layout
            changed = True
    if changed:
        db.commit()


def _parking_level(text: str) -> str:
    value = (text or "").lower()
    if "ground" in value:
        return "ground"
    if "basement" in value:
        return "basement"
    return ""


def ensure_parking(db: Session) -> None:
    """A parking card exists only after a resident selects Basement or Ground floor."""
    secretary = db.query(User).filter(User.role == Role.secretary).first()
    if not secretary:
        return
    flats = {flat.id: flat for flat in db.query(Flat).all()}
    by_number = {flat.number: flat for flat in flats.values()}
    owners = {
        owner.flat_id: owner
        for owner in db.query(OwnerProfile).all()
        if owner.flat_id in flats and _parking_level(owner.parking_slot)
    }
    rows = db.query(SocietyRecord).filter(SocietyRecord.module == SocietyModule.parking).all()
    changed = False
    kept: dict[int, SocietyRecord] = {}
    for row in rows:
        try:
            extra = json.loads(row.meta or "{}")
        except json.JSONDecodeError:
            extra = {}
        flat = flats.get(int(extra["flat_id"])) if extra.get("flat_id") else by_number.get(row.title)
        owner = owners.get(flat.id) if flat else None
        if not owner or flat.id in kept:
            db.delete(row)
            changed = True
            continue
        level = _parking_level(owner.parking_slot)
        row.title = flat.number
        row.detail = f"{flat.number} · {owner.full_name}"[:200]
        row.phone = (owner.phone or "")[:20]
        row.category = level
        row.status = "allotted"
        row.notes = owner.vehicle_no or ""
        row.meta = json.dumps({"flat_id": flat.id, "flat": flat.number, "level_chosen": True})
        kept[flat.id] = row
        changed = True
    for flat_id, owner in owners.items():
        if flat_id in kept:
            continue
        flat = flats[flat_id]
        level = _parking_level(owner.parking_slot)
        db.add(SocietyRecord(
            module=SocietyModule.parking,
            title=flat.number,
            detail=f"{flat.number} · {owner.full_name}"[:200],
            phone=(owner.phone or "")[:20],
            status="allotted",
            category=level,
            notes=owner.vehicle_no or "",
            meta=json.dumps({"flat_id": flat.id, "flat": flat.number, "level_chosen": True}),
            created_by=secretary.id,
        ))
        changed = True
    if changed:
        db.commit()


def ensure_default_dues(db: Session) -> None:
    """Bills with no due date are due on the 15th of that month."""
    changed = False
    for row in db.query(MaintenanceCharge).filter(MaintenanceCharge.due_date.is_(None)).all():
        if not row.month or len(str(row.month)) < 7:
            continue
        row.due_date = default_due_date(row.month)
        changed = True
    if changed:
        db.commit()
