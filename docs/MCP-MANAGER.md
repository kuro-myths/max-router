# MCP Manager — Kelola Server MCP dari Dashboard

Halaman **MCP Manager** (`/dashboard/mcp`) memungkinkan kamu mengelola server MCP
(Model Context Protocol) sepenuhnya dari dashboard online — tanpa file konfigurasi manual.

## Kemampuan

| Aksi | Cara |
|---|---|
| **Tambah** server | Tombol "Tambah Server" — isi nama, transport, URL/command, headers |
| **Edit** | Tombol "Edit" di kartu server — semua field bisa diubah |
| **Hapus** | Tombol "Hapus" di kartu server |
| **Aktif / nonaktif** | Checkbox pada kartu |
| **Baca tools** | Tombol "Baca Tools" → JSON-RPC `initialize` + `tools/list`, daftar tool + skema input ditampilkan |
| **Jalankan tool** | Klik salah satu tool → masukkan argumen JSON → "Jalankan Tool" → hasil tampil di dashboard |

## Transport yang didukung

- **http** (Streamable HTTP / RPC-over-HTTP): penuh — probe + call tool langsung dari Vercel.
- **sse**: tersimpan & bisa diedit, tetapi koneksi persisten harus lewat bridge lokal.
- **stdio**: tersimpan & bisa diedit (command + args, hanya biner aman: npx/uvx/python/node/bunx/docker);
  eksekusi berjalan di komputer via Kiro Bridge, bukan di cloud.

## API

- `GET /api/mcp-manager/servers` — daftar
- `POST /api/mcp-manager/servers` — tambah
- `PATCH /api/mcp-manager/servers/:id` — edit
- `DELETE /api/mcp-manager/servers/:id` — hapus
- `POST /api/mcp-manager/servers/:id/probe` — baca daftar tools
- `POST /api/mcp-manager/servers/:id/call` — jalankan tool (`{ tool, args }`)

Penyimpanan memakai tabel `kv` (scope `mcp-manager`) — otomatis jalan di SQLite lokal
maupun PostgreSQL/Supabase di Vercel, tanpa migrasi skema. Header (mis. `Authorization`)
disimpan bersama konfigurasi server.
