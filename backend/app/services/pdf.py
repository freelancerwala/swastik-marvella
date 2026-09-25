from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.config import BRAND_DIR, SLIP_DIR, settings
from app.models import Flat, MaintenanceSlip, OwnerProfile, User


MAROON = colors.HexColor("#6B1E2F")
GOLD = colors.HexColor("#C9A227")
IVORY = colors.HexColor("#F7F1E5")
INK = colors.HexColor("#2B2118")


def generate_slip_pdf(slip: MaintenanceSlip, flat: Flat, payer: User, owner: OwnerProfile | None) -> str:
    filename = f"{slip.slip_no}.pdf"
    path = SLIP_DIR / filename
    c = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4

    c.setFillColor(MAROON)
    c.rect(0, height - 38 * mm, width, 38 * mm, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0, height - 40 * mm, width, 2 * mm, fill=1, stroke=0)

    logo = BRAND_DIR / "logo.png"
    if logo.exists():
        c.drawImage(str(logo), 16 * mm, height - 34 * mm, width=22 * mm, height=22 * mm, mask="auto")

    c.setFillColor(colors.white)
    c.setFont("Times-Bold", 20)
    c.drawString(42 * mm, height - 18 * mm, settings.society_name.upper())
    c.setFont("Times-Roman", 11)
    c.drawString(42 * mm, height - 26 * mm, f"{settings.app_name}  ·  Maintenance Receipt")
    c.setFont("Times-Italic", 9)
    c.drawRightString(width - 16 * mm, height - 18 * mm, "Paid & Confirmed")
    c.drawRightString(width - 16 * mm, height - 26 * mm, slip.slip_no)

    c.setFillColor(IVORY)
    c.roundRect(16 * mm, height - 78 * mm, width - 32 * mm, 32 * mm, 6, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Times-Bold", 12)
    c.drawString(22 * mm, height - 52 * mm, "Receipt details")
    c.setFont("Times-Roman", 10)
    rows = [
        (22 * mm, f"Flat: {flat.number}"),
        (90 * mm, f"Month: {slip.month}"),
        (150 * mm, f"Amount: INR {slip.amount:,.2f}"),
        (22 * mm, f"Paid by: {payer.name}"),
        (90 * mm, f"Date: {slip.created_at.strftime('%d %b %Y')}"),
        (150 * mm, "Status: CONFIRMED"),
    ]
    y = height - 64 * mm
    for i, (x, text) in enumerate(rows):
        if i == 3:
            y = height - 72 * mm
        c.drawString(x, y, text)

    y = height - 96 * mm
    c.setFont("Times-Bold", 12)
    c.setFillColor(MAROON)
    c.drawString(16 * mm, y, "Society & resident")
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.line(16 * mm, y - 3 * mm, width - 16 * mm, y - 3 * mm)

    c.setFillColor(INK)
    c.setFont("Times-Roman", 10)
    details = [
        ("Society", settings.society_name),
        ("Portal", settings.app_name),
        ("Wing / Flat", f"{flat.wing} / {flat.number}"),
        ("Floor", str(flat.floor)),
        ("Owner", owner.full_name if owner else "—"),
        ("Owner phone", owner.phone if owner else "—"),
        ("Payer login", payer.email),
        ("Payer role", payer.role.value.title()),
        ("Description", getattr(getattr(slip, "charge", None), "description", None) or "Society maintenance"),
        ("Issued at", datetime.utcnow().strftime("%d %b %Y, %H:%M UTC")),
    ]
    y -= 12 * mm
    for label, value in details:
        c.setFillColor(colors.HexColor("#7A6A55"))
        c.drawString(16 * mm, y, label)
        c.setFillColor(INK)
        c.drawString(60 * mm, y, str(value))
        y -= 7 * mm

    c.setFillColor(MAROON)
    c.roundRect(16 * mm, 42 * mm, width - 32 * mm, 22 * mm, 5, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.setFont("Times-Bold", 13)
    c.drawString(22 * mm, 54 * mm, "Amount received")
    c.drawRightString(width - 22 * mm, 54 * mm, f"INR {slip.amount:,.2f}")
    c.setFillColor(colors.white)
    c.setFont("Times-Roman", 9)
    c.drawString(22 * mm, 47 * mm, "This slip is generated after secretary confirmation of the payment screenshot.")

    c.setFillColor(colors.HexColor("#7A6A55"))
    c.setFont("Times-Italic", 8)
    c.drawCentredString(
        width / 2,
        28 * mm,
        f"{settings.society_name} · {settings.app_name} · This is a computer-generated receipt.",
    )
    c.drawCentredString(width / 2, 22 * mm, "Share this PDF on WhatsApp with the society office or your resident group.")
    c.save()
    return str(path)


def public_pdf_url(pdf_path: str) -> str:
    name = Path(pdf_path).name
    return f"/api/files/slips/{name}"
