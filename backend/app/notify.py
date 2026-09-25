from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from app.helpers import charge_status
from app.models import (
    Flat,
    MaintenanceCharge,
    MaintenancePayment,
    Notification,
    NotificationKind,
    OwnerProfile,
    Reminder,
    ReminderAudience,
    Role,
    Tenant,
    User,
)
from app.services.whatsapp import normalize_phone, wa_me_url


def notify_users(db: Session, users: list[User], title: str, body: str, kind: NotificationKind, link: str = "") -> int:
    count = 0
    for user in users:
        db.add(Notification(user_id=user.id, title=title, body=body, kind=kind, link=link))
        count += 1
    return count


def member_users(db: Session, audience: ReminderAudience = ReminderAudience.all) -> list[User]:
    query = db.query(User).filter(User.is_active.is_(True), User.role.in_([Role.owner, Role.rent]))
    if audience == ReminderAudience.owner:
        query = query.filter(User.role == Role.owner)
    elif audience == ReminderAudience.rent:
        query = query.filter(User.role == Role.rent)
    users = query.all()
    if audience != ReminderAudience.unpaid:
        return users
    unpaid_ids = set()
    for charge in db.query(MaintenanceCharge).options(
        joinedload(MaintenanceCharge.flat).joinedload(Flat.owner_profile),
        joinedload(MaintenanceCharge.flat).joinedload(Flat.tenants),
        joinedload(MaintenanceCharge.payments).joinedload(MaintenancePayment.payer),
    ).all():
        status = charge_status(charge)
        if status.remaining_amount <= 0:
            continue
        owner = charge.flat.owner_profile if charge.flat else None
        if owner and owner.user_id:
            unpaid_ids.add(owner.user_id)
        for tenant in charge.flat.tenants if charge.flat else []:
            if tenant.user_id:
                unpaid_ids.add(tenant.user_id)
    return [user for user in users if user.id in unpaid_ids]


def resident_contacts(db: Session, audience: ReminderAudience, message: str) -> list[dict]:
    from app.helpers import dues_by_flat

    dues = dues_by_flat(db) if audience == ReminderAudience.unpaid else {}
    seen: set[str] = set()
    contacts: list[dict] = []

    def add(name: str, phone: str, role: str, flat_number: str, flat_id: int):
        if audience == ReminderAudience.unpaid and not (dues.get(flat_id) or {}).get("dues"):
            return
        normalized = normalize_phone(phone)
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        contacts.append({
            "name": name,
            "phone": normalized,
            "role": role,
            "flat": flat_number or "",
            "whatsapp_url": wa_me_url(normalized, message) if message else "",
        })

    if audience in {ReminderAudience.all, ReminderAudience.owner, ReminderAudience.unpaid}:
        for owner in db.query(OwnerProfile).options(joinedload(OwnerProfile.flat)).all():
            add(owner.full_name, owner.phone, "owner", owner.flat.number if owner.flat else "", owner.flat_id)
    if audience in {ReminderAudience.all, ReminderAudience.rent, ReminderAudience.unpaid}:
        for tenant in db.query(Tenant).options(joinedload(Tenant.flat)).filter(Tenant.is_active.is_(True)).all():
            add(tenant.full_name, tenant.phone, "rent", tenant.flat.number if tenant.flat else "", tenant.flat_id)
    return contacts


def member_contacts(db: Session, message: str = "") -> list[dict]:
    seen: set[str] = set()
    contacts: list[dict] = []
    for user in member_users(db):
        phone = normalize_phone(user.phone)
        if not phone or phone in seen:
            continue
        seen.add(phone)
        contacts.append(
            {
                "user_id": user.id,
                "name": user.name,
                "phone": phone,
                "role": user.role.value,
                "whatsapp_url": wa_me_url(phone, message) if message else "",
            }
        )
    return contacts


def process_due_reminders(db: Session) -> int:
    now = datetime.utcnow()
    due = db.query(Reminder).filter(Reminder.sent.is_(False), Reminder.remind_at <= now).all()
    sent = 0
    for reminder in due:
        users = member_users(db, reminder.audience)
        notify_users(db, users, reminder.title, reminder.body, NotificationKind.reminder, "/app")
        reminder.sent = True
        sent += 1
    if due:
        db.commit()
    return sent


def _payment_row(db: Session):
    from app.models import SocietyPayment

    row = db.query(SocietyPayment).first()
    if row:
        return row
    row = SocietyPayment()
    secretary = db.query(User).filter(User.role == Role.secretary).order_by(User.id.asc()).first()
    if secretary and secretary.phone:
        row.phone = secretary.phone
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def due_notice_text(amount: float, month: str, pay) -> str:
    month_label = datetime.strptime(month, "%Y-%m").strftime("%B %Y")
    return (
        f"Maintenance is due for {month_label}.\n"
        f"Amount ₹{amount:,.0f}.\n"
        "Please pay on or before the 15th of this month."
    )


def eleventh_due_notices(db: Session) -> dict:
    """On the 11th, list unpaid owners and renters and open a WhatsApp due notice for each."""
    import json
    from datetime import date

    from app.models import DueNoticeRun, SocietyPayment
    from app.services.whatsapp import send_text

    today = date.today()
    month = today.strftime("%Y-%m")
    pay = _payment_row(db)
    if today.day < 11:
        return {
            "active": False,
            "month": month,
            "prepared": False,
            "cloud_sent": False,
            "note": "On the 11th, unpaid owners and renters get a WhatsApp maintenance notice with the secretary number and bank details.",
            "contacts": [],
            "qr_url": "/api/files/qr" if pay.qr_path else "",
        }

    existing = db.query(DueNoticeRun).filter(DueNoticeRun.month == month).first()
    if existing:
        contacts = json.loads(existing.payload or "[]")
        for item in contacts:
            text = due_notice_text(float(item.get("amount") or 0), month, pay)
            item["whatsapp_url"] = wa_me_url(item.get("phone") or "", text)
        return {
            "active": True,
            "month": month,
            "prepared": True,
            "cloud_sent": existing.sent,
            "note": "WhatsApp sends only the maintenance notice: the month, the amount, and pay by the 15th.",
            "contacts": contacts,
            "qr_url": "/api/files/qr" if pay.qr_path else "",
        }

    charges = db.query(MaintenanceCharge).options(
        joinedload(MaintenanceCharge.payments),
        joinedload(MaintenanceCharge.flat).joinedload(Flat.owner_profile),
        joinedload(MaintenanceCharge.flat).joinedload(Flat.tenants),
    ).filter(MaintenanceCharge.month == month).all()
    contacts = []
    seen: set[str] = set()
    for charge in charges:
        status = charge_status(charge)
        if status.remaining_amount <= 0 or not charge.flat:
            continue
        people = []
        owner = charge.flat.owner_profile
        if owner and owner.phone:
            people.append(("owner", owner.full_name, owner.phone))
        for tenant in charge.flat.tenants:
            if tenant.is_active and tenant.phone:
                people.append(("rent", tenant.full_name, tenant.phone))
        for kind, name, phone in people:
            normalized = normalize_phone(phone)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            text = due_notice_text(status.remaining_amount, month, pay)
            result = send_text(phone, text)
            contacts.append({
                "name": name,
                "phone": normalized,
                "role": kind,
                "flat": charge.flat.number,
                "amount": status.remaining_amount,
                "whatsapp_url": wa_me_url(phone, text),
                "sent": bool(result.get("sent")),
            })
    cloud_sent = bool(contacts) and all(item["sent"] for item in contacts)
    db.add(DueNoticeRun(month=month, sent=cloud_sent, payload=json.dumps(contacts)))
    db.commit()
    note = "No unpaid owners or renters this month."
    if contacts and cloud_sent:
        note = "WhatsApp notices were sent to every unpaid owner and renter."
    elif contacts:
        note = "WhatsApp sends only the maintenance notice: the month, the amount, and pay by the 15th."
    return {
        "active": True,
        "month": month,
        "prepared": True,
        "cloud_sent": cloud_sent,
        "note": note,
        "contacts": contacts,
        "qr_url": "/api/files/qr" if pay.qr_path else "",
    }
