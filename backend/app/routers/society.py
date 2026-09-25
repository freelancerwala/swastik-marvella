import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import DOCUMENT_DIR, SOCIETY_DIR
from app.database import get_db
from app.deps import get_current_user, require_roles
from app.helpers import user_flat_ids
from app.models import Flat, Role, SocietyModule, SocietyPayment, SocietyRecord, User
from app.schemas import SocietyPaymentIn, SocietyPaymentOut, SocietyRecordIn, SocietyRecordOut

router = APIRouter(prefix="/api/society", tags=["society"])

RESIDENT_CREATE = {SocietyModule.complaint, SocietyModule.visitor}


@router.get("", response_model=list[SocietyRecordOut])
def list_records(
    module: SocietyModule,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(SocietyRecord)
        .filter(SocietyRecord.module == module)
        .order_by(SocietyRecord.created_at.desc())
        .all()
    )
    if user.role == Role.secretary:
        return rows
    flats = db.query(Flat).filter(Flat.id.in_(user_flat_ids(db, user) or [-1])).all()
    numbers = {flat.number for flat in flats}
    wings = {flat.wing for flat in flats}
    kind = "owner" if user.role == Role.owner else "rent"
    visible = []
    for row in rows:
        blob = f"{row.title} {row.detail} {row.notes} {row.phone}".lower()
        if any(number.lower() in blob for number in numbers if number):
            visible.append(row)
            continue
        if module == SocietyModule.document:
            try:
                import json
                extra = json.loads(row.meta or "{}")
            except json.JSONDecodeError:
                extra = {}
            wing_ok = not extra.get("wing") or extra.get("wing") in wings
            occ = extra.get("occupancy") or "all"
            occ_ok = occ in {"all", kind}
            if wing_ok and occ_ok:
                visible.append(row)
    return visible


@router.get("/summary")
def summary(db: Session = Depends(get_db), _: User = Depends(require_roles(Role.secretary))):
    counts = {}
    for module in SocietyModule:
        counts[module.value] = db.query(SocietyRecord).filter(SocietyRecord.module == module).count()
    return counts


@router.post("", response_model=SocietyRecordOut)
def create_record(
    payload: SocietyRecordIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != Role.secretary and payload.module not in RESIDENT_CREATE:
        raise HTTPException(status_code=403, detail="You do not have access")
    row = SocietyRecord(**payload.model_dump(), created_by=user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{record_id}", response_model=SocietyRecordOut)
def update_record(
    record_id: int,
    payload: SocietyRecordIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    row = db.get(SocietyRecord, record_id)
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{record_id}")
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    row = db.get(SocietyRecord, record_id)
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/{record_id}/file", response_model=SocietyRecordOut)
async def upload_document_file(
    record_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    row = db.get(SocietyRecord, record_id)
    if not row or row.module != SocietyModule.document:
        raise HTTPException(status_code=404, detail="Document not found")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"}:
        raise HTTPException(status_code=400, detail="Attach a PDF, image, or Word file")
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File must be under 15 MB")
    name = f"{uuid4().hex}{suffix}"
    (DOCUMENT_DIR / name).write_bytes(content)
    try:
        extra = json.loads(row.meta or "{}")
    except json.JSONDecodeError:
        extra = {}
    if not isinstance(extra, dict):
        extra = {}
    old = extra.get("file")
    if old:
        previous = DOCUMENT_DIR / Path(str(old)).name
        if previous.exists():
            previous.unlink()
    extra["file"] = name
    extra["file_name"] = file.filename or name
    row.meta = json.dumps(extra)
    db.commit()
    db.refresh(row)
    return row


def _payment(db: Session) -> SocietyPayment:
    row = db.query(SocietyPayment).first()
    if row:
        return row
    row = SocietyPayment()
    secretary = db.query(User).filter(User.role == Role.secretary).order_by(User.id.asc()).first()
    if secretary:
        row.phone = secretary.phone or ""
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _payment_out(row: SocietyPayment) -> SocietyPaymentOut:
    return SocietyPaymentOut(
        phone=row.phone or "",
        bank_name=row.bank_name or "",
        account_name=row.account_name or "",
        account_number=row.account_number or "",
        ifsc=row.ifsc or "",
        upi_id=row.upi_id or "",
        qr_url="/api/files/qr" if row.qr_path else "",
    )


@router.get("/payment", response_model=SocietyPaymentOut)
def get_payment(db: Session = Depends(get_db), _: User = Depends(require_roles(Role.secretary))):
    return _payment_out(_payment(db))


@router.put("/payment", response_model=SocietyPaymentOut)
def save_payment(
    payload: SocietyPaymentIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    row = _payment(db)
    for key, value in payload.model_dump().items():
        setattr(row, key, value or "")
    secretary = db.query(User).filter(User.role == Role.secretary).order_by(User.id.asc()).first()
    if secretary:
        secretary.phone = row.phone or ""
    db.commit()
    db.refresh(row)
    return _payment_out(row)


@router.post("/payment/qr", response_model=SocietyPaymentOut)
async def upload_qr(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(status_code=400, detail="Upload a PNG or JPG QR code")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="QR image must be under 5 MB")
    row = _payment(db)
    if row.qr_path:
        previous = SOCIETY_DIR / Path(row.qr_path).name
        if previous.exists():
            previous.unlink()
    name = f"qr{suffix}"
    (SOCIETY_DIR / name).write_bytes(content)
    row.qr_path = name
    db.commit()
    db.refresh(row)
    return _payment_out(row)
