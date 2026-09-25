from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parent.parent
BRAND_DIR = ROOT_DIR.parent / "branding"


class Settings(BaseSettings):
    app_name: str = "SM Living"
    society_name: str = "Swastik Marvella"
    secret_key: str = "swastik-marvella-smliving-dev-secret-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    database_url: str = "sqlite:///./smliving.db"
    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    data_dir: str = str(ROOT_DIR)
    secretary_name: str = "Society Secretary"
    secretary_email: str = "secretary@swastikmarvella.in"
    secretary_password: str = "Secretary@123"
    secretary_phone: str = ""
    cors_origins: str = ""
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_default_country_code: str = "91"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def allowed_origins(self) -> list[str]:
        raw = [item.strip().rstrip("/") for item in self.cors_origins.split(",") if item.strip()]
        origins = raw or []
        frontend = self.frontend_url.strip().rstrip("/")
        if frontend and frontend not in origins:
            origins.append(frontend)
        for extra in (
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ):
            if extra not in origins:
                origins.append(extra)
        return origins


settings = Settings()
DATA_DIR = Path(settings.data_dir)
UPLOAD_DIR = DATA_DIR / "uploads"
PAYMENT_DIR = UPLOAD_DIR / "payments"
SLIP_DIR = UPLOAD_DIR / "slips"
MEDIA_DIR = UPLOAD_DIR / "media"
DOCUMENT_DIR = UPLOAD_DIR / "documents"
SOCIETY_DIR = UPLOAD_DIR / "society"
PAYMENT_DIR.mkdir(parents=True, exist_ok=True)
SLIP_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
DOCUMENT_DIR.mkdir(parents=True, exist_ok=True)
SOCIETY_DIR.mkdir(parents=True, exist_ok=True)
