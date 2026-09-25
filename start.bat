@echo off
start "SM Living API" cmd /k "cd /d %~dp0backend && .venv\Scripts\uvicorn app.main:app --reload --port 8000"
start "SM Living Web" cmd /k "cd /d %~dp0frontend && npm run dev"
echo Open http://localhost:5173
