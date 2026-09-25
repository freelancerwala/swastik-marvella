from urllib.parse import quote

import httpx

from app.config import settings
from app.models import Flat, MaintenanceSlip


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if digits.startswith("0"):
        digits = digits.lstrip("0")
    if len(digits) == 10:
        digits = f"{settings.whatsapp_default_country_code}{digits}"
    return digits


def slip_message(slip: MaintenanceSlip, flat: Flat, pdf_url: str) -> str:
    return (
        f"*{settings.society_name} — {settings.app_name}*\n"
        f"Maintenance slip *{slip.slip_no}* is confirmed.\n"
        f"Flat: {flat.number}\n"
        f"Month: {slip.month}\n"
        f"Amount: INR {slip.amount:,.2f}\n"
        f"Status: PAID\n"
        f"PDF: {pdf_url}"
    )


def wa_me_url(phone: str, message: str) -> str:
    number = normalize_phone(phone)
    base = f"https://wa.me/{number}" if number else "https://wa.me/"
    return f"{base}?text={quote(message)}"


def send_document(phone: str, pdf_path: str, caption: str) -> dict:
    """Send PDF via WhatsApp Cloud API when credentials are configured."""
    if not settings.whatsapp_token or not settings.whatsapp_phone_number_id:
        return {
            "sent": False,
            "mode": "share_link",
            "detail": "Cloud API is not configured. Use the WhatsApp share link.",
        }

    to = normalize_phone(phone)
    if not to:
        return {"sent": False, "mode": "cloud", "detail": "A valid WhatsApp number is required."}

    headers = {"Authorization": f"Bearer {settings.whatsapp_token}"}
    media_url = f"https://graph.facebook.com/v21.0/{settings.whatsapp_phone_number_id}/media"
    msg_url = f"https://graph.facebook.com/v21.0/{settings.whatsapp_phone_number_id}/messages"

    with httpx.Client(timeout=60) as client:
        with open(pdf_path, "rb") as handle:
            media = client.post(
                media_url,
                headers=headers,
                files={"file": (pdf_path.split("\\")[-1].split("/")[-1], handle, "application/pdf")},
                data={"messaging_product": "whatsapp", "type": "document"},
            )
        if media.status_code >= 400:
            return {"sent": False, "mode": "cloud", "detail": media.text}
        media_id = media.json().get("id")
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "document",
            "document": {"id": media_id, "caption": caption, "filename": pdf_path.split("\\")[-1].split("/")[-1]},
        }
        sent = client.post(msg_url, headers={**headers, "Content-Type": "application/json"}, json=payload)
        if sent.status_code >= 400:
            return {"sent": False, "mode": "cloud", "detail": sent.text}
        return {"sent": True, "mode": "cloud", "detail": "PDF sent on WhatsApp."}


def send_text(phone: str, message: str) -> dict:
    if not settings.whatsapp_token or not settings.whatsapp_phone_number_id:
        return {"sent": False, "mode": "share_link", "detail": "Cloud API is not configured."}
    to = normalize_phone(phone)
    if not to:
        return {"sent": False, "mode": "cloud", "detail": "A valid WhatsApp number is required."}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": message},
    }
    headers = {"Authorization": f"Bearer {settings.whatsapp_token}", "Content-Type": "application/json"}
    url = f"https://graph.facebook.com/v21.0/{settings.whatsapp_phone_number_id}/messages"
    with httpx.Client(timeout=30) as client:
        sent = client.post(url, headers=headers, json=payload)
    if sent.status_code >= 400:
        return {"sent": False, "mode": "cloud", "detail": sent.text}
    return {"sent": True, "mode": "cloud", "detail": "Message sent on WhatsApp."}
