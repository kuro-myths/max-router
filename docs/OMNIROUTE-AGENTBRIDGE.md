# Integrasi OmniRoute AgentBridge untuk Max Router

## Tujuan dan batas arsitektur

Integrasi ini menambahkan panduan dan installer untuk menjalankan **OmniRoute AgentBridge** sebagai MITM proxy lokal. Source OmniRoute tetap dikelola oleh upstream agar Max Router tidak menyalin atau mem-fork seluruh codebase eksternal.

- Max Router tetap menjadi gateway/dashboard cloud yang sudah ada.
- OmniRoute AgentBridge berjalan di komputer pengguna (Windows/macOS/Linux) dan mengelola trust certificate serta host interception secara lokal.
- AgentBridge meneruskan traffic yang didukung ke routing engine OmniRoute.
- Integrasi ini **tidak otomatis menggabungkan database/provider Max Router dengan OmniRoute**. Koneksi Max Router sebagai upstream OpenAI-compatible harus dikonfigurasi terpisah dan diuji sebelum digunakan.

Upstream: https://github.com/cheaper-inference/OmniRoute  
Dokumentasi AgentBridge: https://omniroute.hagicode.com/en-US/frameworks/agentbridge/  
Panduan instalasi: https://omniroute.hagicode.com/en-US/guides/setup-guide/

## Persyaratan Windows

- Windows 10/11.
- Node.js pada rentang yang didukung OmniRoute: Node 22.22.2+ pada major 22, atau Node 24.x–26.x.
- npm.
- Hak administrator hanya ketika wizard perlu mengubah hosts/DNS atau memasang CA ke trust store.

## Instalasi

Jalankan dari root repository Max Router di PowerShell:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\omniroute\install-windows.ps1
```

Kemudian jalankan service:

```powershell
omniroute
```

Buka dashboard lokal:

```
http://localhost:20128
```

## Mengaktifkan AgentBridge

1. Buka **Tools → AgentBridge** (route dashboard: `/dashboard/tools/agent-bridge`).
2. Periksa prerequisites dan status server.
3. Start AgentBridge server.
4. Gunakan tombol **Trust Cert** dari dashboard/wizard. Setujui elevasi hanya jika kamu memahami bahwa CA tersebut akan dipercaya oleh sistem.
5. Pilih satu aplikasi yang ingin diuji terlebih dahulu.
6. Aktifkan DNS/hosts untuk aplikasi tersebut melalui wizard.
7. Opsional: atur model mapping ke provider yang memang sudah kamu konfigurasi.
8. Tutup sepenuhnya lalu buka kembali aplikasi AI yang diuji.
9. Verifikasi request di Traffic Inspector. Jika gagal, nonaktifkan DNS untuk agent tersebut dan jalankan Diagnose/Repair.

AgentBridge mendokumentasikan dukungan untuk Antigravity, Kiro, GitHub Copilot, GitHub Enterprise Copilot, OpenAI Codex, Cursor, Zed, Claude Code, dan OpenCode. Dukungan dapat berubah mengikuti versi upstream; Trae masih berstatus investigasi pada dokumentasi yang diperiksa.

## Keamanan wajib

MITM berarti TLS untuk host target dapat didekripsi oleh CA lokal. Gunakan hanya pada komputer dan akun milik sendiri serta untuk aplikasi yang kamu berwenang uji.

- Jangan membagikan atau meng-commit CA private key, `ca.key`, sertifikat lokal, token OAuth, cookie, atau direktori data OmniRoute.
- Jangan aktifkan interception untuk situs perbankan, pemerintah, identity provider, atau host sensitif lainnya.
- Pertahankan bypass list bawaan. Jangan menghapus bypass keamanan untuk memaksa traffic yang tidak relevan masuk proxy.
- CA yang dipercaya memberi kemampuan dekripsi pada traffic host yang diarahkan ke proxy. Hapus trust CA setelah tidak diperlukan melalui tombol **Remove CA** di dashboard.
- Jangan menjalankan AgentBridge di Vercel. Vercel tidak memiliki akses ke hosts file, trust store, dan jaringan desktop pengguna.
- Gunakan hanya kredensial/provider sesuai ketentuan layanan masing-masing. MITM tidak memberi hak tambahan atas subscription provider.

## Menghentikan dan menghapus

1. Di dashboard AgentBridge, matikan DNS/hosts untuk semua agent yang pernah diaktifkan.
2. Stop AgentBridge server.
3. Gunakan **Remove CA** bila CA tidak lagi diperlukan.
4. Tutup OmniRoute.
5. Untuk menghapus CLI OmniRoute:

```powershell
npm uninstall -g omniroute
```

Periksa kembali hosts file dan trust store sebelum menghapus folder data. Jangan menghapus folder data sebelum memastikan tidak ada konfigurasi yang masih dibutuhkan.

## Status integrasi

Installer ini hanya memasang upstream OmniRoute CLI. Ia tidak mengubah backend Max Router, tidak menanam sertifikat otomatis, dan tidak mengaktifkan interception tanpa persetujuan pengguna. Sinkronisasi provider, akun, usage, dan routing antara Max Router dan OmniRoute merupakan pekerjaan integrasi lanjutan yang harus diuji terpisah.
