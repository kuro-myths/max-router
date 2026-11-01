/**
 * MCP Manager Store — registry server MCP (Model Context Protocol) di cloud.
 * Disimpan di tabel `kv` (scope "mcp-manager"), kompatibel SQLite lokal
 * maupun PostgreSQL/Supabase di Vercel — tanpa migrasi skema.
 *
 * Mendukung:
 *   - CRUD server MCP (transport http / sse / stdio)
 *   - Probe: inisialisasi JSON-RPC + tools/list ("membaca" tools server)
 *   - Call: tools/call (menjalankan tool dari dashboard)
 */
import crypto from "crypto";
import { getAdapter } from "./db/driver.js";

const SCOPE = "mcp-manager";
const SERVERS_KEY = "servers";
const MAX_SERVERS = 200;

const TRANSPORTS = new Set(["http", "sse", "stdio"]);
const REQUIRED_STDIO_BINARIES = new Set(["npx", "node", "uvx", "python", "python3", "bunx", "docker"]);

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
  await db.run("DELETE FROM kv WHERE scope = ? AND key = ?", [SCOPE, key]);
  await db.run("INSERT INTO kv (scope, key, value) VALUES (?, ?, ?)", [SCOPE, key, JSON.stringify(value)]);
}

function sanitizeServer(input, existing = null) {
  const merge = { ...(existing || {}), ...(input || {}) };
  const errors = [];

  const name = String(merge.name || "").trim();
  if (!name) errors.push("name wajib diisi");
  if (name.length > 100) errors.push("name maksimal 100 karakter");

  const transport = String(merge.transport || "http").trim().toLowerCase();
  if (!TRANSPORTS.has(transport)) errors.push(`transport harus salah satu: ${[...TRANSPORTS].join(", ")}`);

  let url = null;
  if (transport === "http" || transport === "sse") {
    url = String(merge.url || "").trim();
    if (!/^https?:\/\//i.test(url)) errors.push("url harus dimulai dengan http:// atau https://");
  }

  let command = null;
  let args = [];
  if (transport === "stdio") {
    command = String(merge.command || "").trim();
    const bin = command.split(/\s+/)[0];
    if (!command) errors.push("command wajib diisi untuk transport stdio");
    else if (!REQUIRED_STDIO_BINARIES.has(bin)) {
      errors.push(`command stdio hanya boleh biner aman: ${[...REQUIRED_STDIO_BINARIES].join(", ")}`);
    }
    args = Array.isArray(merge.args) ? merge.args.map(String).slice(0, 50) : [];
  }

  let headers = {};
  if (merge.headers && typeof merge.headers === "object" && !Array.isArray(merge.headers)) {
    for (const [k, v] of Object.entries(merge.headers).slice(0, 30)) {
      if (typeof k === "string" && k.trim() && typeof v === "string") headers[k.trim()] = v;
    }
  }

  if (errors.length) throw new Error(errors.join("; "));

  return {
    id: merge.id || crypto.randomUUID(),
    name,
    description: typeof merge.description === "string" ? merge.description.slice(0, 500) : "",
    transport,
    url,
    command,
    args,
    headers,
    enabled: merge.enabled !== false,
    createdAt: merge.createdAt || Date.now(),
    updatedAt: Date.now(),
    lastProbe: merge.lastProbe || null, // { at, ok, toolCount, error }
  };
}

export async function listServers() {
  const db = await getAdapter();
  const servers = await readJson(db, SERVERS_KEY, []);
  return servers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getServer(id) {
  if (!id) return null;
  const servers = await listServers();
  return servers.find((s) => s.id === id) || null;
}

export async function createServer(input) {
  const db = await getAdapter();
  const servers = await readJson(db, SERVERS_KEY, []);
  if (servers.length >= MAX_SERVERS) throw new Error(`Maksimal ${MAX_SERVERS} server MCP`);
  const server = sanitizeServer(input);
  servers.push(server);
  await writeJson(db, SERVERS_KEY, servers);
  return server;
}

export async function updateServer(id, input) {
  const db = await getAdapter();
  const servers = await readJson(db, SERVERS_KEY, []);
  const index = servers.findIndex((s) => s.id === id);
  if (index < 0) throw new Error("Server MCP tidak ditemukan");
  const merged = sanitizeServer(input, servers[index]);
  servers[index] = merged;
  await writeJson(db, SERVERS_KEY, servers);
  return merged;
}

export async function deleteServer(id) {
  const db = await getAdapter();
  const servers = await readJson(db, SERVERS_KEY, []);
  const next = servers.filter((s) => s.id !== id);
  if (next.length === servers.length) throw new Error("Server MCP tidak ditemukan");
  await writeJson(db, SERVERS_KEY, next);
  return { deleted: 1 };
}

async function saveProbe(id, probe) {
  const db = await getAdapter();
  const servers = await readJson(db, SERVERS_KEY, []);
  const index = servers.findIndex((s) => s.id === id);
  if (index < 0) return;
  servers[index].lastProbe = probe;
  await writeJson(db, SERVERS_KEY, servers);
}

/**
 * Kirim JSON-RPC ke server MCP transport HTTP (Streamable HTTP / RPC-over-HTTP).
 * Server SSE murni & stdio tidak bisa diprobe dari serverless — dikembalikan
 * penjelasan agar dijalankan lewat bridge lokal.
 */
async function rpc(server, method, params, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(server.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...server.headers,
        ...extraHeaders,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") || "";
    let payload = null;
    if (contentType.includes("text/event-stream")) {
      // Ambil frame JSON pertama dari stream SSE.
      const text = await res.text();
      const match = text.match(/^data:\s*(\{.*\})\s*$/m);
      if (match) payload = JSON.parse(match[1]);
    } else {
      payload = await res.json().catch(() => null);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(payload)?.slice(0, 200) || res.statusText}`);
    }
    if (!payload) throw new Error("Respons server bukan JSON/SSE yang valid");
    if (payload.error) throw new Error(payload.error.message || "Server MCP mengembalikan error");
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

/** Inisialisasi sesi + ambil daftar tools. */
export async function probeServer(server) {
  if (server.transport === "stdio") {
    return { ok: false, localOnly: true, error: "Server stdio harus dijalankan di komputer lokal (Kiro Bridge), bukan di cloud." };
  }
  if (server.transport === "sse") {
    return { ok: false, localOnly: false, error: "Transport SSE murni memerlukan koneksi persisten — gunakan endpoint streamable HTTP bila tersedia." };
  }
  try {
    const init = await rpc(server, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "max-router", version: "3.0.0" },
    });
    // Notification initialized (tanpa id) — sebagian server wajib, tapi abaikan error.
    try {
      await fetch(server.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...server.headers },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });
    } catch { /* best effort */ }
    const sessionHeader = init?._meta?.sessionId ? { "Mcp-Session-Id": init._meta.sessionId } : {};
    const toolsResult = await rpc(server, "tools/list", {}, sessionHeader);
    const tools = (toolsResult?.tools || []).map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema || null,
    }));
    return { ok: true, serverInfo: init?.serverInfo || null, tools };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function probeServerById(id) {
  const server = await getServer(id);
  if (!server) throw new Error("Server MCP tidak ditemukan");
  const result = await probeServer(server);
  await saveProbe(id, {
    at: Date.now(),
    ok: result.ok,
    toolCount: result.tools?.length || 0,
    error: result.error || null,
  });
  return result;
}

/** Panggil sebuah tool di server MCP. */
export async function callTool(server, toolName, toolArgs) {
  if (server.transport !== "http") {
    throw new Error("Pemanggilan tool dari cloud hanya didukung untuk transport http");
  }
  const init = await rpc(server, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "max-router", version: "3.0.0" },
  });
  const sessionHeader = init?._meta?.sessionId ? { "Mcp-Session-Id": init._meta.sessionId } : {};
  const result = await rpc(server, "tools/call", {
    name: toolName,
    arguments: toolArgs && typeof toolArgs === "object" ? toolArgs : {},
  }, sessionHeader);
  return result; // { content: [...], isError? }
}

export async function callToolById(id, toolName, toolArgs) {
  const server = await getServer(id);
  if (!server) throw new Error("Server MCP tidak ditemukan");
  if (!toolName || typeof toolName !== "string") throw new Error("Nama tool wajib diisi");
  return callTool(server, toolName, toolArgs);
}
