/**
 * Kiro Device Store — registry perangkat Kiro + antrean perintah.
 *
 * Penyimpanan memakai tabel `kv` yang sudah ada (scope "kiro-devices"),
 * sehingga tidak perlu migrasi skema dan otomatis kompatibel dengan
 * SQLite (lokal) maupun PostgreSQL/Supabase (Vercel).
 *
 * Arsitektur:
 *   Dashboard (Vercel)  ->  enqueueCommand()  ->  antrean per device
 *   Bridge lokal (PC)   ->  pollDevice()       ->  menerima + melaporkan hasil
 */
import crypto from "crypto";
import { getAdapter } from "./db/driver.js";

const SCOPE = "kiro-devices";
const DEVICES_KEY = "devices";
const COMMANDS_KEY = (deviceId) => `commands:${deviceId}`;

export const ONLINE_WINDOW_MS = 30_000;
const MAX_COMMAND_AGE_MS = 10 * 60_000;
const MAX_PENDING_COMMANDS = 20;
const MAX_RESULTS_KEPT = 15;

const ALLOWED_COMMANDS = new Set([
  "launch-kiro",
  "close-kiro",
  "open-url",
  "start-mitm",
  "stop-mitm",
  "ping",
]);

async function readJson(db, key, fallback) {
  try {
    const row = await db.get("SELECT value FROM kv WHERE scope = ? AND key = ?", [SCOPE, key]);
    if (!row?.value) return fallback;
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

async function writeJson(db, key, value) {
  // Dialek-netral (SQLite & Postgres): hapus lalu insert.
  await db.run("DELETE FROM kv WHERE scope = ? AND key = ?", [SCOPE, key]);
  await db.run("INSERT INTO kv (scope, key, value) VALUES (?, ?, ?)", [SCOPE, key, JSON.stringify(value)]);
}

export function isAllowedCommand(type) {
  return ALLOWED_COMMANDS.has(type);
}

export async function listDevices() {
  const db = await getAdapter();
  const devices = await readJson(db, DEVICES_KEY, []);
  const now = Date.now();
  return devices
    .map((d) => ({
      ...d,
      online: d.lastSeenAt ? now - d.lastSeenAt < ONLINE_WINDOW_MS : false,
    }))
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
}

export async function getDevice(deviceId) {
  if (!deviceId) return null;
  const devices = await listDevices();
  return devices.find((d) => d.id === deviceId) || null;
}

/**
 * Dipanggil oleh bridge lokal setiap beberapa detik.
 * Mengembalikan daftar perintah yang tertunda dan mengosongkan antrean.
 */
export async function pollDevice({ deviceId, name, platform, version, status, results }) {
  if (!deviceId || typeof deviceId !== "string" || deviceId.length > 128) {
    throw new Error("deviceId wajib berupa string yang valid");
  }
  const db = await getAdapter();
  const now = Date.now();

  let devices = await readJson(db, DEVICES_KEY, []);
  let device = devices.find((d) => d.id === deviceId);
  if (!device) {
    device = { id: deviceId, createdAt: now };
    devices.push(device);
  }
  if (typeof name === "string" && name.trim()) device.name = name.trim().slice(0, 120);
  if (typeof platform === "string" && platform.trim()) device.platform = platform.trim().slice(0, 64);
  if (typeof version === "string" && version.trim()) device.bridgeVersion = version.trim().slice(0, 32);
  if (status && typeof status === "object") {
    if (typeof status.kiroRunning === "boolean") device.kiroRunning = status.kiroRunning;
    if (typeof status.mitmActive === "boolean") device.mitmActive = status.mitmActive;
    if (typeof status.mitmPort === "number") device.mitmPort = status.mitmPort;
    if (typeof status.kiroPath === "string") device.kiroPath = status.kiroPath;
  }
  device.lastSeenAt = now;

  // Simpan hasil eksekusi perintah terakhir (dilaporkan bridge).
  if (Array.isArray(results) && results.length > 0) {
    const prev = Array.isArray(device.results) ? device.results : [];
    device.results = [...results.slice(-MAX_RESULTS_KEPT), ...prev].slice(0, MAX_RESULTS_KEPT);
  }

  await writeJson(db, DEVICES_KEY, devices);

  // Ambil & kosongkan antrean perintah.
  const commands = await readJson(db, COMMANDS_KEY(deviceId), []);
  const fresh = (commands || []).filter((c) => now - (c.createdAt || 0) < MAX_COMMAND_AGE_MS);
  if (commands.length > 0) await writeJson(db, COMMANDS_KEY(deviceId), []);
  return { commands: fresh };
}

export async function enqueueCommand(deviceId, type, payload = {}) {
  if (!deviceId) throw new Error("deviceId wajib diisi");
  if (!isAllowedCommand(type)) throw new Error(`Perintah tidak dikenal: ${type}`);
  const db = await getAdapter();
  const devices = await readJson(db, DEVICES_KEY, []);
  if (!devices.some((d) => d.id === deviceId)) {
    throw new Error("Perangkat tidak ditemukan / belum terhubung");
  }
  const commands = (await readJson(db, COMMANDS_KEY(deviceId), [])).slice(-MAX_PENDING_COMMANDS);
  commands.push({
    id: crypto.randomUUID(),
    type,
    payload: payload && typeof payload === "object" ? payload : {},
    createdAt: Date.now(),
  });
  await writeJson(db, COMMANDS_KEY(deviceId), commands);
  return commands[commands.length - 1];
}
