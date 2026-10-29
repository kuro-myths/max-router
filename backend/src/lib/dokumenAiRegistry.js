// Registry konsumen "chat-dokumen-ai" (Kuro AI) yang tersinkron dengan router ini.
// Disimpan sebagai file JSON di DATA_DIR — bertahan antar restart, tidak
// menyentuh skema database utama, dan tidak menyimpan API key/kredensial.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./dataDir.js";

const FILE = path.join(DATA_DIR, "dokumen-ai-consumers.json");

function blank() {
  return { consumers: {}, lastSync: null };
}

function isValid(data) {
  return Boolean(
    data
    && typeof data === "object"
    && data.consumers
    && typeof data.consumers === "object"
    && !Array.isArray(data.consumers)
  );
}

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return isValid(parsed) ? parsed : blank();
  } catch {
    return blank();
  }
}

function write(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

/**
 * Daftarkan / perbarui satu konsumen. Identitas = base URL aplikasi konsumen.
 * Entry lama dengan base URL sama akan ditimpa (lastSeen diperbarui).
 */
export function registerConsumer(entry) {
  const db = read();
  const baseUrl = String(entry?.baseUrl || "").trim();
  const id = baseUrl || entry?.id || "local-app";
  const previous = db.consumers[id] || {};
  const now = new Date().toISOString();
  db.consumers[id] = {
    id,
    baseUrl,
    app: entry?.app || "chat-dokumen-ai",
    name: entry?.name || null,
    mode: entry?.mode || null, // 'gemini' | 'manual' (dropdown di Kuro AI)
    model: entry?.model || null,
    registeredAt: previous.registeredAt || now,
    lastSeen: now,
  };
  db.lastSync = now;
  write(db);
  return db.consumers[id];
}

/** Semua konsumen terdaftar. */
export function getConsumers() {
  return Object.values(read().consumers);
}

/** Waktu sinkron terakhir (ISO string) atau null. */
export function getLastSync() {
  return read().lastSync;
}
