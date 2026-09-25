from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.config import MEDIA_DIR
from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import DailyUpdate, MediaKind, NotificationKind, Role, UpdateMedia, User
from app.notify import member_users, notify_users
from app.schemas import MediaOut, UpdateIn, UpdateOut

router = APIRouter(prefix="/api/updates", tags=["updates"])

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
VIDEO_EXT = {".mp4", ".webm", ".mov"}


def media_out(item: UpdateMedia) -> MediaOut:
    return MediaOut(id=item.id, kind=item.kind, path=f"media/{Path(item.path).name}", caption=item.caption)


def to_out(item: DailyUpdate) -> UpdateOut:
    return UpdateOut(
        id=item.id,
        title=item.title,
        body=item.body,
        category=item.category,
        author_id=item.author_id,
        author_name=item.author.name if item.author else "",
        is_pinned=item.is_pinned,
        is_published=bool(item.is_published),
        created_at=item.created_at,
        media=[media_out(media) for media in (item.media or [])],
    )


def _query(db: Session):
    return db.query(DailyUpdate).options(joinedload(DailyUpdate.author), joinedload(DailyUpdate.media))


@router.get("", response_model=list[UpdateOut])
def list_updates(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = _query(db)
    if user.role != Role.secretary:
        query = query.filter(DailyUpdate.is_published == True)
    items = query.order_by(DailyUpdate.is_pinned.desc(), DailyUpdate.created_at.desc()).all()
    return [to_out(item) for item in items]


@router.post("", response_model=UpdateOut)
def create_update(
    payload: UpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary)),
):
    data = payload.model_dump()
    data["is_published"] = False
    item = DailyUpdate(**data, author_id=user.id)
    db.add(item)
    db.commit()
    return to_out(_query(db).filter(DailyUpdate.id == item.id).first())


@router.put("/{update_id}", response_model=UpdateOut)
def update_update(
    update_id: int,
    payload: UpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    item = db.get(DailyUpdate, update_id)
    if not item:
        raise HTTPException(status_code=404, detail="Update not found")
    data = payload.model_dump()
    data.pop("is_published", None)
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    return to_out(_query(db).filter(DailyUpdate.id == item.id).first())


@router.post("/{update_id}/publish", response_model=UpdateOut)
def publish_update(
    update_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    item = db.get(DailyUpdate, update_id)
    if not item:
        raise HTTPException(status_code=404, detail="Update not found")
    was_live = bool(item.is_published)
    item.is_published = True
    if not was_live:
        notify_users(
            db,
            member_users(db),
            item.title,
            item.body[:280],
            NotificationKind.broadcast,
            "/app/notices",
        )
    db.commit()
    return to_out(_query(db).filter(DailyUpdate.id == item.id).first())


@router.post("/{update_id}/unpublish", response_model=UpdateOut)
def unpublish_update(
    update_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    item = db.get(DailyUpdate, update_id)
    if not item:
        raise HTTPException(status_code=404, detail="Update not found")
    item.is_published = False
    db.commit()
    return to_out(_query(db).filter(DailyUpdate.id == item.id).first())


@router.delete("/{update_id}")
def delete_update(
    update_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    item = _query(db).filter(DailyUpdate.id == update_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Update not found")
    for media in item.media:
        path = MEDIA_DIR / Path(media.path).name
        if path.exists():
            path.unlink()
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/{update_id}/media", response_model=UpdateOut)
async def upload_media(
    update_id: int,
    files: list[UploadFile] = File(...),
    caption: str = Form(""),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    item = db.get(DailyUpdate, update_id)
    if not item:
        raise HTTPException(status_code=404, detail="Update not found")
    for upload in files:
        suffix = Path(upload.filename or "").suffix.lower()
        if suffix in IMAGE_EXT:
            kind = MediaKind.image
        elif suffix in VIDEO_EXT:
            kind = MediaKind.video
        else:
            raise HTTPException(status_code=400, detail="Upload an image (jpg, png, webp) or video (mp4, webm, mov)")
        name = f"{uuid4().hex}{suffix}"
        dest = MEDIA_DIR / name
        content = await upload.read()
        if kind == MediaKind.image and len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image must be under 10 MB")
        if kind == MediaKind.video and len(content) > 60 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Video must be under 60 MB")
        dest.write_bytes(content)
        db.add(UpdateMedia(update_id=item.id, kind=kind, path=str(dest), caption=caption))
    db.commit()
    return to_out(_query(db).filter(DailyUpdate.id == item.id).first())


@router.delete("/media/{media_id}")
def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    media = db.get(UpdateMedia, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    path = MEDIA_DIR / Path(media.path).name
    if path.exists():
        path.unlink()
    db.delete(media)
    db.commit()
    return {"ok": True}
