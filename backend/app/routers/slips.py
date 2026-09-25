from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.config import SLIP_DIR
from app.database import get_db
from app.deps import get_current_user, require_roles
from app.helpers import user_flat_ids
from app.models import Flat, MaintenancePayment, MaintenanceSlip, PaymentStatus, Role, User
from app.schemas import SlipOut, WhatsAppSendIn
from app.services.pdf import public_pdf_url
from app.services.whatsapp import send_document, slip_message, wa_me_url

router = APIRouter(prefix="/api/slips", tags=["slips"])


def _people(slip: MaintenanceSlip):
    flat = slip.flat
    if not flat:
        return "", "", "", ""
    tenant = next((item for item in (flat.tenants or []) if item.is_active), None)
    owner = flat.owner_profile
    if tenant:
        return tenant.full_name, "rent", tenant.phone or (owner.phone if owner else ""), flat.wing
    if owner:
        return owner.full_name, "owner", owner.phone or "", flat.wing
    return "", "", "", flat.wing


def to_out(slip: MaintenanceSlip, phone: str = "") -> SlipOut:
    pdf_url = public_pdf_url(slip.pdf_path) if slip.pdf_path else ""
    message = slip_message(slip, slip.flat, pdf_url) if slip.flat else ""
    occupant, kind, person_phone, wing = _people(slip)
    share_phone = phone or person_phone
    return SlipOut(
        id=slip.id,
        slip_no=slip.slip_no,
        payment_id=slip.payment_id,
        charge_id=slip.charge_id,
        flat_id=slip.flat_id,
        flat_number=slip.flat.number if slip.flat else "",
        month=slip.month,
        amount=slip.amount,
        pdf_path=pdf_url,
        created_at=slip.created_at,
        whatsapp_url=wa_me_url(share_phone, message) if message and share_phone else "",
        wing=wing or (slip.flat.wing if slip.flat else ""),
        floor=slip.flat.floor if slip.flat else 0,
        occupant=occupant,
        occupant_kind=kind,
        phone=person_phone,
    )


def _query(db: Session):
    return db.query(MaintenanceSlip).options(
        joinedload(MaintenanceSlip.flat).joinedload(Flat.owner_profile),
        joinedload(MaintenanceSlip.flat).joinedload(Flat.tenants),
        joinedload(MaintenanceSlip.payment),
        joinedload(MaintenanceSlip.charge),
    )


@router.get("", response_model=list[SlipOut])
def list_slips(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = _query(db)
    if user.role != Role.secretary:
        ids = user_flat_ids(db, user)
        query = query.filter(MaintenanceSlip.flat_id.in_(ids or [-1]))
    slips = query.order_by(MaintenanceSlip.created_at.desc()).all()
    return [to_out(slip) for slip in slips]


@router.get("/{slip_id}", response_model=SlipOut)
def get_slip(slip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    slip = _query(db).filter(MaintenanceSlip.id == slip_id).first()
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    if user.role != Role.secretary and slip.flat_id not in user_flat_ids(db, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    phone = slip.flat.owner_profile.phone if slip.flat and slip.flat.owner_profile else user.phone
    return to_out(slip, phone)


@router.post("/{slip_id}/whatsapp")
def share_whatsapp(
    slip_id: int,
    payload: WhatsAppSendIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    slip = _query(db).filter(MaintenanceSlip.id == slip_id).first()
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    if user.role != Role.secretary and slip.flat_id not in user_flat_ids(db, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    pdf_url = public_pdf_url(slip.pdf_path) if slip.pdf_path else ""
    message = payload.message or slip_message(slip, slip.flat, pdf_url)
    share_url = wa_me_url(payload.phone, message)
    cloud = {"sent": False, "mode": "share_link", "detail": "Share link created."}
    if slip.pdf_path:
        cloud = send_document(payload.phone, slip.pdf_path, message)
    return {
        "slip_no": slip.slip_no,
        "whatsapp_url": share_url,
        "pdf_url": pdf_url,
        "cloud": cloud,
    }


@router.delete("/{slip_id}")
def delete_slip(
    slip_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    slip = _query(db).filter(MaintenanceSlip.id == slip_id).first()
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    if slip.pdf_path:
        pdf = SLIP_DIR / Path(slip.pdf_path).name
        if pdf.exists():
            pdf.unlink()
    payment = slip.payment
    db.delete(slip)
    if payment:
        payment.status = PaymentStatus.rejected
        payment.secretary_note = (payment.secretary_note or "") + " Slip removed by secretary."
    db.commit()
    return {"ok": True}
