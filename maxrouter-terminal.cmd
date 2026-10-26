@echo off
setlocal
title Max Router Terminal Agent
echo.
echo  MAX ROUTER TERMINAL AGENT
echo  Klien terminal untuk akses Max Router sebagai agent

where node.exe >nul 2>&1
if errorlevel 1 (
  echo GAGAL: Node.js tidak ditemukan di PATH.
  echo Pasang Node.js versi 20 atau lebih baru.
  echo https://nodejs.org/
  pause
  exit /b 1
)

set "TERMINAL_FILE=%TEMP%\maxrouter-terminal.js"

REM Coba unduh dari GitHub
curl.exe -fLsS "https://raw.githubusercontent.com/rizki-habibi/max-router/master/maxrouter-terminal.js" -o "%TERMINAL_FILE%"
if errorlevel 1 (
  echo GAGAL: Tidak dapat mengunduh dari GitHub.
  echo Periksa koneksi internet.
  pause
  exit /b 1
)

if not exist "%TERMINAL_FILE%" (
  echo GAGAL: File tidak ditemukan.
  pause
  exit /b 1
)

echo Menjalankan Max Router Terminal Agent...
echo.
node.exe "%TERMINAL_FILE%" %*
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Terminal berhenti dengan kode %EXITCODE%.
  pause
)
endlocal
