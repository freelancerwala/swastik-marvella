from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import require_roles
from app.models import Broadcast, Conversation, ConversationKind, ChatMessage, NotificationKind, Role, User
from app.notify import member_contacts, member_users, notify_users
from app.schemas import BroadcastIn, BroadcastOut, MemberContact
from app.services.whatsapp import send_text, wa_me_url

router = APIRouter(prefix="/api/broadcasts", tags=["broadcasts"])


def _society_chat(db: Session) -> Conversation:
    chat = db.query(Conversation).filter(Conversation.kind == ConversationKind.society).first()
    if not chat:
        chat = Conversation(kind=ConversationKind.society, title=f"{settings.society_name} society chat")
        db.add(chat)
        db.flush()
    return chat


@router.get("/members", response_model=list[MemberContact])
def list_members(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    return [MemberContact(**row) for row in member_contacts(db)]


@router.get("", response_model=list[BroadcastOut])
def list_broadcasts(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    items = db.query(Broadcast).order_by(Broadcast.created_at.desc()).limit(20).all()
    return [
        BroadcastOut(
            id=item.id,
            message=item.message,
            recipient_count=item.recipient_count,
            group_share_url=wa_me_url("", item.message),
            created_at=item.created_at,
            members=[],
        )
        for item in items
    ]


@router.post("", response_model=BroadcastOut)
def create_broadcast(
    payload: BroadcastIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary)),
):
    message = payload.message.strip()
    contacts = member_contacts(db, message)
    users = member_users(db)
    notify_users(db, users, f"{settings.society_name} notice", message, NotificationKind.broadcast, "/app/chat")
    chat = _society_chat(db)
    db.add(ChatMessage(conversation_id=chat.id, sender_id=user.id, body=message))
    cloud_sent = 0
    cloud_mode = "share_link"
    if payload.send_cloud:
        for contact in contacts:
            result = send_text(contact["phone"], message)
            cloud_mode = result.get("mode", cloud_mode)
            if result.get("sent"):
                cloud_sent += 1
    item = Broadcast(message=message, author_id=user.id, recipient_count=len(contacts))
    db.add(item)
    db.commit()
    db.refresh(item)
    return BroadcastOut(
        id=item.id,
        message=item.message,
        recipient_count=item.recipient_count,
        group_share_url=wa_me_url("", message),
        cloud_sent=cloud_sent,
        cloud_mode=cloud_mode,
        members=[MemberContact(**row) for row in contacts],
        created_at=item.created_at,
    )


@router.delete("/{broadcast_id}")
def delete_broadcast(
    broadcast_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    item = db.get(Broadcast, broadcast_id)
    if not item:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    db.delete(item)
    db.commit()
    return {"ok": True}
