from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, SessionLocal, engine, allow_owner_without_login, ensure_schema
from app.routers import auth, broadcasts, chat, dashboard, files, flats, maintenance, notifications, owners, slips, society, tenants, updates, users
from app.seed import ensure_default_dues, ensure_parking, ensure_tower, seed_if_empty, should_reset_demo

Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    reset_demo = should_reset_demo(db)
if reset_demo:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    seed_if_empty(db)
ensure_schema()
allow_owner_without_login()
with SessionLocal() as db:
    ensure_tower(db)
    ensure_parking(db)
    ensure_default_dues(db)

app = FastAPI(title=f"{settings.society_name} · {settings.app_name}", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    users.router,
    flats.router,
    owners.router,
    tenants.router,
    updates.router,
    maintenance.router,
    slips.router,
    dashboard.router,
    files.router,
    broadcasts.router,
    chat.router,
    notifications.router,
    society.router,
):
    app.include_router(router)


@app.get("/api/health")
def health():
    return {"ok": True, "society": settings.society_name, "app": settings.app_name}
