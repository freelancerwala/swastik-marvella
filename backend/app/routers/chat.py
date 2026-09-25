from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import (
    ChatMessage,
    ChatRead,
    Conversation,
    ConversationKind,
    ConversationMember,
    Notification,
    NotificationKind,
    Role,
    User,
)
from app.schemas import ChatMessageIn, ChatMessageOut, ChatPerson, ConversationOut, GroupCreateIn

router = APIRouter(prefix="/api/chat", tags=["chat"])


def society_chat(db: Session) -> Conversation:
    chat = db.query(Conversation).filter(Conversation.kind == ConversationKind.society).first()
    if not chat:
        chat = Conversation(kind=ConversationKind.society, title=f"{settings.society_name} society")
        db.add(chat)
        db.commit()
        db.refresh(chat)
    return chat


def direct_chat(db: Session, member_id: int) -> Conversation:
    chat = (
        db.query(Conversation)
        .filter(Conversation.kind == ConversationKind.direct, Conversation.member_id == member_id)
        .first()
    )
    if not chat:
        member = db.get(User, member_id)
        chat = Conversation(
            kind=ConversationKind.direct,
            title=f"{member.name if member else 'Member'} · secretary",
            member_id=member_id,
        )
        db.add(chat)
        db.commit()
        db.refresh(chat)
    return chat


def can_access(db: Session, user: User, conversation: Conversation) -> bool:
    if conversation.kind == ConversationKind.society:
        return True
    if conversation.kind == ConversationKind.direct:
        return user.role == Role.secretary or conversation.member_id == user.id
    if user.role == Role.secretary:
        return True
    return (
        db.query(ConversationMember)
        .filter(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == user.id)
        .first()
        is not None
    )


def conversation_users(db: Session, conversation: Conversation) -> list[User]:
    if conversation.kind == ConversationKind.society:
        return db.query(User).filter(User.is_active.is_(True)).all()
    if conversation.kind == ConversationKind.direct:
        users = []
        if conversation.member_id:
            member = db.get(User, conversation.member_id)
            if member:
                users.append(member)
        users.extend(db.query(User).filter(User.role == Role.secretary, User.is_active.is_(True)).all())
        seen = set()
        unique = []
        for item in users:
            if item.id not in seen:
                seen.add(item.id)
                unique.append(item)
        return unique
    rows = (
        db.query(ConversationMember)
        .options(joinedload(ConversationMember.user))
        .filter(ConversationMember.conversation_id == conversation.id)
        .all()
    )
    return [row.user for row in rows if row.user]


def unread_count(db: Session, user_id: int, conversation_id: int) -> int:
    seen = (
        db.query(ChatRead)
        .filter(ChatRead.conversation_id == conversation_id, ChatRead.user_id == user_id)
        .first()
    )
    query = db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation_id,
        ChatMessage.sender_id != user_id,
    )
    if seen:
        query = query.filter(ChatMessage.created_at > seen.last_read_at)
    return query.count()


def mark_read(db: Session, user_id: int, conversation_id: int) -> None:
    row = (
        db.query(ChatRead)
        .filter(ChatRead.conversation_id == conversation_id, ChatRead.user_id == user_id)
        .first()
    )
    if row:
        row.last_read_at = datetime.utcnow()
    else:
        db.add(ChatRead(conversation_id=conversation_id, user_id=user_id, last_read_at=datetime.utcnow()))


def message_out(item: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=item.id,
        conversation_id=item.conversation_id,
        sender_id=item.sender_id,
        sender_name=item.sender.name if item.sender else "",
        body=item.body,
        created_at=item.created_at,
    )


def last_preview(db: Session, conversation_id: int) -> tuple[str, object | None]:
    last = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation_id)
        .order_by(desc(ChatMessage.created_at))
        .first()
    )
    if not last:
        return "", None
    return last.body, last.created_at


def to_out(db: Session, item: Conversation, user: User) -> ConversationOut:
    preview, when = last_preview(db, item.id)
    people = conversation_users(db, item)
    return ConversationOut(
        id=item.id,
        kind=item.kind,
        title=item.title,
        member_id=item.member_id,
        last_message=preview,
        last_at=when,
        unread=unread_count(db, user.id, item.id),
        member_count=len(people),
    )


@router.get("/directory", response_model=list[ChatPerson])
def directory(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    users = db.query(User).filter(User.is_active.is_(True)).order_by(User.name).all()
    return [ChatPerson(id=user.id, name=user.name, role=user.role) for user in users]


@router.get("/unread-count")
def total_unread(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = visible_conversations(db, user)
    return {"count": sum(unread_count(db, user.id, item.id) for item in items)}


def visible_conversations(db: Session, user: User) -> list[Conversation]:
    items = [society_chat(db)]
    if user.role == Role.secretary:
        members = db.query(User).filter(User.is_active.is_(True), User.role.in_([Role.owner, Role.rent])).all()
        for member in members:
            items.append(direct_chat(db, member.id))
        items.extend(db.query(Conversation).filter(Conversation.kind == ConversationKind.group).all())
    else:
        items.append(direct_chat(db, user.id))
        group_ids = [
            row.conversation_id
            for row in db.query(ConversationMember).filter(ConversationMember.user_id == user.id).all()
        ]
        if group_ids:
            items.extend(db.query(Conversation).filter(Conversation.id.in_(group_ids), Conversation.kind == ConversationKind.group).all())
    return items


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [to_out(db, item, user) for item in visible_conversations(db, user)]


@router.post("/groups", response_model=ConversationOut)
def create_group(
    payload: GroupCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    title = payload.title.strip()
    if len(title) < 2:
        raise HTTPException(status_code=400, detail="Enter a group name")
    ids = set(payload.member_ids)
    ids.add(user.id)
    if user.role != Role.secretary:
        secretary = db.query(User).filter(User.role == Role.secretary, User.is_active.is_(True)).first()
        if secretary:
            ids.add(secretary.id)
    people = db.query(User).filter(User.id.in_(ids), User.is_active.is_(True)).all()
    if len(people) < 2:
        raise HTTPException(status_code=400, detail="Select at least one other member")
    chat = Conversation(kind=ConversationKind.group, title=title)
    db.add(chat)
    db.flush()
    for person in people:
        db.add(ConversationMember(conversation_id=chat.id, user_id=person.id))
    db.add(ChatMessage(conversation_id=chat.id, sender_id=user.id, body=f"{user.name} created group “{title}”."))
    for person in people:
        if person.id == user.id:
            continue
        link = "/admin/chat" if person.role == Role.secretary else "/app/chat"
        db.add(
            Notification(
                user_id=person.id,
                title=f"Added to {title}",
                body=f"{user.name} created a chat group and added you.",
                kind=NotificationKind.chat,
                link=f"{link}?c={chat.id}",
            )
        )
    db.commit()
    db.refresh(chat)
    return to_out(db, chat, user)


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageOut])
def list_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = db.get(Conversation, conversation_id)
    if not conversation or not can_access(db, user, conversation):
        raise HTTPException(status_code=404, detail="Chat not found")
    items = (
        db.query(ChatMessage)
        .options(joinedload(ChatMessage.sender))
        .filter(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    mark_read(db, user.id, conversation_id)
    db.commit()
    return [message_out(item) for item in items]


@router.post("/conversations/{conversation_id}/messages", response_model=ChatMessageOut)
def send_message(
    conversation_id: int,
    payload: ChatMessageIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = db.get(Conversation, conversation_id)
    if not conversation or not can_access(db, user, conversation):
        raise HTTPException(status_code=404, detail="Chat not found")
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    item = ChatMessage(conversation_id=conversation.id, sender_id=user.id, body=body)
    db.add(item)
    db.flush()
    for person in conversation_users(db, conversation):
        if person.id == user.id:
            continue
        link = "/admin/chat" if person.role == Role.secretary else "/app/chat"
        db.add(
            Notification(
                user_id=person.id,
                title=f"{conversation.title}",
                body=f"{user.name}: {body[:140]}",
                kind=NotificationKind.chat,
                link=f"{link}?c={conversation.id}",
            )
        )
    mark_read(db, user.id, conversation.id)
    db.commit()
    item = db.query(ChatMessage).options(joinedload(ChatMessage.sender)).filter(ChatMessage.id == item.id).first()
    return message_out(item)


@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(ChatMessage, message_id)
    if not item:
        raise HTTPException(status_code=404, detail="Message not found")
    conversation = db.get(Conversation, item.conversation_id)
    if not conversation or not can_access(db, user, conversation):
        raise HTTPException(status_code=404, detail="Chat not found")
    if user.role != Role.secretary and item.sender_id != user.id:
        raise HTTPException(status_code=403, detail="You can delete only your message")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary)),
):
    conversation = db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Chat not found")
    if conversation.kind != ConversationKind.group:
        raise HTTPException(status_code=400, detail="Only group chats can be removed")
    db.query(ChatRead).filter(ChatRead.conversation_id == conversation.id).delete()
    db.query(ChatMessage).filter(ChatMessage.conversation_id == conversation.id).delete()
    db.query(ConversationMember).filter(ConversationMember.conversation_id == conversation.id).delete()
    db.delete(conversation)
    db.commit()
    return {"ok": True}
