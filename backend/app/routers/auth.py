from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import create_access_token, hash_password, verify_password
from app.database import get_db
from app.deps import get_current_user
from app.models import Role, User
from app.schemas import LoginIn, ProfileUpdate, TokenOut, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is inactive")
    panel = "admin" if user.role == Role.secretary else "user"
    token = create_access_token(user.email, user.role.value, user.name)
    return TokenOut(access_token=token, role=user.role, name=user.name, panel=panel, user_id=user.id)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.put("/profile", response_model=UserOut)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    new_password = data.pop("new_password", None)
    current_password = data.pop("current_password", None)

    if new_password:
        if not current_password or not verify_password(current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        user.password_hash = hash_password(new_password)

    if "name" in data and data["name"]:
        user.name = data["name"].strip()
    if "phone" in data:
        user.phone = data["phone"] or ""

    db.commit()
    db.refresh(user)
    return user
