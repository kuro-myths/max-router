# Voice AI & VTuber Studio (Max Router V4)

Fitur baru frontend pada dashboard Max Router. Semua kode berada di frontend/src.

## Halaman baru

### Voice AI (/dashboard/voice-ai)

Ruang kerja percakapan suara dua arah dengan pipeline:

    Browser Microphone -> STT -> Router AI -> LLM -> TTS -> Audio Playback -> VTuber Lip Sync

Komponen utama:

- Tombol mikrofon push-to-talk (rekaman via MediaRecorder).
- Fase percakapan: IDLE, LISTENING, TRANSCRIBING, THINKING, SPEAKING.
- Waveform real-time dan level meter (mikrofon + keluaran) via Web Audio API AnalyserNode.
- VTuber panel dengan speech bubble komik dan lip-sync berbasis level audio.
- Mode percakapan berkelanjutan (otomatis mendengarkan lagi setelah AI selesai bicara).
- Pilihan model chat (dari /v1/models), model STT, model TTS, voice, kecepatan, dan bahasa.
- Transkrip percakapan, input teks cadangan tanpa mikrofon, unduh audio TTS.
- Emosi AI: balasan berformat metadata JSON { text, emotion, gesture, animation } divalidasi
  terhadap daftar emosi yang diizinkan, lalu diterapkan ke avatar. Tidak ada eksekusi kode.

Endpoint yang digunakan (lewat proxy router, tanpa API key di frontend):

- POST /api/v1/audio/transcriptions (STT)
- POST /api/v1/chat/completions (LLM)
- POST /api/v1/audio/speech (TTS)
- GET  /api/v1/models (daftar model)

Jika endpoint STT/TTS belum dikonfigurasi provider-nya, halaman menampilkan pesan kesalahan
yang jelas, bukan status palsu.

### VTuber Studio (/dashboard/vtuber-studio)

- Character Library: karakter bawaan (Mika, Kuro, Hana) plus katalog eksternal gratis
  (VRM CC0 dari ToxSam/open-source-avatars, madjin/vrm-samples, pixiv/three-vrm, referensi
  lunarjjo/vtpal). Pilihan karakter tersimpan di localStorage dan dipakai juga di Voice AI.
- Ekspresi & Lip-Sync: 8 emosi (neutral, happy, sad, angry, surprised, thinking, shy,
  excited), tombol uji bicara, dan pratinjau metadata emosi.
- Rigging & Adapter: status jujur adapter avatar - prosedural 2D aktif; VRM, GLB, Live2D,
  dan face tracking direncanakan sebagai adapter terpisah.

## Komponen reusable

- frontend/src/shared/components/vtuber/VtuberAvatar.jsx
  Avatar SVG komik procedural: 8 ekspresi, kedipan otomatis, mulut audio-reactive,
  palet warna per karakter. Tanpa dependensi 3D sehingga aman untuk semua ukuran bundle.
- frontend/src/shared/components/vtuber/characters.js
  Manifest karakter: metadata, lisensi, atribusi, palet, penyimpanan pilihan karakter.

## Roadmap adapter

1. VrmAdapter dengan @pixiv/three-vrm (loader resmi, MIT).
2. GlbAdapter dengan three.js GLTFLoader.
3. Live2DAdapter (opsional, lisensi Cubism SDK terpisah).
4. Face tracking MediaPipe Tasks Vision (izin kamera eksplisit).

Setiap format model memiliki loader tersendiri; avatar procedural tetap menjadi fallback
agar aplikasi tidak pernah tampil tanpa karakter.

## Kredit sumber eksternal

- ToxSam/open-source-avatars - katalog VRM CC0 (opensourceavatars.com)
- madjin/vrm-samples - sampel model VRoid
- pixiv/three-vrm - loader VRM untuk Three.js (MIT)
- lunarjjo/vtpal - referensi AI VTuber lokal (VRM + lip-sync + TTS)

Selalu periksa lisensi tiap model sebelum dibundel ke repository.
