# 9Router V3

> A self-hosted AI gateway: one endpoint, many providers, automatic fallback.

**9Router V3** is a downstream fork maintained by **codestorm**, focused on portable deployment, persistent storage, secure configuration, and a more reliable dashboard experience.

The project lineage is:

1. [decolua/9router](https://github.com/decolua/9router) — the original 9Router project, routing engine, and provider integrations.
2. [ahwanulm/9router-v2](https://github.com/ahwanulm/9router-v2) — the Express backend and Vite + React frontend rewrite.
3. **9Router V3 by codestorm** — a continuation that packages the V2 architecture for local machines, Docker, VPS platforms, and supported PaaS environments.

The GitHub repository is still named `9router-v2` to preserve the fork URL and Git history, while the product, interface, metadata, and documentation use the **9Router V3** name.

---

## 9Router vs V2 vs V3

| Capability | Original 9Router | 9Router V2 | 9Router V3 |
|---|:---:|:---:|:---:|
| OpenAI-compatible API | ✅ | ✅ | ✅ |
| Multi-provider routing and fallback | ✅ | ✅ | ✅ |
| Separate backend and frontend | ❌ | ✅ | ✅ |
| Express backend with a Vite/React dashboard | ❌ | ✅ | ✅ |
| Multi-stage production Docker image | ❌ | ❌ | ✅ |
| API and dashboard in one service | ❌ | ❌ | ✅ |
| Local development workflow | ✅ | ✅ | ✅ |
| Docker deployment | ❌ | ❌ | ✅ |
| VPS deployment guide | ❌ | ✅ | ✅ |
| Heroku `Procfile` support | ❌ | ❌ | ✅ |
| Configurable persistent data directory | ❌ | ✅ | ✅ |
| Railway deployment configuration | ❌ | ❌ | ✅ |
| Self-hosted Material Symbols | ❌ | ❌ | ✅ |
| API-key dialog with loading and error feedback | ❌ | ❌ | ✅ |
| V3 branding, logo, and login experience | ❌ | ❌ | ✅ |
| PayPal donation QR on the login page | ❌ | ❌ | ✅ |
| Generated browser profiles excluded from Git | ❌ | ❌ | ✅ |

V3 does not claim authorship of the routing engine or provider integrations. Those remain upstream work; V3 focuses on packaging, deployment, reliability, and user experience.

---

## Features

- **OpenAI-compatible REST API** for chat, image generation, audio, embeddings, web search, and related endpoints.
- **Multi-provider routing** with load balancing, fallback, and key rotation.
- **Modern dashboard** for providers, connections, proxy pools, CLI tools, automation, usage, and security settings.
- **Password and OIDC authentication** for dashboard access.
- **MySQL persistence in production**, with SQLite reserved for local development and a one-time PostgreSQL-to-MySQL import path.
- **Cloudflare Workers AI automation** with Playwright, CAPTCHA providers, and temporary email.
- **Portable deployment** for local machines, Docker, Railway, Heroku, and Linux VPS hosts.

---

## Architecture

```text
9router-v3/
├── backend/
│   └── src/
│       ├── routes/       # API and auto-routed endpoints
│       ├── lib/db/       # SQLite/PostgreSQL repositories and adapters
│       └── automation/   # Browser automation
├── frontend/
│   ├── public/branding/  # V3 logo and favicon
│   └── src/              # Vite + React dashboard
├── Dockerfile
├── Procfile
└── railway.toml
```

---

## Deployment Options

### Common Environment Variables

Start from [`backend/.env.example`](./backend/.env.example). The main runtime variables are:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs dashboard sessions |
| `INITIAL_PASSWORD` | Initial dashboard password; required until a password is stored |
| `API_KEY_SECRET` | Signs generated API keys |
| `MYSQL_URL` | Required persistent MySQL connection string in production (Railway private URL) |
| `DATABASE_URL` | Temporary PostgreSQL source for one-time import to MySQL; remove after verified migration |
| `DATA_DIR` | Stores SQLite data, logs, and runtime files; still used for non-database runtime files with PostgreSQL |
| `NODE_ENV` | Use `production` outside local development |
| `PORT` | HTTP port; most PaaS providers inject this automatically |

Never commit real secrets.

### Run Locally

Requirements:

- Node.js 20+
- Python 3.10+ for automation features
- Chromium or Camoufox for browser automation

Install:

```bash
git clone https://github.com/codestorm-official/9router-v2.git 9router-v3
cd 9router-v3
npm install
cp backend/.env.example backend/.env
```

Replace PaaS expressions such as `${{secret(32)}}` with normal random secrets in `backend/.env`.

Development commands:

```bash
npm run dev       # Backend and frontend with development servers
npm run backend   # Backend only
npm run frontend  # Frontend only
```

Local production mode:

```bash
npm run build
npm start
```

The production server listens on `PORT` and serves both the API and built frontend.

### Run with Docker

Build and start the image:

```bash
docker build -t 9router-v3 .
docker run --rm -p 3001:3001 \
  -e PORT=3001 \
  -e NODE_ENV=production \
  -e DATA_DIR=/data \
  -e JWT_SECRET=replace-with-a-random-secret \
  -e INITIAL_PASSWORD=replace-with-a-secure-password \
  -e API_KEY_SECRET=replace-with-a-random-secret \
  -v 9router-data:/data \
  9router-v3
```

Open `http://localhost:3001`.

### Deploy to a VPS

This works on providers such as **Hetzner, Contabo, DigitalOcean, Linode, Vultr, AWS EC2**, or any Debian/Ubuntu server.

Recommended options:

- Run the Docker image behind Nginx or Caddy.
- Run Node.js directly with systemd and Nginx.
- Store `DATA_DIR` on a persistent disk.
- Add TLS through Caddy, Certbot, or Cloudflare.

See the complete [`Linux deployment guide`](./docs/deployment-linux.md) for systemd, Nginx, backups, updates, and troubleshooting.

### Deploy to Heroku

The included [`Procfile`](./Procfile) starts the production server, while `heroku-postbuild` compiles the frontend and backend.

```bash
heroku create your-9router-v3
heroku config:set \
  NODE_ENV=production \
  JWT_SECRET=replace-with-a-random-secret \
  INITIAL_PASSWORD=replace-with-a-secure-password \
  API_KEY_SECRET=replace-with-a-random-secret \
  DATA_DIR=/tmp/9router-v3
git push heroku main
```

Heroku injects `PORT` automatically.

> Heroku's dyno filesystem is ephemeral. Set `DATABASE_URL` to a managed PostgreSQL database for persistent application data, or use Heroku only for testing with SQLite.

### Deploy to Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/9router-v3?referralCode=asepsp&utm_medium=integration&utm_source=template&utm_campaign=generic)

**OR**

1. Create a service from this repository.
2. Copy variables from `backend/.env.example` into the **Variables** tab.
3. Add a Railway PostgreSQL service and expose its `DATABASE_URL` to 9Router, or attach a Railway Volume at `/data` to keep using SQLite.
4. Generate a public domain under **Settings → Networking**.

Railway builds the included Dockerfile. It supplies `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_PRIVATE_DOMAIN`, and `PORT` automatically. The Dockerfile intentionally omits the unsupported Docker `VOLUME` instruction.

### Switching Between SQLite and PostgreSQL

- Without `DATABASE_URL`, 9Router uses SQLite at `DATA_DIR/db/data.sqlite`.
- With a non-empty `DATABASE_URL`, 9Router initializes and uses PostgreSQL.
- SQLite and PostgreSQL are separate data stores. Before switching an existing installation, export the database from the dashboard, set or remove `DATABASE_URL`, restart, then import the exported data.

---

## Main API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Health check |
| `GET /v1/models` | List models |
| `POST /v1/chat/completions` | Chat completions |
| `POST /v1/images/generations` | Image generation |
| `POST /v1/audio/speech` | Text-to-speech |
| `POST /v1/audio/transcriptions` | Speech-to-text |
| `POST /v1/embeddings` | Embeddings |
| `GET /v1/search` | Web search |

---


---


---

## License and Attribution

This project is licensed under the MIT License. See [`LICENSE`](./LICENSE).

Thanks to:

- [decolua/9router](https://github.com/decolua/9router) for the original project, routing logic, and provider integrations.
- [ahwanulm/9router-v2](https://github.com/ahwanulm/9router-v2) for the V2 rewrite and Express + Vite/React architecture.
- **codestorm** as the creator and maintainer of the **9Router V3** continuation.

Upstream copyright notices remain intact out of respect for the original authors and in compliance with the license.

## Kesehatan & rating model

Router mencatat hasil setiap permintaan (sukses/gagal, latensi, respons kosong) per `provider/model`, lalu menilai
mana yang **berfungsi** dan **berguna**. Data disimpan di database dan bertahan setelah restart; bukti lama memudar
otomatis (waktu paruh 6 jam), jadi model yang lama tidak dipakai kembali berstatus `unknown`.

- `GET /api/model-health` — peringkat model: `status` (`working`/`degraded`/`down`/`unknown`), `score` 0–100,
  tingkat sukses, latensi, alasan, plus `best` (model terbaik yang benar-benar `working`) dan ringkasan per provider.
  Filter: `?status=working&provider=cc&limit=10`.
- `POST /api/model-health/probe` `{ "models": ["alias/model"], "limit": 8 }` — kirim ping 1 token untuk memastikan.
  Tanpa `models`, yang diprobe adalah model yang paling lama tidak terlihat.
- Probe terjadwal (opsional, mati secara default karena tetap memakai kuota provider):
  `MODEL_HEALTH_PROBE_INTERVAL_MIN=30` dan `MODEL_HEALTH_PROBE_LIMIT=5`.

Penilaian: 60% keandalan, 25% kecepatan respons pertama, 15% respons berisi. Error 400/422 dari klien dan pembatalan
tidak dihitung sebagai kesalahan model; 429 dihitung setengah. Logika murni ada di `backend/src/lib/modelHealth/scoring.js`.


## Koneksi CMD langsung ke database Railway

Untuk membuka shell database PostgreSQL dari Windows CMD tanpa menyalin token GitHub atau password database secara manual:

1. Pasang [Railway CLI](https://docs.railway.com/cli/installation) jika belum tersedia. Di PowerShell, jalankan `iwr https://railway.com/install.ps1 | iex`.
2. Pasang PostgreSQL Command Line Tools agar perintah `psql` tersedia di PATH.
3. Unduh file `connect-railway-data.cmd` dari repositori ini, lalu jalankan dengan klik dua kali atau dari CMD.
4. Saat pertama kali, skrip meminta login Railway melalui browser. Setelah itu skrip menautkan CLI ke project `multiver`, environment `production`, lalu menjalankan `railway connect` untuk memilih layanan database.
5. Ketik `\q` di prompt PostgreSQL untuk keluar.

Skrip memakai Railway CLI dan izin akun Railway yang sudah login; skrip tidak menyimpan kredensial database. Akses database tetap mengikuti izin akun Railway. Jalankan query perubahan data dengan hati-hati dan buat backup sebelum operasi yang berisiko.


## Max Router CLI Online dari Windows CMD

Klien terminal ini mengakses Max Router yang sudah berjalan di Railway; tidak menjalankan backend atau database di komputer lokal.

**Jalankan satu baris dari CMD:**

```bat
curl -L https://raw.githubusercontent.com/rizki-habibi/max-router/master/maxrouter.cmd -o "%TEMP%\maxrouter.cmd" && "%TEMP%\maxrouter.cmd"
```

Menu CLI:
- Cek apakah dashboard Railway dapat dijangkau.
- Lihat jumlah dan ID model/API yang dikembalikan endpoint OpenAI-compatible `/v1/models`.
- Chat melalui `/v1/chat/completions`.
- Ganti URL dasar untuk server lain atau buka dashboard web.

CLI meminta API key saat diperlukan dan hanya menyimpannya di memori selama sesi terminal. Buat atau salin API key dari pengaturan Max Router; kata sandi login dashboard belum tentu merupakan API key. Jangan membagikan API key ke orang lain. Jika model tidak muncul atau mendapat HTTP 401/403, periksa API key dan izin yang dikonfigurasi di Max Router.

Klien ini berjalan dari CMD/PowerShell sebagai terminal lokal, tetapi semua permintaan AI dikirim ke layanan online Railway. Koneksi internet dan layanan Railway harus aktif.
