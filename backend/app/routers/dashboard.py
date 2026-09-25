import json
import re
from datetime import date, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.helpers import charge_status, user_flat_ids
from app.models import DailyUpdate, Flat, FlatStatus, MaintenanceCharge, MaintenancePayment, MaintenanceSlip, Notification, OwnerProfile, PaymentStatus, Role, SocietyModule, SocietyRecord, Tenant, User
from app.notify import process_due_reminders
from app.routers.updates import to_out
from app.schemas import ActivityItem, CalendarMark, DashboardOut, ShopOverview, ShopRetailer, WingOverview

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def society_counts(db: Session) -> dict[str, int]:
    counts = {item.value: 0 for item in SocietyModule}
    rows = db.query(SocietyRecord.module, func.count(SocietyRecord.id)).group_by(SocietyRecord.module).all()
    for module, total in rows:
        key = module.value if hasattr(module, "value") else str(module)
        counts[key] = total
    return counts


def wing_overviews(db: Session) -> list[WingOverview]:
    flats = db.query(Flat).options(joinedload(Flat.owner_profile), joinedload(Flat.tenants)).all()
    by_wing: dict[str, dict] = {}
    for flat in flats:
        wing = (flat.wing or "A").strip() or "A"
        row = by_wing.setdefault(
            wing,
            {"wing": wing, "flats": 0, "occupied": 0, "vacant": 0, "owners": 0, "tenants": 0},
        )
        row["flats"] += 1
        if flat.status == FlatStatus.vacant:
            row["vacant"] += 1
        else:
            row["occupied"] += 1
        if flat.owner_profile:
            row["owners"] += 1
        row["tenants"] += sum(1 for tenant in (flat.tenants or []) if tenant.is_active)
    result = []
    for row in sorted(by_wing.values(), key=lambda item: item["wing"]):
        occupancy = round((row["occupied"] / row["flats"]) * 100, 1) if row["flats"] else 0
        result.append(WingOverview(**row, occupancy=occupancy))
    return result


def shop_overview(db: Session) -> ShopOverview:
    shops = (
        db.query(SocietyRecord)
        .filter(SocietyRecord.module == SocietyModule.shop)
        .order_by(SocietyRecord.created_at.desc())
        .all()
    )
    vacant = sum(1 for item in shops if (item.status or "").lower() in {"vacant", "closed"})
    occupied = max(len(shops) - vacant, 0)
    retailers = []
    for index, item in enumerate(shops[:3]):
        extra = {}
        try:
            extra = json.loads(item.meta or "{}")
        except json.JSONDecodeError:
            extra = {}
        code = extra.get("code") or f"S-{index + 1:02d}"
        retailers.append(ShopRetailer(code=code, title=item.title, detail=item.detail or item.status))
    return ShopOverview(total=len(shops), occupied=occupied, vacant=vacant, retailers=retailers)


def parse_date_hint(*texts: str) -> date | None:
    for text in texts:
        match = re.search(r"(20\d{2}-\d{2}-\d{2})", text or "")
        if match:
            try:
                return date.fromisoformat(match.group(1))
            except ValueError:
                continue
    return None


def activity_feed(db: Session, secretary: bool) -> list[ActivityItem]:
    items: list[ActivityItem] = []
    records = db.query(SocietyRecord).order_by(SocietyRecord.created_at.desc()).limit(12).all()
    for row in records:
        module = row.module.value if hasattr(row.module, "value") else str(row.module)
        kind = {
            "visitor": "security",
            "complaint": "maintenance",
            "shop": "commercial",
            "event": "event",
            "security": "security",
            "staff": "staff",
        }.get(module, "notice")
        link = {
            "visitor": "/admin/visitors" if secretary else "/app/visitors",
            "complaint": "/admin/complaints" if secretary else "/app/complaints",
            "shop": "/admin/shops",
            "event": "/admin/events" if secretary else "/app/events",
            "security": "/admin/security",
            "staff": "/admin/staff",
        }.get(module, "/admin")
        extra = f"{row.detail} · {row.status}".strip(" ·")
        items.append(ActivityItem(kind=kind, title=row.title, detail=extra, created_at=row.created_at, link=link))

    payments = (
        db.query(MaintenancePayment)
        .options(joinedload(MaintenancePayment.charge).joinedload(MaintenanceCharge.flat), joinedload(MaintenancePayment.payer))
        .order_by(MaintenancePayment.created_at.desc())
        .limit(8)
        .all()
    )
    for pay in payments:
        flat_no = pay.charge.flat.number if pay.charge and pay.charge.flat else "flat"
        payer = pay.payer.name if pay.payer else "Resident"
        items.append(
            ActivityItem(
                kind="payment",
                title=f"Resident of {flat_no} ({payer}) paid maintenance {pay.amount:,.0f}",
                detail=f"{pay.status.value if hasattr(pay.status, 'value') else pay.status} · {pay.charge.month if pay.charge else ''}".strip(" ·"),
                created_at=pay.created_at,
                link="/admin/payments" if secretary else "/app/slips",
            )
        )

    tenants = db.query(Tenant).options(joinedload(Tenant.flat)).order_by(Tenant.created_at.desc()).limit(4).all()
    for tenant in tenants:
        items.append(
            ActivityItem(
                kind="resident",
                title=f"New tenant registered: {tenant.full_name}",
                detail=f"Moved into {tenant.flat.number if tenant.flat else 'a flat'}",
                created_at=tenant.created_at,
                link="/admin/tenants" if secretary else "/app/rent",
            )
        )

    items.sort(key=lambda item: item.created_at or datetime.min, reverse=True)
    return items[:7]


def calendar_marks(db: Session, remaining_items, updates) -> list[CalendarMark]:
    marks: list[CalendarMark] = []
    for charge in remaining_items:
        if charge.due_date:
            marks.append(CalendarMark(date=str(charge.due_date), kind="due", label=f"{charge.flat_number} due"))
    events = db.query(SocietyRecord).filter(SocietyRecord.module == SocietyModule.event).order_by(SocietyRecord.created_at.desc()).limit(20).all()
    for event in events:
        event_date = parse_date_hint(event.detail, event.notes, event.title) or event.created_at.date()
        marks.append(CalendarMark(date=str(event_date), kind="event", label=event.title))
    for item in updates:
        category = item.category.value if hasattr(item.category, "value") else str(item.category)
        kind = "maintenance" if category == "maintenance" else ("event" if category in {"event", "festival"} else "notice")
        marks.append(CalendarMark(date=str(item.created_at.date()), kind=kind, label=item.title))
    return marks


@router.get("", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    process_due_reminders(db)
    updates = (
        db.query(DailyUpdate)
        .options(joinedload(DailyUpdate.author), joinedload(DailyUpdate.media))
        .filter(DailyUpdate.is_published == True)
        .order_by(DailyUpdate.is_pinned.desc(), DailyUpdate.created_at.desc())
        .limit(8)
        .all()
    )
    charges = db.query(MaintenanceCharge).options(
        joinedload(MaintenanceCharge.flat),
        joinedload(MaintenanceCharge.payments).joinedload(MaintenancePayment.payer),
    )
    if user.role != Role.secretary:
        ids = user_flat_ids(db, user)
        charges = charges.filter(MaintenanceCharge.flat_id.in_(ids or [-1]))
    charge_items = [charge_status(c) for c in charges.all()]
    remaining_items = [c for c in charge_items if c.remaining_amount > 0]
    remaining_total = sum(c.remaining_amount for c in remaining_items)
    my_flat = None
    if user.role == Role.owner and user.owner_profile and user.owner_profile.flat:
        my_flat = user.owner_profile.flat.number
    if user.role == Role.rent and user.tenant_profile and user.tenant_profile.flat:
        my_flat = user.tenant_profile.flat.number

    secretary = user.role == Role.secretary
    counts = society_counts(db)
    wings = wing_overviews(db) if secretary else []
    occupied_flats = sum(item.occupied for item in wings)
    total_flats = sum(item.flats for item in wings) or (db.query(Flat).count() if secretary else 0)
    occupancy = round((occupied_flats / total_flats) * 100, 1) if total_flats else 0
    start_today = datetime.combine(date.today(), datetime.min.time())

    visitors_today = (
        db.query(SocietyRecord)
        .filter(SocietyRecord.module == SocietyModule.visitor, SocietyRecord.created_at >= start_today)
        .count()
    )
    visitors_inside = (
        db.query(SocietyRecord)
        .filter(SocietyRecord.module == SocietyModule.visitor, SocietyRecord.status == "inside")
        .count()
    )
    open_complaints = (
        db.query(SocietyRecord)
        .filter(SocietyRecord.module == SocietyModule.complaint, SocietyRecord.status.in_(["open", "in_progress"]))
        .count()
    )
    staff_active = db.query(SocietyRecord).filter(SocietyRecord.module == SocietyModule.staff, SocietyRecord.status == "active").count()
    security_on_duty = db.query(SocietyRecord).filter(SocietyRecord.module == SocietyModule.security, SocietyRecord.status.in_(["logged", "alert"])).count()
    update_out = [to_out(item) for item in updates]

    return DashboardOut(
        society=settings.society_name,
        role=user.role,
        flats=db.query(Flat).count() if secretary else (1 if my_flat else 0),
        owners=db.query(OwnerProfile).count() if secretary else (1 if user.role == Role.owner and user.owner_profile else 0),
        active_tenants=(
            db.query(Tenant).filter(Tenant.is_active.is_(True)).count()
            if secretary
            else (
                db.query(Tenant).filter(Tenant.owner_id == user.owner_profile.id, Tenant.is_active.is_(True)).count()
                if user.role == Role.owner and user.owner_profile
                else (1 if user.role == Role.rent and user.tenant_profile else 0)
            )
        ),
        pending_payments=db.query(MaintenancePayment).filter(MaintenancePayment.status == PaymentStatus.pending).count()
        if secretary
        else len([c for c in charge_items if c.payment_status == "pending_review"]),
        unpaid_charges=len(remaining_items),
        remaining_maintenance=remaining_total,
        confirmed_slips=db.query(MaintenanceSlip).count()
        if secretary
        else db.query(MaintenanceSlip).filter(MaintenanceSlip.flat_id.in_(user_flat_ids(db, user) or [-1])).count(),
        my_flat=my_flat,
        updates=update_out,
        remaining_items=remaining_items[:6],
        unread_notifications=db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read.is_(False))
        .count(),
        society_counts=counts if secretary else {},
        wings=wings,
        shops_overview=shop_overview(db) if secretary else ShopOverview(),
        visitors_today=visitors_today,
        visitors_inside=visitors_inside,
        open_complaints=open_complaints,
        staff_active=staff_active,
        security_on_duty=security_on_duty,
        occupancy=occupancy,
        activity=activity_feed(db, secretary),
        calendar_marks=calendar_marks(db, remaining_items, update_out),
    )

