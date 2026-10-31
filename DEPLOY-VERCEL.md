# Deploy Dashboard ke Vercel

Frontend (Vite + React) di-hosting di Vercel; API diteruskan (proxy) ke backend Max Router di Railway.

## Setup
1. Buka https://vercel.com/new lalu import repo ini (`kuro-myths/max-router`), branch `master`.
2. Di **Root Directory** isi: `frontend` (Vercel otomatis mendeteksi Vite; build `npm run build`, output `dist`).
3. Sebelum deploy: ganti `https://GANTI-DENGAN-URL-RAILWAY.up.railway.app` di `vercel.json` dengan domain publik backend Railway kamu.
4. Klik **Deploy**.

## Catatan
- `vercel.json` meneruskan `/api/*`, `/v1/*`, `/v1beta/*`, `/ws/*` ke backend, dan fallback SPA ke `index.html`.
- Backend, database, dan otomasi browser TIDAK jalan di Vercel - tetap di Railway/VPS/Docker sesuai README utama.
- Cookie login dashboard tetap berfungsi karena frontend dan API tampak same-origin lewat proxy ini.
