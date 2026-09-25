from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import Notification, Reminder, ReminderAudience, Role, User
from app.notify import process_due_reminders, resident_contacts
from app.schemas import NoticeContact, NotificationOut, ReminderIn, ReminderOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    process_due_reminders(db)
    return (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(40)
        .all()
    )


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    process_due_reminders(db)
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read.is_(False))
        .count()
    )
    return {"count": count}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.get(Notification, notification_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    item.is_read = True
    db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read.is_(False)).update({"is_read": True})
    db.commit()
    return {"ok": True}


@router.get("/reminders/contacts", response_model=list[NoticeContact])
def reminder_contacts(
    audience: ReminderAudience = ReminderAudience.all,
    title: str = "",
    body: str = "",
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    message = "\n".join(part for part in [title.strip(), body.strip()] if part)
    return resident_contacts(db, audience, message)


@router.get("/reminders", response_model=list[ReminderOut])
def list_reminders(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    process_due_reminders(db)
    return db.query(Reminder).order_by(Reminder.remind_at.desc()).all()


@router.post("/reminders", response_model=ReminderOut)
def create_reminder(
    payload: ReminderIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary)),
):
    item = Reminder(
        title=payload.title,
        body=payload.body,
        audience=payload.audience,
        remind_at=payload.remind_at or datetime.utcnow(),
        created_by=user.id,
        sent=False,
    )
    db.add(item)
    db.commit()
    process_due_reminders(db)
    db.refresh(item)
    return item


@router.put("/reminders/{reminder_id}", response_model=ReminderOut)
def update_reminder(
    reminder_id: int,
    payload: ReminderIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    item = db.get(Reminder, reminder_id)
    if not item:
        raise HTTPException(status_code=404, detail="Reminder not found")
    item.title = payload.title
    item.body = payload.body
    item.audience = payload.audience
    if payload.remind_at:
        item.remind_at = payload.remind_at
        if payload.remind_at > datetime.utcnow():
            item.sent = False
    db.commit()
    process_due_reminders(db)
    db.refresh(item)
    return item


@router.delete("/reminders/{reminder_id}")
def delete_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    item = db.get(Reminder, reminder_id)
    if not item:
        raise HTTPException(status_code=404, detail="Reminder not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/reminders/unpaid", response_model=ReminderOut)
def remind_unpaid(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary)),
):
    item = Reminder(
        title="Maintenance reminder",
        body="Your society maintenance is still pending. Please pay and attach the screenshot so the secretary can confirm the month slip.",
        audience=ReminderAudience.unpaid,
        remind_at=datetime.utcnow(),
        created_by=user.id,
        sent=False,
    )
    db.add(item)
    db.commit()
    process_due_reminders(db)
    db.refresh(item)
    return item
