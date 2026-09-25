from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session, joinedload

from app.auth import decode_token, token_error
from app.database import get_db
from app.models import OwnerProfile, Role, Tenant, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Please login again",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        email = payload.get("sub")
        if not email:
            raise credentials_error
    except token_error():
        raise credentials_error
    user = (
        db.query(User)
        .options(
            joinedload(User.owner_profile).joinedload(OwnerProfile.flat),
            joinedload(User.tenant_profile).joinedload(Tenant.flat),
        )
        .filter(User.email == email)
        .first()
    )
    if not user or not user.is_active:
        raise credentials_error
    return user


def require_roles(*roles: Role):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access")
        return user

    return checker
