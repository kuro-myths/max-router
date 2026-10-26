@echo off
setlocal
title Max Router Agent
echo.
echo  MAX ROUTER AGENT
echo  Mode: Agent Otomatis

where node.exe >nul 2>&1
if errorlevel 1 (
  echo GAGAL: Node.js tidak ditemukan.
  echo https://nodejs.org/
  pause
  exit /b 1
)

set "AGENT_FILE=%TEMP%\maxrouter-agent.js"

REM Coba unduh dari GitHub
curl.exe -fLsS "https://raw.githubusercontent.com/rizki-habibi/max-router/master/maxrouter-agent.js" -o "%AGENT_FILE%"
if errorlevel 1 (
  echo GAGAL: Tidak dapat mengunduh dari GitHub.
  pause
  exit /b 1
)

if not exist "%AGENT_FILE%" (
  echo GAGAL: File tidak ditemukan.
  pause
  exit /b 1
)

echo Menjalankan Max Router Agent...
echo.

REM Jika ada argument, kirimkan ke agent
node.exe "%AGENT_FILE%" %*
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Agent berhenti dengan kode %EXITCODE%.
  pause
)
endlocal
