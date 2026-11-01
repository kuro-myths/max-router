# Perangkat Kiro — Kendali Online dari Dashboard

Fitur ini membuat dashboard Max Router (hosting 100% di Vercel) bisa mengendalikan
Kiro di komputer kamu: membuka/menutup aplikasi, menyalakan proxy MITM lokal, dan
membuka URL — semuanya lewat tombol di halaman **Perangkat Kiro**.

## Arsitektur

```
Dashboard Vercel          Bridge lokal (PC kamu)         Kiro
├── /dashboard/kiro-devices ──► POST /api/kiro-devices/poll (tiap ±4 dtk)
│   tombol → antrean perintah     └─ eksekusi: launch-kiro, start-mitm, open-url
└── GET  /api/kiro-devices       └─ lapor status: Kiro jalan, MITM aktif, port
```

- **Vercel** menyimpan daftar perangkat + antrean perintah (tabel `kv`, tanpa migrasi skema).
- **Bridge** (`scripts/kiro-device-bridge.mjs`) adalah skrip Node.js tanpa dependensi
  yang berjalan di komputer tempat Kiro terpasang. Browser/Vercel **tidak bisa** membuka
  aplikasi Windows secara langsung — bridge inilah yang mengeksekusinya.
- Autentikasi: header `x-api-key` (API key dari halaman **Keys** dashboard).

## Setup (sekali per komputer)

1. Pasang [Node.js 18+](https://nodejs.org).
2. Unduh/clone repo `kuro-myths/max-router` di komputer.
3. Buat API key di dashboard → halaman **Keys**.
4. Jalankan bridge:

```bash
# Windows (CMD)
set MAXROUTER_URL=https://max-router.vercel.app
set MAXROUTER_API_KEY=sk-...
node scripts\kiro-device-bridge.mjs

# macOS / Linux
MAXROUTER_URL=https://max-router.vercel.app \
MAXROUTER_API_KEY=sk-... \
node scripts/kiro-device-bridge.mjs
```

Atau klik dua kali `maxrouter-kiro-bridge.cmd` di Windows (atur URL/key di dalam file,
atau set env terlebih dahulu).

5. Buka dashboard → **Perangkat Kiro** → perangkat muncul dengan status **Online**.

## Perintah yang didukung

| Perintah    | Aksi di komputer                                              |
|-------------|---------------------------------------------------------------|
| launch-kiro | Membuka Kiro (auto-deteksi path; override via env `KIRO_PATH`)|
| close-kiro  | Menutup proses Kiro                                           |
| open-url    | Membuka URL di browser default komputer                       |
| start-mitm  | Menyalakan proxy lokal `127.0.0.1:8899` → endpoint Max Router |
| stop-mitm   | Mematikan proxy lokal                                         |
| ping        | Tes koneksi                                                   |

## Catatan penting soal MITM

`start-mitm` menjalankan **HTTP gateway** di `127.0.0.1:8899` yang meneruskan
request AI ke `MAXROUTER_URL/v1/...` dengan API key kamu. Cocok untuk tool yang
bisa diarahkan ke base URL / HTTP proxy kustom.

MITM HTTPS penuh (meng-intercept domain Kiro dengan sertifikat CA sendiri)
**tidak dijalankan di Vercel** — itu butuh listener lokal + hosts file + CA
tepercaya di komputer. Fondasinya sudah ada di `backend/src/mitm/` dan hanya bisa
dijalankan lewat bridge/VPS, bukan Vercel Functions.

## Variabel bridge

| Variabel         | Default      | Keterangan                       |
|------------------|--------------|----------------------------------|
| MAXROUTER_URL    | — (wajib)    | URL deployment Vercel            |
| MAXROUTER_API_KEY| — (wajib)    | API key dashboard                |
| DEVICE_NAME      | hostname     | Nama perangkat di dashboard      |
| KIRO_PATH        | auto         | Path executable Kiro            |
| MITM_PORT        | 8899         | Port proxy lokal                 |
| POLL_MS          | 4000         | Interval polling (min 2000)      |

Semua variabel juga bisa dilewat sebagai argumen:
`--url=... --key=... --name=... --mitm-port=9090`
