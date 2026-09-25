from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import (
    ConversationKind,
    FlatStatus,
    MediaKind,
    NotificationKind,
    PaymentStatus,
    ReminderAudience,
    Role,
    SocietyModule,
    UpdateCategory,
)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    name: str
    panel: str
    user_id: int


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    phone: str
    role: Role
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str = ""
    password: str = Field(min_length=6)
    role: Role
    is_active: bool = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    role: Optional[Role] = None
    is_active: Optional[bool] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(default=None, min_length=6)


class FlatIn(BaseModel):
    wing: str
    number: str
    floor: int = 0
    area_sqft: float = 0
    status: FlatStatus = FlatStatus.vacant
    layout: str = ""
    intercom: str = ""
    facing: str = ""
    members: int = 1
    keys_at: str = ""
    bike_slot: str = ""
    bike_vehicle: str = ""
    notes: str = ""


class FlatOut(BaseModel):
    id: int
    wing: str
    number: str
    floor: int
    area_sqft: float
    status: FlatStatus
    layout: str = ""
    intercom: str = ""
    facing: str = ""
    members: int = 1
    keys_at: str = ""
    bike_slot: str = ""
    bike_vehicle: str = ""
    notes: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("members", mode="before")
    @classmethod
    def members_default(cls, value):
        return 1 if value is None else value


class OwnerIn(BaseModel):
    user_id: Optional[int] = None
    flat_id: int
    full_name: str
    phone: str = ""
    email: str = ""
    alt_phone: str = ""
    parking_slot: str = ""
    vehicle_no: str = ""
    vehicles: Optional[str] = None
    move_in_date: Optional[date] = None
    notes: str = ""


class OwnerOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    flat_id: int
    full_name: str
    phone: str
    email: str
    alt_phone: str
    parking_slot: str
    vehicle_no: str
    vehicles: str = "[]"
    move_in_date: Optional[date]
    notes: str
    created_at: datetime
    user: Optional[UserOut] = None
    flat: Optional[FlatOut] = None

    model_config = {"from_attributes": True}

    @field_validator("vehicles", mode="before")
    @classmethod
    def vehicles_default(cls, value):
        return value or "[]"


class TenantIn(BaseModel):
    owner_id: Optional[int] = None
    user_id: Optional[int] = None
    flat_id: Optional[int] = None
    full_name: str
    phone: str = ""
    email: str = ""
    rent_amount: float = 0
    deposit: float = 0
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool = True
    notes: str = ""


class TenantOut(BaseModel):
    id: int
    owner_id: int
    user_id: Optional[int]
    flat_id: int
    full_name: str
    phone: str
    email: str
    rent_amount: float
    deposit: float
    start_date: Optional[date]
    end_date: Optional[date]
    is_active: bool
    notes: str
    created_at: datetime
    flat: Optional[FlatOut] = None

    model_config = {"from_attributes": True}


class UpdateIn(BaseModel):
    title: str
    body: str
    category: UpdateCategory = UpdateCategory.general
    is_pinned: bool = False
    is_published: bool = False


class MediaOut(BaseModel):
    id: int
    kind: MediaKind
    path: str
    caption: str = ""

    model_config = {"from_attributes": True}


class UpdateOut(BaseModel):
    id: int
    title: str
    body: str
    category: UpdateCategory
    author_id: int
    author_name: str = ""
    is_pinned: bool
    is_published: bool = False
    created_at: datetime
    media: list[MediaOut] = []

    model_config = {"from_attributes": True}


class ChargeIn(BaseModel):
    flat_id: int
    month: str
    amount: float
    due_date: Optional[date] = None
    description: str = "Society maintenance"
    payment_method: str = ""


class MethodIn(BaseModel):
    payment_method: str = ""


class ChargeBulkIn(BaseModel):
    month: str
    amount: float
    due_date: Optional[date] = None
    description: str = "Society maintenance"
    flat_ids: Optional[list[int]] = None


class MonthDueIn(BaseModel):
    month: str
    due_date: Optional[date] = None


class PaymentOut(BaseModel):
    id: int
    charge_id: int
    paid_by_user_id: int
    payer_name: str = ""
    amount: float
    screenshot_path: str
    status: PaymentStatus
    secretary_note: str
    confirmed_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class ChargeOut(BaseModel):
    id: int
    flat_id: int
    flat_number: str = ""
    month: str
    amount: float
    due_date: Optional[date]
    description: str
    payment_method: str = ""
    created_at: datetime
    paid_amount: float = 0
    remaining_amount: float = 0
    payment_status: str = "unpaid"
    latest_payment: Optional[PaymentOut] = None
    wing: str = ""
    occupant: str = ""
    slip_no: str = ""

    model_config = {"from_attributes": True}


class ReviewPaymentIn(BaseModel):
    status: PaymentStatus
    secretary_note: str = ""


class SlipOut(BaseModel):
    id: int
    slip_no: str
    payment_id: int
    charge_id: int
    flat_id: int
    flat_number: str = ""
    month: str
    amount: float
    pdf_path: str
    created_at: datetime
    whatsapp_url: str = ""
    wing: str = ""
    floor: int = 0
    occupant: str = ""
    occupant_kind: str = ""
    phone: str = ""

    model_config = {"from_attributes": True}


class WhatsAppSendIn(BaseModel):
    phone: str
    message: Optional[str] = None


class WingOverview(BaseModel):
    wing: str
    flats: int = 0
    occupied: int = 0
    vacant: int = 0
    owners: int = 0
    tenants: int = 0
    occupancy: float = 0


class ShopRetailer(BaseModel):
    code: str
    title: str
    detail: str = ""


class ShopOverview(BaseModel):
    total: int = 0
    occupied: int = 0
    vacant: int = 0
    retailers: list[ShopRetailer] = Field(default_factory=list)


class ActivityItem(BaseModel):
    kind: str
    title: str
    detail: str = ""
    created_at: Optional[datetime] = None
    link: str = ""


class CalendarMark(BaseModel):
    date: str
    kind: str
    label: str = ""


class DashboardOut(BaseModel):
    society: str
    role: Role
    flats: int = 0
    owners: int = 0
    active_tenants: int = 0
    pending_payments: int = 0
    unpaid_charges: int = 0
    remaining_maintenance: float = 0
    confirmed_slips: int = 0
    my_flat: Optional[str] = None
    updates: list[UpdateOut] = []
    remaining_items: list[ChargeOut] = []
    unread_notifications: int = 0
    society_counts: dict[str, int] = {}
    wings: list[WingOverview] = Field(default_factory=list)
    shops_overview: ShopOverview = Field(default_factory=ShopOverview)
    visitors_today: int = 0
    visitors_inside: int = 0
    open_complaints: int = 0
    staff_active: int = 0
    security_on_duty: int = 0
    occupancy: float = 0
    activity: list[ActivityItem] = Field(default_factory=list)
    calendar_marks: list[CalendarMark] = Field(default_factory=list)


class SocietyRecordIn(BaseModel):
    module: SocietyModule
    title: str
    detail: str = ""
    phone: str = ""
    status: str = "active"
    category: str = ""
    notes: str = ""
    meta: str = "{}"


class SocietyRecordOut(BaseModel):
    id: int
    module: SocietyModule
    title: str
    detail: str
    phone: str
    status: str
    category: str = ""
    notes: str
    meta: str = "{}"
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("meta", mode="before")
    @classmethod
    def default_meta(cls, value):
        return value or "{}"


class MemberContact(BaseModel):
    user_id: Optional[int] = None
    name: str
    phone: str
    role: str
    whatsapp_url: str = ""


class NoticeContact(BaseModel):
    name: str
    phone: str
    role: str
    flat: str = ""
    whatsapp_url: str = ""


class BroadcastIn(BaseModel):
    message: str
    send_cloud: bool = False


class BroadcastOut(BaseModel):
    id: int
    message: str
    recipient_count: int
    group_share_url: str
    cloud_sent: int = 0
    cloud_mode: str = "share_link"
    members: list[MemberContact] = []
    created_at: datetime


class ChatMessageIn(BaseModel):
    body: str


class ChatMessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    sender_name: str = ""
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    id: int
    kind: ConversationKind
    title: str
    member_id: Optional[int] = None
    last_message: str = ""
    last_at: Optional[datetime] = None
    unread: int = 0
    member_count: int = 0


class ChatPerson(BaseModel):
    id: int
    name: str
    role: Role


class GroupCreateIn(BaseModel):
    title: str
    member_ids: list[int] = []


class RecordPaymentIn(BaseModel):
    charge_id: int
    amount: float
    secretary_note: str = "Recorded by secretary"
    payment_method: str = ""


class ReminderIn(BaseModel):
    title: str
    body: str
    audience: ReminderAudience = ReminderAudience.all
    remind_at: Optional[datetime] = None


class ReminderOut(BaseModel):
    id: int
    title: str
    body: str
    audience: ReminderAudience
    remind_at: datetime
    sent: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationOut(BaseModel):
    id: int
    title: str
    body: str
    kind: NotificationKind
    link: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class FlatDirectoryUnit(BaseModel):
    id: int
    wing: str
    number: str
    floor: int
    area_sqft: float
    status: FlatStatus
    layout: str = ""
    intercom: str = ""
    facing: str = ""
    members: int = 1
    keys_at: str = ""
    bike_slot: str = ""
    bike_vehicle: str = ""
    notes: str = ""
    occupant: str = ""
    occupant_kind: str = "vacant"
    occupant_phone: str = ""
    occupant_email: str = ""
    parking: str = ""
    vehicle: str = ""
    dues: float = 0
    paid: float = 0
    move_in: Optional[date] = None
    owner_id: Optional[int] = None
    tenant_id: Optional[int] = None

    @field_validator("members", mode="before")
    @classmethod
    def members_default(cls, value):
        return 1 if value is None else value


class ResidentDirectoryRow(BaseModel):
    kind: str
    id: int
    name: str
    email: str = ""
    phone: str = ""
    role: str = ""
    flat: str = ""
    wing: str = ""
    floor: int = 0
    parking: str = ""
    vehicle: str = ""
    vehicles: str = "[]"
    dues: float = 0
    billed: int = 0
    kyc: str = "pending"
    user_id: Optional[int] = None
    is_active: bool = True
    notes: str = ""
    members: int = 1
    owner_name: str = ""
    owner_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    created_at: Optional[datetime] = None
    committee: bool = False


class KycIn(BaseModel):
    kyc: str


class SocietyPaymentIn(BaseModel):
    phone: str = ""
    bank_name: str = ""
    account_name: str = ""
    account_number: str = ""
    ifsc: str = ""
    upi_id: str = ""


class SocietyPaymentOut(SocietyPaymentIn):
    qr_url: str = ""

    model_config = {"from_attributes": True}
