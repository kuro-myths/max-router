# Panduan Deploy ke Vercel (max-router)

Dokumen ini menggantikan panduan lama (frontend-only + proxy ke Railway) yang sudah tidak sesuai.
Arsitektur saat ini adalah **monorepo serverless**: satu project Vercel menjalankan frontend **dan** backend.

## Arsitektur

- `vercel.json` mengarahkan build output ke `frontend/dist` dan me-rewrite path `/api`, `/v1`, dan `/v1beta` ke Serverless Function `api/[...path].js`.
- `api/[...path].js` memuat `backend/dist/vercel.js` (hasil build `backend`), sehingga seluruh route backend berjalan di Vercel.
- Data dashboard (provider, koneksi, pengaturan, dll.) disimpan via driver database `backend/src/lib/db/driver.js`.

## Environment Variables (WAJIB)

Tanpa variabel ini, deployment "sehat" tetapi **datanya kosong/hilang** — inilah penyebab utama
tombol uji koneksi, chat, dan tab AI Layanan tampak mati (error 401/404 ditelan diam-diam oleh frontend).

Set di **Vercel → Project → Settings → Environment Variables**:

| Variabel | Keterangan |
| --- | --- |
| `JWT_SECRET` | Wajib di production. Kunci penandatanganan sesi login dashboard. |
| `INITIAL_PASSWORD` | Password awal login dashboard yang dibuat saat pertama kali. |
| `SUPABASE_DATABASE_URL` | **Direkomendasikan.** Connection string PostgreSQL Supabase (tier gratis tersedia). |
| `DATABASE_URL` | Alternatif PostgreSQL (mis. Neon, RDS). |
| `MYSQL_URL` | Alternatif MySQL/MariaDB. |

> Pilih **salah satu** dari `SUPABASE_DATABASE_URL` / `DATABASE_URL` / `MYSQL_URL`.
> Di production, driver database menolak berjalan tanpa database eksternal,
> **kecuali** jika `ALLOW_EPHEMERAL_SQLITE=true` — namun mode ini menyimpan data di `/tmp`
> per-instance serverless, sehingga **data hilang setiap cold start**. Jangan dipakai selain untuk uji cepat.

### Variabel opsional

- `DISABLE_DASHBOARD_AUTH=true` — matikan autentikasi dashboard (hati-hati).
- `CORS_ORIGINS` — daftar origin yang diizinkan, dipisah koma.
- `GOOGLE_*` — kredensial fitur terkait Google (opsional).

Setelah menambah variabel, **Redeploy** dari dashboard Vercel agar fungsi serverless membaca nilai baru.

## Fitur yang TIDAK didukung di Vercel (serverless)

Fitur berbutuh proses panjang/koneksi persisten, jadi tidak berfungsi di Vercel:

- Stream SSE: `/api/usage/stream`, `/api/translator/console-logs/stream`, MCP SSE
- Tunnel (tailscale/ngrok), MITM, browser automation, auto-updater

Untuk fitur lengkap tersebut, gunakan Railway, VPS, atau Docker.

## Verifikasi setelah deploy

1. `https://<domain>/api/health` — harus `{"status":"ok", ...}`
2. `https://<domain>/api/debug/routes` — pastikan `importFailures: []`
3. Login ke dashboard dengan `INITIAL_PASSWORD`
4. Tambahkan satu provider AI, lalu refresh halaman — provider harus **tetap ada** (bukti database eksternal bekerja)
5. Klik tombol **Uji** pada koneksi — jika gagal, kini muncul pesan error yang jelas (bukan diam saja)
