from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.helpers import owner_for_user
from app.models import Flat, FlatStatus, OwnerProfile, Role, Tenant, User
from app.schemas import TenantIn, TenantOut

router = APIRouter(prefix="/api/tenants", tags=["tenants"])


def _load(db: Session, tenant_id: int) -> Tenant | None:
    return db.query(Tenant).options(joinedload(Tenant.flat)).filter(Tenant.id == tenant_id).first()


@router.get("", response_model=list[TenantOut])
def list_tenants(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Tenant).options(joinedload(Tenant.flat))
    if user.role == Role.owner:
        owner = owner_for_user(db, user)
        query = query.filter(Tenant.owner_id == owner.id)
    elif user.role == Role.rent:
        query = query.filter(Tenant.user_id == user.id)
    return query.order_by(Tenant.id.desc()).all()


@router.post("", response_model=TenantOut)
def create_tenant(
    payload: TenantIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == Role.rent:
        raise HTTPException(status_code=403, detail="Tenant cannot create rent records")
    if user.role == Role.owner:
        owner = owner_for_user(db, user)
        owner_id = owner.id
        flat_id = owner.flat_id
    else:
        owner_id = payload.owner_id
        if not owner_id:
            raise HTTPException(status_code=400, detail="Select an owner")
        owner = db.get(OwnerProfile, owner_id)
        if not owner:
            raise HTTPException(status_code=404, detail="Owner not found")
        flat_id = payload.flat_id or owner.flat_id
    if payload.user_id:
        rent_user = db.get(User, payload.user_id)
        if not rent_user or rent_user.role != Role.rent:
            raise HTTPException(status_code=400, detail="Linked login must be a rent role")
        if db.query(Tenant).filter(Tenant.user_id == payload.user_id).first():
            raise HTTPException(status_code=400, detail="This rent login is already linked")
    tenant = Tenant(
        owner_id=owner_id,
        user_id=payload.user_id,
        flat_id=flat_id,
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        rent_amount=payload.rent_amount,
        deposit=payload.deposit,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_active=payload.is_active,
        notes=payload.notes,
    )
    flat = db.get(Flat, flat_id)
    if flat:
        flat.status = FlatStatus.occupied_rent
    db.add(tenant)
    db.commit()
    return _load(db, tenant.id)


@router.put("/{tenant_id}", response_model=TenantOut)
def update_tenant(
    tenant_id: int,
    payload: TenantIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Rent record not found")
    if user.role == Role.owner:
        owner = owner_for_user(db, user)
        if tenant.owner_id != owner.id:
            raise HTTPException(status_code=403, detail="You can edit only your rent records")
    elif user.role != Role.secretary:
        raise HTTPException(status_code=403, detail="Not allowed")
    tenant.full_name = payload.full_name
    tenant.phone = payload.phone
    tenant.email = payload.email
    tenant.rent_amount = payload.rent_amount
    tenant.deposit = payload.deposit
    tenant.start_date = payload.start_date
    tenant.end_date = payload.end_date
    tenant.is_active = payload.is_active
    tenant.notes = payload.notes
    if user.role == Role.secretary:
        if payload.user_id:
            tenant.user_id = payload.user_id
        if payload.flat_id:
            tenant.flat_id = payload.flat_id
        if payload.owner_id:
            tenant.owner_id = payload.owner_id
    db.commit()
    return _load(db, tenant.id)


@router.delete("/{tenant_id}")
def delete_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.secretary, Role.owner)),
):
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Rent record not found")
    if user.role == Role.owner:
        owner = owner_for_user(db, user)
        if tenant.owner_id != owner.id:
            raise HTTPException(status_code=403, detail="You can delete only your rent records")
    db.delete(tenant)
    db.commit()
    return {"ok": True}
