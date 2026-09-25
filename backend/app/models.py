from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Role(str, PyEnum):
    secretary = "secretary"
    owner = "owner"
    rent = "rent"


class FlatStatus(str, PyEnum):
    vacant = "vacant"
    occupied_owner = "occupied_owner"
    occupied_rent = "occupied_rent"


class PaymentStatus(str, PyEnum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"


class UpdateCategory(str, PyEnum):
    notice = "notice"
    event = "event"
    festival = "festival"
    maintenance = "maintenance"
    general = "general"


class MediaKind(str, PyEnum):
    image = "image"
    video = "video"


class ConversationKind(str, PyEnum):
    society = "society"
    direct = "direct"
    group = "group"


class ReminderAudience(str, PyEnum):
    all = "all"
    owner = "owner"
    rent = "rent"
    unpaid = "unpaid"


class NotificationKind(str, PyEnum):
    reminder = "reminder"
    broadcast = "broadcast"
    chat = "chat"
    maintenance = "maintenance"


class SocietyModule(str, PyEnum):
    shop = "shop"
    parking = "parking"
    visitor = "visitor"
    complaint = "complaint"
    event = "event"
    staff = "staff"
    security = "security"
    document = "document"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(20), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner_profile: Mapped["OwnerProfile | None"] = relationship(back_populates="user", uselist=False)
    tenant_profile: Mapped["Tenant | None"] = relationship(back_populates="user", uselist=False)


class Flat(Base):
    __tablename__ = "flats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    wing: Mapped[str] = mapped_column(String(10))
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    floor: Mapped[int] = mapped_column(Integer, default=0)
    area_sqft: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[FlatStatus] = mapped_column(Enum(FlatStatus), default=FlatStatus.vacant)
    layout: Mapped[str] = mapped_column(String(40), default="")
    intercom: Mapped[str] = mapped_column(String(20), default="")
    facing: Mapped[str] = mapped_column(String(80), default="")
    members: Mapped[int] = mapped_column(Integer, default=1)
    keys_at: Mapped[str] = mapped_column(String(80), default="")
    bike_slot: Mapped[str] = mapped_column(String(30), default="")
    bike_vehicle: Mapped[str] = mapped_column(String(30), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner_profile: Mapped["OwnerProfile | None"] = relationship(back_populates="flat", uselist=False)
    tenants: Mapped[list["Tenant"]] = relationship(back_populates="flat")
    charges: Mapped[list["MaintenanceCharge"]] = relationship(back_populates="flat")


class OwnerProfile(Base):
    __tablename__ = "owner_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), unique=True, nullable=True)
    flat_id: Mapped[int] = mapped_column(ForeignKey("flats.id"), unique=True)
    full_name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str] = mapped_column(String(20), default="")
    email: Mapped[str] = mapped_column(String(180), default="")
    alt_phone: Mapped[str] = mapped_column(String(20), default="")
    parking_slot: Mapped[str] = mapped_column(String(30), default="")
    vehicle_no: Mapped[str] = mapped_column(String(30), default="")
    vehicles: Mapped[str] = mapped_column(Text, default="[]")
    kyc: Mapped[str] = mapped_column(String(20), default="pending")
    move_in_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User | None] = relationship(back_populates="owner_profile")
    flat: Mapped[Flat] = relationship(back_populates="owner_profile")
    tenants: Mapped[list["Tenant"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("owner_profiles.id"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    flat_id: Mapped[int] = mapped_column(ForeignKey("flats.id"))
    full_name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str] = mapped_column(String(20), default="")
    email: Mapped[str] = mapped_column(String(180), default="")
    rent_amount: Mapped[float] = mapped_column(Float, default=0)
    deposit: Mapped[float] = mapped_column(Float, default=0)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    kyc: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner: Mapped[OwnerProfile] = relationship(back_populates="tenants")
    user: Mapped[User | None] = relationship(back_populates="tenant_profile")
    flat: Mapped[Flat] = relationship(back_populates="tenants")


class DailyUpdate(Base):
    __tablename__ = "daily_updates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    category: Mapped[UpdateCategory] = mapped_column(Enum(UpdateCategory), default=UpdateCategory.general)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    author: Mapped[User] = relationship()
    media: Mapped[list["UpdateMedia"]] = relationship(back_populates="update", cascade="all, delete-orphan")


class UpdateMedia(Base):
    __tablename__ = "update_media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    update_id: Mapped[int] = mapped_column(ForeignKey("daily_updates.id"), index=True)
    kind: Mapped[MediaKind] = mapped_column(Enum(MediaKind), default=MediaKind.image)
    path: Mapped[str] = mapped_column(String(400))
    caption: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    update: Mapped[DailyUpdate] = relationship(back_populates="media")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[ConversationKind] = mapped_column(Enum(ConversationKind), default=ConversationKind.society)
    title: Mapped[str] = mapped_column(String(150), default="Society chat")
    member_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    member: Mapped[User | None] = relationship(foreign_keys=[member_id])
    messages: Mapped[list["ChatMessage"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")
    members: Mapped[list["ConversationMember"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (UniqueConstraint("conversation_id", "user_id", name="uq_conversation_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    conversation: Mapped[Conversation] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class ChatRead(Base):
    __tablename__ = "chat_reads"
    __table_args__ = (UniqueConstraint("conversation_id", "user_id", name="uq_chat_read"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    last_read_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    sender: Mapped[User] = relationship()


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    audience: Mapped[ReminderAudience] = mapped_column(Enum(ReminderAudience), default=ReminderAudience.all)
    remind_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[NotificationKind] = mapped_column(Enum(NotificationKind), default=NotificationKind.reminder)
    link: Mapped[str] = mapped_column(String(200), default="")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship()


class Broadcast(Base):
    __tablename__ = "broadcasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    recipient_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MaintenanceCharge(Base):
    __tablename__ = "maintenance_charges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    flat_id: Mapped[int] = mapped_column(ForeignKey("flats.id"), index=True)
    month: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM
    amount: Mapped[float] = mapped_column(Float)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str] = mapped_column(String(255), default="Society maintenance")
    payment_method: Mapped[str] = mapped_column(String(40), default="")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    flat: Mapped[Flat] = relationship(back_populates="charges")
    payments: Mapped[list["MaintenancePayment"]] = relationship(back_populates="charge")
    slip: Mapped["MaintenanceSlip | None"] = relationship(back_populates="charge", uselist=False)


class MaintenancePayment(Base):
    __tablename__ = "maintenance_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    charge_id: Mapped[int] = mapped_column(ForeignKey("maintenance_charges.id"), index=True)
    paid_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    amount: Mapped[float] = mapped_column(Float)
    screenshot_path: Mapped[str] = mapped_column(String(400), default="")
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.pending)
    secretary_note: Mapped[str] = mapped_column(Text, default="")
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    charge: Mapped[MaintenanceCharge] = relationship(back_populates="payments")
    payer: Mapped[User] = relationship(foreign_keys=[paid_by_user_id])
    slip: Mapped["MaintenanceSlip | None"] = relationship(back_populates="payment", uselist=False)


class MaintenanceSlip(Base):
    __tablename__ = "maintenance_slips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slip_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("maintenance_payments.id"), unique=True)
    charge_id: Mapped[int] = mapped_column(ForeignKey("maintenance_charges.id"), unique=True)
    flat_id: Mapped[int] = mapped_column(ForeignKey("flats.id"))
    month: Mapped[str] = mapped_column(String(7))
    amount: Mapped[float] = mapped_column(Float)
    pdf_path: Mapped[str] = mapped_column(String(400), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    payment: Mapped[MaintenancePayment] = relationship(back_populates="slip")
    charge: Mapped[MaintenanceCharge] = relationship(back_populates="slip")
    flat: Mapped[Flat] = relationship()


class SocietyRecord(Base):
    __tablename__ = "society_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    module: Mapped[SocietyModule] = mapped_column(Enum(SocietyModule), index=True)
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(20), default="")
    status: Mapped[str] = mapped_column(String(40), default="active")
    category: Mapped[str] = mapped_column(String(80), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    meta: Mapped[str] = mapped_column(Text, default="{}")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator: Mapped[User] = relationship()


class SocietyPayment(Base):
    __tablename__ = "society_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), default="")
    bank_name: Mapped[str] = mapped_column(String(120), default="")
    account_name: Mapped[str] = mapped_column(String(120), default="")
    account_number: Mapped[str] = mapped_column(String(40), default="")
    ifsc: Mapped[str] = mapped_column(String(20), default="")
    upi_id: Mapped[str] = mapped_column(String(80), default="")
    qr_path: Mapped[str] = mapped_column(String(200), default="")


class DueNoticeRun(Base):
    __tablename__ = "due_notice_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    month: Mapped[str] = mapped_column(String(7), unique=True, index=True)
    sent: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
