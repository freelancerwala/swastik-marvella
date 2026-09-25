# SM Living — Swastik Marvella

Community portal for **Swastik Marvella**. Login only — the secretary creates Owner, Rent, and extra Secretary accounts.

First secretary email and password are **not** stored in this README. Use the private file `OFFLINE-SECRETARY-LOGIN.txt` on this computer (it is gitignored and will not go live).

On a new database there are **no** owner/rent demo users, flats, or sample notices.

## Run locally

Backend (Python 3.10 or 3.11):

```bash
cd backend
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

To wipe local demo data and start empty again, stop the API and delete `backend/smliving.db`.

## Deploy live (Vercel site + Render API)

Vercel hosts the React app. FastAPI needs a real server (uploads + SQLite), so the API goes on [Render](https://render.com).

### 1. API on Render

1. Push this repo to GitHub.
2. In Render: **New + → Blueprint** (uses `render.yaml`) or **Web Service** with:
   - Root directory: `backend`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Set environment variables:

| Key | Example |
| --- | --- |
| `SECRET_KEY` | long random string |
| `FRONTEND_URL` | `https://your-app.vercel.app` |
| `SECRETARY_EMAIL` | `secretary@swastikmarvella.in` |
| `SECRETARY_PASSWORD` | a strong password (only used on first empty database) |
| `SECRETARY_NAME` | `Society Secretary` |
| `DATA_DIR` | `/data` |
| `DATABASE_URL` | `sqlite:////data/smliving.db` |

4. Add a persistent disk at `/data` so logins and uploads survive restarts.
5. Copy the API URL, for example `https://sm-living-api.onrender.com`.

### 2. Website on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → this GitHub repo.
2. **Root Directory:** `frontend`
3. Framework: Vite (auto).
4. Environment variable (Production):

| Key | Value |
| --- | --- |
| `VITE_API_URL` | `https://sm-living-api.onrender.com` (no trailing slash) |

5. Deploy. Then put that Vercel URL into Render `FRONTEND_URL` and redeploy the API if needed.

After go-live, the sign-in page has **no** demo passwords. Secretary signs in, opens **My account**, and changes name and password.

## Roles

- **Secretary** — users, flats, owners, rent, daily updates, maintenance, slips, WhatsApp, chat, reminders, and own account.
- **Owner** — owner details, rent for a let-out flat, updates, pay maintenance, slips.
- **Rent** — rent details, updates, pay maintenance, slips.

## WhatsApp paid slips

Confirmed slips get a PDF. Share opens `wa.me`. Optional Cloud API keys: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
