@echo off
setlocal
title Max Router Online CLI
echo.
echo  MAX ROUTER ONLINE CLI
echo  Memuat klien terbaru dari GitHub...
echo.

where node.exe >nul 2>&1
if errorlevel 1 (
  echo GAGAL: Node.js tidak ditemukan di PATH.
  echo Pasang Node.js versi 20 atau lebih baru, lalu buka CMD baru.
  echo Situs resmi: https://nodejs.org/
  pause
  exit /b 1
)

set "CLI_FILE=%TEMP%\maxrouter-cli.js"
curl.exe -fLsS "https://raw.githubusercontent.com/rizki-habibi/max-router/master/maxrouter-cli.js" -o "%CLI_FILE%"
if errorlevel 1 (
  echo GAGAL: Tidak dapat mengunduh maxrouter-cli.js dari GitHub.
  echo Periksa internet dan akses repositori.
  pause
  exit /b 1
)
if not exist "%CLI_FILE%" (
  echo GAGAL: File CLI tidak ditemukan setelah diunduh.
  pause
  exit /b 1
)

node.exe --version
echo Menjalankan Max Router online, bukan CLI lokal lama...
node.exe "%CLI_FILE%"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo CLI berhenti dengan kode %EXITCODE%.
  pause
)
endlocal
