@echo off
setlocal
title Max Router Online CLI
set "CLI_DIR=%LOCALAPPDATA%\MaxRouterCLI"
set "CLI_FILE=%CLI_DIR%\maxrouter-cli.ps1"
if not exist "%CLI_DIR%" mkdir "%CLI_DIR%" >nul 2>&1
echo.
echo  MAX ROUTER ONLINE CLI
echo  Mengambil klien terminal dari GitHub...
where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo PowerShell tidak ditemukan. Windows PowerShell diperlukan.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/rizki-habibi/max-router/master/maxrouter-cli.ps1' -OutFile '%CLI_FILE%'"
if errorlevel 1 (
  echo Gagal mengunduh klien. Periksa koneksi internet atau branch GitHub.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%CLI_FILE%"
endlocal
