# Integrasi chat-dokumen-ai (Kuro AI) ↔ Max Router

Sinkronisasi dua arah antara **chat-dokumen-ai** (Laravel, "Kuro AI") dan
**Max Router (9Router V3)**. Integrasi berlaku **online** (router di Railway)
maupun **offline/lokal** (router di `localhost:3001`).

## Endpoint router (auto-mounted dari `backend/src/routes/dokumen-ai/`)

| Endpoint | Fungsi |
|---|---|
| `GET /api/dokumen-ai/status` | Status instance ini (online/local), uptime, daftar konsumen, waktu sinkron terakhir |
| `GET /api/dokumen-ai/sync` | Info sinkron terakhir + daftar konsumen terdaftar |
| `POST /api/dokumen-ai/sync` | Dipanggil Kuro AI: mendaftarkan konsumen + mengembalikan daftar model (`/v1/models`) dan model `working` terbaik dari model health ledger |

Catatan: `/api/*` melewati auth middleware — kirim `Authorization: Bearer <api key>`
bila router mengaktifkan `REQUIRE_API_KEY`. Probe cepat tanpa key tetap bisa
lewat `GET /api/health`.

## Alur sinkron

1. Kuro AI membuka **"Sinkron Router"** di sidebar beranda.
2. `GET /api/ai/router/status` (di Kuro AI) mengecek **online** (`MAXROUTER_ONLINE_URL`,
   mis. instance Railway) lalu **lokal** (`http://localhost:3001`) — hijau = aktif.
3. Tombol **"Sinkron Sekarang"** memanggil `POST /api/ai/router/sync`:
   - tarik `GET /v1/models` dari router aktif (online duluan, fallback lokal);
   - daftarkan Kuro AI ke router lewat `POST /api/dokumen-ai/sync`
     (router menyimpan konsumen di `DATA_DIR/dokumen-ai-consumers.json`);
   - perbarui provider **"manual"** di tabel `ai_settings` agar chat/review AI
     otomatis memakai base URL router yang sedang aktif.
4. Dua dropdown di Kuro AI tidak bentrok:
   - **Gemini** — API key dari <https://aistudio.google.com/api-keys>;
   - **Manual** — Max Router / API kompatibel OpenAI (online atau lokal).
   - Mode aktif disimpan sebagai provider default; konfigurasi dropdown satunya tetap tersimpan.

## Menjalankan lokal

```bash
# Router (terminal 1)
cd max-router
npm install
npm run backend        # http://localhost:3001

# Kuro AI (terminal 2)
cd chat-dokumen-ai
cp .env.example .env
php artisan migrate
php artisan serve      # http://localhost:8000
```

`.env` Kuro AI untuk mode lokal:

```env
AI_MODE=manual
MAXROUTER_ONLINE_URL=            # kosong saat offline — otomatis pakai lokal
MAXROUTER_BASE_URL=http://localhost:3001/v1
MAXROUTER_API_KEY=               # kosong bila router REQUIRE_API_KEY=false
```

Buka beranda Kuro AI → **Sinkron Router** → pilih **Manual** → sumber **Lokal** →
**Sinkron Sekarang** → **Simpan Mode & API Key**. Tanpa internet pun chat dan
review dokumen tetap jalan selama router lokal aktif.
