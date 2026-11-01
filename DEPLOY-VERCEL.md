# Deploy Max Router ke Vercel (Full-Stack, tanpa VPS)

Dashboard **dan** API berjalan bersama di Vercel: frontend statis (Vite + React)
plus API serverless (`api/[...path].js` → `backend/dist/vercel.js`).

## Setup
1. Buka https://vercel.com/new lalu import repo ini (`kuro-myths/max-router`), branch `master`.
2. Klik **Deploy** (build: `npm run build`, output: `frontend/dist`, function: `api/[...path].js`).
3. Di **Settings → Environment Variables**, isi minimal:
   - `SUPABASE_DATABASE_URL` — connection string PostgreSQL Supabase
     (Vercel Functions punya filesystem read-only, jadi database eksternal wajib).
   Opsional: `FRONTEND_ORIGIN` / `PUBLIC_BASE_URL` (default `https://max-router.vercel.app`), `CORS_ORIGINS`, `JSON_BODY_LIMIT`.

## Yang berjalan di Vercel
- Dashboard lengkap (login, provider, model, combos, usage, Perangkat Kiro, dll).
- API gateway `/v1/*`, `/v1beta/*`, `/api/*` (serverless, `maxDuration` 60 dtk).
- Kiro Device Bridge control: `/api/kiro-devices` (lihat `docs/KIRO-DEVICE.md`).

## Yang TIDAK berjalan di Vercel
- Listener/proxy MITM lokal (butuh proses permanen + akses OS komputer) —
  gunakan `scripts/kiro-device-bridge.mjs` di PC kamu, dikendalikan dari dashboard.
- Otomasi browser headless lama — tetap perlu Railway/VPS/Docker bila dipakai.

## Cookie login
Frontend dan API same-origin lewat rewrite `/api/*` → function, jadi cookie `9r_session` berfungsi normal.
