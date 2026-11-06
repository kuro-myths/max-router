export const EMOTIONS = [
  { id: "neutral", label: "Netral", gesture: "idle" },
  { id: "happy", label: "Senang", gesture: "wave" },
  { id: "sad", label: "Sedih", gesture: "look_down" },
  { id: "angry", label: "Marah", gesture: "shake" },
  { id: "surprised", label: "Terkejut", gesture: "jump" },
  { id: "thinking", label: "Berpikir", gesture: "think" },
  { id: "shy", label: "Malu", gesture: "cover_face" },
  { id: "excited", label: "Antusias", gesture: "bounce" },
];

const MIKA_PALETTE = { bg: "#f2eaff", hair: "#25243c", hair2: "#3159b8", skin: "#ffe9df", eye: "#5552a5", accent: "#d8e3ff", outfit: "#3159b8", line: "#292343", mouth: "#572b3d" };

export const CHARACTERS = [
  {
    id: "mika",
    name: "Kuro — Mahasiswa Magang",
    type: "builtin",
    format: "builtin",
    palette: MIKA_PALETTE,
    license: "Bundled - Max Router",
    attribution: "Aset PSD karakter yang diunggah pemilik Max Router",
    allowedUse: ["use", "modify", "redistribute"],
    description: "Karakter VTuber Kuro dari PSD berlapis: rambut hitam-biru, mata ungu, kemeja, dasi, dan jaket biru. Sprite tampil konsisten di dashboard, Chat, dan Voice AI.",
    expressions: EMOTIONS.map((e) => e.id),
  },
  {
    id: "osa",
    name: "Open Source Avatars (300+ model VRM)",
    type: "catalog",
    format: "vrm",
    sourceName: "ToxSam/open-source-avatars",
    sourceUrl: "https://github.com/ToxSam/open-source-avatars",
    downloadUrl: "https://www.opensourceavatars.com/en/gallery",
    license: "CC0 (per model)",
    attribution: "Cek halaman tiap model",
    allowedUse: ["use", "modify", "redistribute", "commercial"],
    description: "Katalog avatar 3D VRM berlisensi CC0 untuk VTubing, game, dan metaverse.",
  },
  {
    id: "vrm-samples",
    name: "VRM Samples (VRoid)",
    type: "catalog",
    format: "vrm",
    sourceName: "madjin/vrm-samples",
    sourceUrl: "https://github.com/madjin/vrm-samples",
    downloadUrl: "https://github.com/madjin/vrm-samples",
    license: "Per model - cek LICENSE",
    attribution: "Cek tiap folder model",
    allowedUse: ["use"],
    description: "Kumpulan model sampel VRoid untuk pengujian loader VRM.",
  },
  {
    id: "three-vrm",
    name: "pixiv three-vrm (contoh resmi)",
    type: "catalog",
    format: "vrm",
    sourceName: "pixiv/three-vrm",
    sourceUrl: "https://github.com/pixiv/three-vrm",
    downloadUrl: "https://github.com/pixiv/three-vrm",
    license: "MIT (kode) / per-model (model)",
    attribution: "pixiv Inc.",
    allowedUse: ["use", "modify"],
    description: "Referensi loader VRM resmi untuk Three.js beserta model contoh.",
  },
  {
    id: "vtpal-ref",
    name: "VTPal (referensi AI VTuber)",
    type: "reference",
    format: "vrm",
    sourceName: "lunarjjo/vtpal",
    sourceUrl: "https://github.com/lunarjjo/vtpal",
    downloadUrl: "https://github.com/lunarjjo/vtpal",
    license: "Cek repo",
    attribution: "lunarjjo",
    allowedUse: ["use"],
    description: "Referensi implementasi AI VTuber lokal: VRM, lip-sync, TTS, dan memori percakapan.",
  },
];

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

const STORAGE_KEY = "maxrouter.vtuber.selected";

export function loadSelectedCharacter() {
  try {
    const id = window.localStorage.getItem(STORAGE_KEY);
    const found = id ? CHARACTERS.find((c) => c.id === id) : null;
    return found || CHARACTERS[0];
  } catch {
    return CHARACTERS[0];
  }
}

export function saveSelectedCharacter(id) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage tidak tersedia - abaikan */
  }
}
