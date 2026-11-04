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

const MIKA_PALETTE = { bg: "#35224f", hair: "#ff79b0", hair2: "#f45b9c", skin: "#ffe9da", eye: "#4c1d95", accent: "#ffd6e8", outfit: "#7c3aed", line: "#292343", mouth: "#7f1d3a" };
const KURO_PALETTE = { bg: "#1e1533", hair: "#7c3aed", hair2: "#a855f7", skin: "#ffe9da", eye: "#22d3ee", accent: "#c4b5fd", outfit: "#ff79b0", line: "#292343", mouth: "#7f1d3a" };
const HANA_PALETTE = { bg: "#0e2a3a", hair: "#22d3ee", hair2: "#38bdf8", skin: "#ffe9da", eye: "#7c3aed", accent: "#a5f3fc", outfit: "#0ea5e9", line: "#292343", mouth: "#7f1d3a" };

export const CHARACTERS = [
  {
    id: "mika",
    name: "Mika",
    type: "builtin",
    format: "builtin",
    palette: MIKA_PALETTE,
    license: "Bundled - Max Router",
    attribution: "Karakter procedural Max Router",
    allowedUse: ["use", "modify", "redistribute"],
    description: "Asisten utama Max Router. Karakter procedural komik VTuber dengan lip-sync audio.",
    expressions: EMOTIONS.map((e) => e.id),
  },
  {
    id: "kuro",
    name: "Kuro",
    type: "builtin",
    format: "builtin",
    palette: KURO_PALETTE,
    license: "Bundled - Max Router",
    attribution: "Karakter procedural Max Router",
    allowedUse: ["use", "modify", "redistribute"],
    description: "Karakter bertema ungu gelap untuk mode malam dan sesi serius.",
    expressions: EMOTIONS.map((e) => e.id),
  },
  {
    id: "hana",
    name: "Hana",
    type: "builtin",
    format: "builtin",
    palette: HANA_PALETTE,
    license: "Bundled - Max Router",
    attribution: "Karakter procedural Max Router",
    allowedUse: ["use", "modify", "redistribute"],
    description: "Karakter bertema cyan untuk sesi kreatif dan brainstorming.",
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
