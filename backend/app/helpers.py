from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    Flat,
    MaintenanceCharge,
    MaintenancePayment,
    OwnerProfile,
    PaymentStatus,
    Role,
    Tenant,
    User,
)
from app.schemas import ChargeOut, PaymentOut


def default_due_date(month: str) -> date:
    """Due date is the 15th of the bill month. Overdue starts the next day."""
    year, mon = str(month).split("-")[:2]
    return date(int(year), int(mon), 15)


def payment_to_out(payment: MaintenancePayment | None) -> PaymentOut | None:
    if not payment:
        return None
    return PaymentOut(
        id=payment.id,
        charge_id=payment.charge_id,
        paid_by_user_id=payment.paid_by_user_id,
        payer_name=payment.payer.name if payment.payer else "",
        amount=payment.amount,
        screenshot_path=payment.screenshot_path,
        status=payment.status,
        secretary_note=payment.secretary_note,
        confirmed_at=payment.confirmed_at,
        created_at=payment.created_at,
    )


def charge_status(charge: MaintenanceCharge) -> ChargeOut:
    confirmed = [p for p in charge.payments if p.status == PaymentStatus.confirmed]
    pending = [p for p in charge.payments if p.status == PaymentStatus.pending]
    paid = sum(p.amount for p in confirmed)
    remaining = max(charge.amount - paid, 0)
    if paid >= charge.amount:
        state = "paid"
    elif pending:
        state = "pending_review"
    elif paid > 0:
        state = "partial"
    else:
        state = "unpaid"
    latest = None
    if charge.payments:
        latest = sorted(charge.payments, key=lambda p: p.created_at, reverse=True)[0]
    return ChargeOut(
        id=charge.id,
        flat_id=charge.flat_id,
        flat_number=charge.flat.number if charge.flat else "",
        month=charge.month,
        amount=charge.amount,
        due_date=charge.due_date,
        description=charge.description,
        payment_method=charge.payment_method or "",
        created_at=charge.created_at,
        paid_amount=paid,
        remaining_amount=remaining,
        payment_status=state,
        latest_payment=payment_to_out(latest),
        wing=charge.flat.wing if charge.flat else "",
        occupant=charge.flat.owner_profile.full_name if charge.flat and charge.flat.owner_profile else "",
        slip_no=charge.slip.slip_no if charge.slip else "",
    )


def dues_by_flat(db: Session) -> dict[int, dict[str, float]]:
    from sqlalchemy.orm import joinedload

    charges = db.query(MaintenanceCharge).options(joinedload(MaintenanceCharge.payments)).all()
    out: dict[int, dict[str, float]] = {}
    for charge in charges:
        row = charge_status(charge)
        bucket = out.setdefault(charge.flat_id, {"dues": 0.0, "paid": 0.0, "billed": 0})
        bucket["dues"] += row.remaining_amount
        bucket["paid"] += row.paid_amount
        bucket["billed"] += 1
    return out


def user_flat_ids(db: Session, user: User) -> list[int]:
    if user.role == Role.secretary:
        return [f.id for f in db.query(Flat).all()]
    if user.role == Role.owner and user.owner_profile:
        return [user.owner_profile.flat_id]
    if user.role == Role.rent and user.tenant_profile:
        return [user.tenant_profile.flat_id]
    return []


def owner_for_user(db: Session, user: User) -> OwnerProfile:
    if user.role == Role.owner:
        if not user.owner_profile:
            raise HTTPException(status_code=400, detail="Owner details are not linked yet")
        return user.owner_profile
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an owner can do this")


def tenant_for_user(user: User) -> Tenant:
    if user.role == Role.rent:
        if not user.tenant_profile:
            raise HTTPException(status_code=400, detail="Rent details are not linked yet")
        return user.tenant_profile
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a tenant can do this")
