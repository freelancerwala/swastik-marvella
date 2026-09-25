from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import hash_password
from app.database import get_db
from app.deps import require_roles
from app.helpers import dues_by_flat
from app.models import OwnerProfile, Role, Tenant, User
from app.schemas import KycIn, ResidentDirectoryRow, UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    role: Role | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    query = db.query(User).order_by(User.id.desc())
    if role:
        query = query.filter(User.role == role)
    return query.all()


@router.get("/directory", response_model=list[ResidentDirectoryRow])
def residents_directory(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    dues = dues_by_flat(db)
    owners = db.query(OwnerProfile).options(joinedload(OwnerProfile.flat), joinedload(OwnerProfile.user)).all()
    tenants = (
        db.query(Tenant)
        .options(joinedload(Tenant.flat), joinedload(Tenant.user), joinedload(Tenant.owner))
        .all()
    )
    household = Counter()
    for owner in owners:
        household[owner.flat_id] += 1
    for tenant in tenants:
        if tenant.is_active:
            household[tenant.flat_id] += 1
    used_users = {owner.user_id for owner in owners} | {tenant.user_id for tenant in tenants if tenant.user_id}
    rows: list[ResidentDirectoryRow] = []

    def committee_flag(notes: str, login: User | None) -> bool:
        role = login.role.value if login else ""
        blob = f"{notes} {role}".lower()
        return "committee" in blob or "secretary" in blob

    for owner in owners:
        flat = owner.flat
        money = dues.get(owner.flat_id, {"dues": 0.0})
        login = owner.user
        rows.append(
            ResidentDirectoryRow(
                kind="owner",
                id=owner.id,
                name=owner.full_name,
                email=owner.email or (login.email if login else ""),
                phone=owner.phone,
                role="owner",
                flat=flat.number if flat else "",
                wing=flat.wing if flat else "",
                floor=flat.floor if flat else 0,
                parking=owner.parking_slot,
                vehicle=owner.vehicle_no,
                vehicles=owner.vehicles or "[]",
                dues=money["dues"],
                billed=int(money.get("billed") or 0),
                kyc=owner.kyc or "pending",
                user_id=owner.user_id,
                is_active=bool(login.is_active) if login else True,
                notes=owner.notes or "",
                members=max(household.get(owner.flat_id, 1), 1),
                created_at=owner.created_at,
                committee=committee_flag(owner.notes or "", login),
            )
        )
    for tenant in tenants:
        flat = tenant.flat
        owner = tenant.owner
        money = dues.get(tenant.flat_id, {"dues": 0.0})
        login = tenant.user
        rows.append(
            ResidentDirectoryRow(
                kind="tenant",
                id=tenant.id,
                name=tenant.full_name,
                email=tenant.email or (login.email if login else ""),
                phone=tenant.phone,
                role="rent",
                flat=flat.number if flat else "",
                wing=flat.wing if flat else "",
                floor=flat.floor if flat else 0,
                parking=owner.parking_slot if owner else "",
                vehicle=owner.vehicle_no if owner else "",
                dues=money["dues"],
                billed=int(money.get("billed") or 0),
                kyc=tenant.kyc or "pending",
                user_id=tenant.user_id,
                is_active=tenant.is_active,
                notes=tenant.notes or "",
                members=max(household.get(tenant.flat_id, 1), 1),
                owner_name=owner.full_name if owner else "",
                owner_id=tenant.owner_id,
                start_date=tenant.start_date,
                end_date=tenant.end_date,
                created_at=tenant.created_at,
                committee=committee_flag(tenant.notes or "", login),
            )
        )
    logins = db.query(User).order_by(User.id.desc()).all()
    for login in logins:
        if login.id in used_users:
            continue
        rows.append(
            ResidentDirectoryRow(
                kind="login",
                id=login.id,
                name=login.name,
                email=login.email,
                phone=login.phone,
                role=login.role.value,
                kyc="verified" if login.is_active else "pending",
                user_id=login.id,
                is_active=login.is_active,
                created_at=login.created_at,
                committee=login.role == Role.secretary,
            )
        )
    return rows


@router.post("", response_model=UserOut)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    user = User(
        name=payload.name,
        email=str(payload.email).lower(),
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    data = payload.model_dump(exclude_unset=True)
    if "password" in data:
        password = data.pop("password")
        if password:
            user.password_hash = hash_password(password)
    if "email" in data and data["email"] != user.email:
        if db.query(User).filter(User.email == data["email"], User.id != user.id).first():
            raise HTTPException(status_code=400, detail="Email already exists")
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.put("/directory/{kind}/{record_id}/kyc")
def set_kyc(
    kind: str,
    record_id: int,
    payload: KycIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.secretary)),
):
    status = payload.kyc if payload.kyc in {"verified", "pending"} else ""
    if not status:
        raise HTTPException(status_code=400, detail="KYC must be verified or pending")
    if kind == "owner":
        row = db.get(OwnerProfile, record_id)
    elif kind == "tenant":
        row = db.get(Tenant, record_id)
    else:
        raise HTTPException(status_code=404, detail="Resident not found")
    if not row:
        raise HTTPException(status_code=404, detail="Resident not found")
    row.kyc = status
    db.commit()
    return {"ok": True, "kyc": status}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(Role.secretary)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own login")
    db.delete(user)
    db.commit()
    return {"ok": True}
