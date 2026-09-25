from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import decode_token, token_error
from app.config import DOCUMENT_DIR, MEDIA_DIR, PAYMENT_DIR, SLIP_DIR, SOCIETY_DIR
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/files", tags=["files"])


def require_token_user(token: str | None, db: Session) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Login required")
    try:
        email = decode_token(token).get("sub")
    except token_error():
        raise HTTPException(status_code=401, detail="Login required")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    return user


@router.get("/payments/{name}")
def payment_file(name: str, token: str | None = Query(default=None), db: Session = Depends(get_db)):
    require_token_user(token, db)
    path = PAYMENT_DIR / name
    if not path.exists() or ".." in name:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@router.get("/media/{name}")
def media_file(name: str, token: str | None = Query(default=None), db: Session = Depends(get_db)):
    require_token_user(token, db)
    path = MEDIA_DIR / name
    if not path.exists() or ".." in name:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@router.get("/documents/{name}")
def document_file(name: str, token: str | None = Query(default=None), db: Session = Depends(get_db)):
    require_token_user(token, db)
    path = DOCUMENT_DIR / name
    if not path.exists() or ".." in name:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=name, content_disposition_type="inline")


@router.get("/slips/{name}")
def slip_file(name: str):
    path = SLIP_DIR / name
    if not path.exists() or ".." in name:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="application/pdf", filename=name, content_disposition_type="inline")


@router.get("/qr")
def society_qr():
    folder = SOCIETY_DIR
    matches = list(folder.glob("qr.*")) if folder.exists() else []
    if not matches:
        raise HTTPException(status_code=404, detail="QR code not uploaded")
    path = matches[0]
    return FileResponse(path, filename=path.name, content_disposition_type="inline")
