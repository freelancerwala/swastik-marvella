from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.config import PAYMENT_DIR
from app.database import get_db
from app.deps import get_current_user, require_roles
from app.helpers import charge_status, default_due_date, user_flat_ids
from app.notify import eleventh_due_notices
from app.models import (
    Flat,
    MaintenanceCharge,
    MaintenancePayment,
    MaintenanceSlip,
    PaymentStatus,
    Role,
    User,
)
from app.helpers import payment_to_out
from app.schemas import ChargeBulkIn, ChargeIn, ChargeOut, MethodIn, MonthDueIn, PaymentOut, RecordPaymentIn, ReviewPaymentIn
from app.services.pdf import generate_slip_pdf

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


def _charges_query(db: Session):
    return db.query(MaintenanceCharge).options(
        joinedload(MaintenanceCharge.flat).joinedload(Flat.owner_profile),
        joinedload(MaintenanceCharge.payments).joinedload(MaintenancePayment.payer),
        joinedload(MaintenanceCharge.slip),
    )


def confirm_and_create_slip(db: Session, payment: MaintenancePayment, user: User, note: str = "") -> None:
    payment.status = PaymentStatus.confirmed
    payment.secretary_note = note or payment.secretary_note
    payment.confirmed_by = user.id
    payment.confirmed_at = datetime.utcnow()
    if payment.slip:
        return
    charge = payment.charge
    if not charge:
        charge = db.get(MaintenanceCharge, payment.charge_id)
    if charge and charge.slip:
        raise HTTPException(status_code=400, detail="A slip already exists for this month")
    count = db.query(MaintenanceSlip).count() + 1
    slip = MaintenanceSlip(
        slip_no=f"SM-{charge.month.replace('-', '')}-{count:04d}",
        payment_id=payment.id,
        charge_id=charge.id,
        flat_id=charge.flat_id,
        month=charge.month,
        amount=payment.amount,
    )
    db.add(slip)
    db.flush()
    owner = charge.flat.owner_profile if charge.flat else None
    slip.pdf_path = generate_slip_pdf(slip, charge.flat, payment.payer, owner)


@router.get("/charges", response_model=list[ChargeOut])
def list_charges(
    only_remaining: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = _charges_query(db)
    if user.role != Role.secretary:
        ids = user_flat_ids(db, user)
        query = query.filter(MaintenanceCharge.flat_id.in_(ids or [-1]))
    items = [charge_status(c) for c in query.order_by(MaintenanceCharge.month.desc(), MaintenanceCharge.id.desc())]
    if only_remaining:
        items = [c for c in items if c.remaining_amount > 0]
    return items


@router.post("/charges", response_model=ChargeOut)
def create_charge(
    payload: ChargeIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary)),
):
    if not db.get(Flat, payload.flat_id):
        raise HTTPException(status_code=404, detail="Flat not found")
    exists = (
        db.query(MaintenanceCharge)
        .filter(MaintenanceCharge.flat_id == payload.flat_id, MaintenanceCharge.month == payload.month)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="This flat already has a slip month created")
    data = payload.model_dump()
    if not data.get("due_date"):
        data["due_date"] = default_due_date(data["month"])
    charge = MaintenanceCharge(**data, created_by=user.id)
    db.add(charge)
    db.commit()
    return charge_status(_charges_query(db).filter(MaintenanceCharge.id == charge.id).first())


@router.post("/charges/bulk", response_model=list[ChargeOut])
def create_charges_bulk(
    payload: ChargeBulkIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary)),
):
    flats = db.query(Flat).all()
    if payload.flat_ids:
        flats = [f for f in flats if f.id in payload.flat_ids]
    created = []
    for flat in flats:
        exists = (
            db.query(MaintenanceCharge)
            .filter(MaintenanceCharge.flat_id == flat.id, MaintenanceCharge.month == payload.month)
            .first()
        )
        if exists:
            continue
        charge = MaintenanceCharge(
            flat_id=flat.id,
            month=payload.month,
            amount=payload.amount,
            due_date=payload.due_date or default_due_date(payload.month),
            description=payload.description,
            created_by=user.id,
        )
        db.add(charge)
        created.append(charge)
    db.commit()
    return [charge_status(_charges_query(db).filter(MaintenanceCharge.id == c.id).first()) for c in created]


@router.put("/charges/month-due")
def set_month_due(
    payload: MonthDueIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    rows = db.query(MaintenanceCharge).filter(MaintenanceCharge.month == payload.month).all()
    updated = 0
    for row in rows:
        if row.slip:
            continue
        row.due_date = payload.due_date
        updated += 1
    db.commit()
    return {"updated": updated}


@router.get("/due-notices")
def due_notices(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    return eleventh_due_notices(db)


@router.put("/charges/{charge_id}", response_model=ChargeOut)
def update_charge(
    charge_id: int,
    payload: ChargeIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    charge = db.get(MaintenanceCharge, charge_id)
    if not charge:
        raise HTTPException(status_code=404, detail="Charge not found")
    if charge.slip:
        raise HTTPException(status_code=400, detail="Paid slip already exists for this month")
    for key, value in payload.model_dump().items():
        setattr(charge, key, value)
    db.commit()
    return charge_status(_charges_query(db).filter(MaintenanceCharge.id == charge.id).first())


@router.put("/charges/{charge_id}/method", response_model=ChargeOut)
def update_payment_method(
    charge_id: int,
    payload: MethodIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    charge = db.get(MaintenanceCharge, charge_id)
    if not charge:
        raise HTTPException(status_code=404, detail="Charge not found")
    charge.payment_method = payload.payment_method or ""
    db.commit()
    return charge_status(_charges_query(db).filter(MaintenanceCharge.id == charge.id).first())


@router.delete("/charges/{charge_id}")
def delete_charge(
    charge_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    charge = db.get(MaintenanceCharge, charge_id)
    if not charge:
        raise HTTPException(status_code=404, detail="Charge not found")
    if charge.slip:
        raise HTTPException(status_code=400, detail="Paid slip already exists for this month")
    db.delete(charge)
    db.commit()
    return {"ok": True}


@router.get("/payments", response_model=list[PaymentOut])
def list_payments(
    status_filter: PaymentStatus | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    query = db.query(MaintenancePayment).options(joinedload(MaintenancePayment.payer)).order_by(
        MaintenancePayment.created_at.desc()
    )
    if status_filter:
        query = query.filter(MaintenancePayment.status == status_filter)
    return [payment_to_out(p) for p in query.all()]


@router.post("/payments", response_model=PaymentOut)
async def submit_payment(
    charge_id: int = Form(...),
    amount: float = Form(...),
    screenshot: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.owner, Role.rent)),
):
    charge = _charges_query(db).filter(MaintenanceCharge.id == charge_id).first()
    if not charge:
        raise HTTPException(status_code=404, detail="Maintenance month not found")
    allowed = user_flat_ids(db, user)
    if charge.flat_id not in allowed:
        raise HTTPException(status_code=403, detail="This maintenance is not for your flat")
    current = charge_status(charge)
    if current.payment_status == "paid":
        raise HTTPException(status_code=400, detail="This month is already paid")
    suffix = Path(screenshot.filename or "proof.jpg").suffix.lower() or ".jpg"
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".pdf"}:
        raise HTTPException(status_code=400, detail="Upload a screenshot image or PDF")
    name = f"{uuid4().hex}{suffix}"
    dest = PAYMENT_DIR / name
    dest.write_bytes(await screenshot.read())
    payment = MaintenancePayment(
        charge_id=charge.id,
        paid_by_user_id=user.id,
        amount=amount,
        screenshot_path=f"payments/{name}",
        status=PaymentStatus.pending,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    payment = (
        db.query(MaintenancePayment)
        .options(joinedload(MaintenancePayment.payer))
        .filter(MaintenancePayment.id == payment.id)
        .first()
    )
    return payment_to_out(payment)


@router.post("/payments/record", response_model=PaymentOut)
def record_payment(
    payload: RecordPaymentIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary)),
):
    charge = _charges_query(db).filter(MaintenanceCharge.id == payload.charge_id).first()
    if not charge:
        raise HTTPException(status_code=404, detail="Maintenance month not found")
    current = charge_status(charge)
    if current.payment_status == "paid" or charge.slip:
        raise HTTPException(status_code=400, detail="This month is already paid")
    if payload.payment_method:
        charge.payment_method = payload.payment_method
    payment = MaintenancePayment(
        charge_id=charge.id,
        paid_by_user_id=user.id,
        amount=payload.amount or charge.amount,
        screenshot_path="",
        status=PaymentStatus.pending,
        secretary_note=payload.secretary_note,
    )
    db.add(payment)
    db.flush()
    payment = (
        db.query(MaintenancePayment)
        .options(
            joinedload(MaintenancePayment.payer),
            joinedload(MaintenancePayment.charge).joinedload(MaintenanceCharge.flat).joinedload(Flat.owner_profile),
            joinedload(MaintenancePayment.charge).joinedload(MaintenanceCharge.slip),
        )
        .filter(MaintenancePayment.id == payment.id)
        .first()
    )
    confirm_and_create_slip(db, payment, user, payload.secretary_note)
    db.commit()
    payment = (
        db.query(MaintenancePayment)
        .options(joinedload(MaintenancePayment.payer))
        .filter(MaintenancePayment.id == payment.id)
        .first()
    )
    return payment_to_out(payment)


@router.post("/payments/{payment_id}/review", response_model=PaymentOut)
def review_payment(
    payment_id: int,
    payload: ReviewPaymentIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary)),
):
    payment = (
        db.query(MaintenancePayment)
        .options(
            joinedload(MaintenancePayment.payer),
            joinedload(MaintenancePayment.charge).joinedload(MaintenanceCharge.flat),
            joinedload(MaintenancePayment.charge).joinedload(MaintenanceCharge.slip),
        )
        .filter(MaintenancePayment.id == payment_id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payload.status not in {PaymentStatus.confirmed, PaymentStatus.rejected}:
        raise HTTPException(status_code=400, detail="Use confirmed or rejected")
    payment.status = payload.status
    payment.secretary_note = payload.secretary_note
    payment.confirmed_by = user.id
    payment.confirmed_at = datetime.utcnow()
    if payload.status == PaymentStatus.confirmed:
        confirm_and_create_slip(db, payment, user, payload.secretary_note)
    db.commit()
    payment = (
        db.query(MaintenancePayment)
        .options(joinedload(MaintenancePayment.payer))
        .filter(MaintenancePayment.id == payment.id)
        .first()
    )
    return payment_to_out(payment)
