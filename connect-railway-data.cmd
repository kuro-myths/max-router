@echo off
setlocal EnableExtensions
title Max Router - Koneksi Data Railway

echo.
echo ============================================================
echo  MAX ROUTER - KONEKSI DATABASE RAILWAY
echo  Project : multiver
echo  Env     : production
echo ============================================================
echo.
echo Skrip ini menggunakan login Railway CLI di browser.
echo Tidak membutuhkan Personal Access Token GitHub dan tidak
echo menuliskan password database ke file.
echo.

where railway >nul 2>&1
if errorlevel 1 (
  echo [GAGAL] Railway CLI belum terpasang.
  echo.
  echo Buka PowerShell lalu jalankan:
  echo   iwr https://railway.com/install.ps1 ^| iex
  echo Setelah instalasi selesai, buka CMD baru dan jalankan skrip ini lagi.
  echo.
  pause
  exit /b 1
)

where psql >nul 2>&1
if errorlevel 1 (
  echo [PERINGATAN] Klien PostgreSQL psql belum ditemukan di PATH.
  echo Railway connect memerlukan psql untuk membuka shell database.
  echo Pasang PostgreSQL Command Line Tools atau tambahkan folder bin PostgreSQL ke PATH.
  echo Setelah itu jalankan skrip ini lagi.
  echo.
  pause
  exit /b 1
)

echo [1/3] Memeriksa login Railway...
railway whoami >nul 2>&1
if errorlevel 1 (
  echo Browser login Railway akan dibuka. Silakan masuk dan izinkan akses.
  railway login
  if errorlevel 1 goto :failed
)

echo.
echo [2/3] Menghubungkan CMD ke project Railway multiver...
railway link --project "33792731-b4ce-4d44-9ee6-4ab970366d50" --environment "70bc99c5-d171-4c3e-88a8-0124243c8a1a" --workspace "400f45c0-97f0-49a4-a027-459c0424ea50"
if errorlevel 1 (
  echo.
  echo [GAGAL] Tidak bisa menautkan project. Pastikan akun Railway kamu
  echo memiliki akses ke project multiver, lalu coba lagi.
  goto :failed
)

echo.
echo [3/3] Membuka shell database PostgreSQL Railway...
echo Gunakan perintah SQL dengan hati-hati. Hindari DROP, DELETE, atau
echo UPDATE massal jika belum membuat backup.
echo Ketik \q di prompt psql untuk keluar.
echo.
railway connect --environment production
if errorlevel 1 goto :failed

echo.
echo Koneksi database Railway selesai.
pause
exit /b 0

:failed
echo.
echo [GAGAL] Koneksi belum berhasil. Periksa login Railway, akses project,
echo PostgreSQL psql, dan status layanan database di dashboard Railway.
pause
exit /b 1
