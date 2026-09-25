from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def ensure_schema():
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    with engine.begin() as conn:
        if "daily_updates" in tables:
            cols = {column["name"] for column in inspector.get_columns("daily_updates")}
            if "is_published" not in cols:
                conn.execute(text("ALTER TABLE daily_updates ADD COLUMN is_published BOOLEAN DEFAULT 0"))
                conn.execute(text("UPDATE daily_updates SET is_published = 1"))
        if "flats" in tables:
            cols = {column["name"] for column in inspector.get_columns("flats")}
            if "layout" not in cols:
                conn.execute(text("ALTER TABLE flats ADD COLUMN layout VARCHAR(40) DEFAULT ''"))
            if "intercom" not in cols:
                conn.execute(text("ALTER TABLE flats ADD COLUMN intercom VARCHAR(20) DEFAULT ''"))
            if "facing" not in cols:
                conn.execute(text("ALTER TABLE flats ADD COLUMN facing VARCHAR(80) DEFAULT ''"))
            if "members" not in cols:
                conn.execute(text("ALTER TABLE flats ADD COLUMN members INTEGER DEFAULT 1"))
            if "keys_at" not in cols:
                conn.execute(text("ALTER TABLE flats ADD COLUMN keys_at VARCHAR(80) DEFAULT ''"))
            if "bike_slot" not in cols:
                conn.execute(text("ALTER TABLE flats ADD COLUMN bike_slot VARCHAR(30) DEFAULT ''"))
            if "bike_vehicle" not in cols:
                conn.execute(text("ALTER TABLE flats ADD COLUMN bike_vehicle VARCHAR(30) DEFAULT ''"))
        if "owner_profiles" in tables:
            cols = {column["name"] for column in inspector.get_columns("owner_profiles")}
            if "vehicles" not in cols:
                conn.execute(text("ALTER TABLE owner_profiles ADD COLUMN vehicles TEXT DEFAULT '[]'"))
            if "kyc" not in cols:
                conn.execute(text("ALTER TABLE owner_profiles ADD COLUMN kyc VARCHAR(20) DEFAULT 'pending'"))
        if "tenants" in tables:
            cols = {column["name"] for column in inspector.get_columns("tenants")}
            if "kyc" not in cols:
                conn.execute(text("ALTER TABLE tenants ADD COLUMN kyc VARCHAR(20) DEFAULT 'pending'"))
        if "society_records" in tables:
            cols = {column["name"] for column in inspector.get_columns("society_records")}
            if "category" not in cols:
                conn.execute(text("ALTER TABLE society_records ADD COLUMN category VARCHAR(80) DEFAULT ''"))
            if "meta" not in cols:
                conn.execute(text("ALTER TABLE society_records ADD COLUMN meta TEXT DEFAULT '{}'"))
                conn.execute(text("UPDATE society_records SET meta = '{}' WHERE meta IS NULL"))
        if "maintenance_charges" in tables:
            cols = {column["name"] for column in inspector.get_columns("maintenance_charges")}
            if "payment_method" not in cols:
                conn.execute(text("ALTER TABLE maintenance_charges ADD COLUMN payment_method VARCHAR(40) DEFAULT ''"))


def allow_owner_without_login():
    """Secretary can save an owner name without creating an email login."""
    inspector = inspect(engine)
    if "owner_profiles" not in inspector.get_table_names():
        return
    user_col = next((column for column in inspector.get_columns("owner_profiles") if column["name"] == "user_id"), None)
    if not user_col or user_col.get("nullable"):
        return
    raw = engine.raw_connection()
    try:
        cursor = raw.cursor()
        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.execute(
            """
            CREATE TABLE owner_profiles__new (
                id INTEGER PRIMARY KEY,
                user_id INTEGER UNIQUE,
                flat_id INTEGER NOT NULL UNIQUE,
                full_name VARCHAR(150) NOT NULL,
                phone VARCHAR(20) DEFAULT '',
                email VARCHAR(180) DEFAULT '',
                alt_phone VARCHAR(20) DEFAULT '',
                parking_slot VARCHAR(30) DEFAULT '',
                vehicle_no VARCHAR(30) DEFAULT '',
                move_in_date DATE,
                notes TEXT DEFAULT '',
                created_at DATETIME,
                updated_at DATETIME,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(flat_id) REFERENCES flats(id)
            )
            """
        )
        cursor.execute(
            """
            INSERT INTO owner_profiles__new (
                id, user_id, flat_id, full_name, phone, email, alt_phone,
                parking_slot, vehicle_no, move_in_date, notes, created_at, updated_at
            )
            SELECT id, user_id, flat_id, full_name, phone, email, alt_phone,
                   parking_slot, vehicle_no, move_in_date, notes, created_at, updated_at
            FROM owner_profiles
            """
        )
        cursor.execute("DROP TABLE owner_profiles")
        cursor.execute("ALTER TABLE owner_profiles__new RENAME TO owner_profiles")
        cursor.execute("PRAGMA foreign_keys=ON")
        raw.commit()
    finally:
        raw.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
