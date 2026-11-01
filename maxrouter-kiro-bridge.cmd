@echo off
REM Max Router Kiro Bridge — launcher Windows
REM Setelan (satu kali, atau edit langsung di bawah):
REM   MAXROUTER_URL     = URL deployment Max Router di Vercel
REM   MAXROUTER_API_KEY = API key dari halaman Keys dashboard

if "%MAXROUTER_URL%"=="" set MAXROUTER_URL=https://max-router.vercel.app
REM if "%MAXROUTER_API_KEY%"=="" set MAXROUTER_API_KEY=sk-...

where node >nul 2>nul
if errorlevel 1 (
  echo [bridge] Node.js belum terpasang. Unduh dari https://nodejs.org
  pause
  exit /b 1
)

echo [bridge] Menjalankan Max Router Kiro Bridge...
node "%~dp0scripts\kiro-device-bridge.mjs" %*
pause
