@echo off
setlocal
title Max Router Diagnostik Online
echo.
echo  MAX ROUTER - DIAGNOSTIK ONLINE
echo  Memeriksa layanan Railway secara langsung...
echo.

where node.exe >nul 2>&1
if errorlevel 1 (
  echo GAGAL: Node.js tidak ditemukan di PATH.
  echo Pasang Node.js versi 20 atau lebih baru: https://nodejs.org/
  pause
  exit /b 1
)

set "CLI_FILE=%TEMP%\maxrouter-diagnostik.js"
curl.exe -fLsS "https://raw.githubusercontent.com/rizki-habibi/max-router/master/maxrouter-diagnostik.js" -o "%CLI_FILE%"
if errorlevel 1 (
  echo GAGAL: Tidak dapat mengunduh alat diagnostik dari GitHub.
  echo Periksa koneksi internet dan akses repositori.
  pause
  exit /b 1
)
if not exist "%CLI_FILE%" (
  echo GAGAL: File diagnostik tidak ditemukan.
  pause
  exit /b 1
)
node.exe "%CLI_FILE%"
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" echo Diagnostik berakhir dengan kode %EXITCODE%.
pause
endlocal
