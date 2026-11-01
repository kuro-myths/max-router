#!/usr/bin/env node
/**
 * Max Router Kiro Bridge — companion lokal untuk dashboard Max Router di Vercel.
 *
 * Menjembatani dashboard online (Vercel) dengan komputer tempat Kiro berjalan:
 *   1. Bridge mendaftarkan perangkat ini ke dashboard (poll berkala).
 *   2. Tombol "Buka Kiro" / "Start MITM" di dashboard mengirim perintah
 *      ke antrean; bridge mengeksekusinya secara lokal.
 *   3. "start-mitm" menjalankan proxy lokal yang meneruskan request AI ke
 *      endpoint Max Router (https://...vercel.app/v1/...) dengan API key.
 *
 * Persyaratan: Node.js 18+ (tanpa dependensi tambahan).
 *
 * Penggunaan:
 *   set MAXROUTER_URL=https://max-router.vercel.app
 *   set MAXROUTER_API_KEY=sk-...          (dari halaman Keys dashboard)
 *   node scripts/kiro-device-bridge.mjs
 *
 * Variabel opsional:
 *   DEVICE_NAME, KIRO_PATH, MITM_PORT (default 8899), POLL_MS (default 4000)
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=")];
  })
);

const ROUTER_URL = (args.url || process.env.MAXROUTER_URL || "").replace(/\/+$/, "");
const API_KEY = args.key || process.env.MAXROUTER_API_KEY || "";
const DEVICE_NAME = args.name || process.env.DEVICE_NAME || os.hostname();
const POLL_MS = Math.max(2000, Number(args.poll || process.env.POLL_MS || 4000));
const MITM_PORT = Number(args.mitmPort || process.env.MITM_PORT || 8899);

if (!ROUTER_URL || !API_KEY) {
  console.error("[bridge] MAXROUTER_URL dan MAXROUTER_API_KEY wajib diisi.");
  console.error("           Contoh: node scripts/kiro-device-bridge.mjs --url=https://max-router.vercel.app --key=sk-...");
  process.exit(1);
}

const BRIDGE_VERSION = "1.0.0";
const STATE_DIR = path.join(os.homedir(), ".max-router");
const STATE_FILE = path.join(STATE_DIR, "kiro-bridge-device.json");

function loadDeviceId() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (data?.deviceId) return data.deviceId;
  } catch {}
  const deviceId = crypto.randomUUID();
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ deviceId, createdAt: new Date().toISOString() }, null, 2));
  } catch {}
  return deviceId;
}

const deviceId = loadDeviceId();
const state = { kiroRunning: false, mitmActive: false, kiroPath: null, results: [], mitmServer: null };

/* ---------- util OS ---------- */

function findKiroExecutable() {
  const candidatesByPlatform = {
    win32: [
      process.env.KIRO_PATH,
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Kiro", "Kiro.exe"),
      "C:\\Program Files\\Kiro\\Kiro.exe",
      "C:\\Program Files (x86)\\Kiro\\Kiro.exe",
    ].filter(Boolean),
    darwin: [process.env.KIRO_PATH, "/Applications/Kiro.app/Contents/MacOS/Kiro"].filter(Boolean),
    linux: [process.env.KIRO_PATH, "/usr/bin/kiro", "/usr/local/bin/kiro", path.join(os.homedir(), ".local", "bin", "kiro")].filter(Boolean),
  };
  const candidates = candidatesByPlatform[process.platform] || [];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return null;
}

function launchKiro(customPath) {
  const exe = (customPath && fs.existsSync(customPath) && customPath) || findKiroExecutable();
  if (!exe) {
    const hint = process.platform === "win32"
      ? "Tidak menemukan Kiro.exe. Set env KIRO_PATH ke lokasi Kiro.exe lalu jalankan ulang bridge."
      : "Tidak menemukan executable Kiro. Set env KIRO_PATH ke lokasi Kiro lalu jalankan ulang bridge.";
    throw new Error(hint);
  }
  state.kiroPath = exe;
  if (process.platform === "darwin" && exe.endsWith(".app")) {
    spawn("open", ["-a", exe], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn(exe, [], { detached: true, stdio: "ignore", cwd: path.dirname(exe) }).unref();
  }
  state.kiroRunning = true;
  return { path: exe };
}

function closeKiro() {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/IM", "Kiro.exe", "/F"]);
  } else {
    spawnSync("pkill", ["-f", "[Kk]iro"]);
  }
  state.kiroRunning = false;
  return {};
}

function openUrl(url) {
  if (!/^https?:\/\//i.test(url || "")) throw new Error("URL tidak valid");
  if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  return {};
}

/* ---------- proxy MITM (HTTP gateway ke Max Router) ---------- */

function startMitm() {
  if (state.mitmActive) return { port: MITM_PORT, alreadyActive: true };
  const server = http.createServer((req, clientRes) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const target = new URL(req.url, ROUTER_URL);
      const headers = { ...req.headers, host: target.hostname };
      headers["x-api-key"] = API_KEY;
      const transport = target.protocol === "https:" ? https : http;
      const proxyReq = transport.request(
        {
          hostname: target.hostname,
          port: target.port || 443,
          protocol: target.protocol,
          path: target.pathname + target.search,
          method: req.method,
          headers,
        },
        (upstreamRes) => {
          clientRes.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
          upstreamRes.pipe(clientRes);
        }
      );
      proxyReq.on("error", (err) => {
        clientRes.writeHead(502, { "Content-Type": "application/json" });
        clientRes.end(JSON.stringify({ error: "Upstream error", detail: err.message }));
      });
      proxyReq.end(Buffer.concat(chunks));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(MITM_PORT, "127.0.0.1", () => {
      state.mitmServer = server;
      state.mitmActive = true;
      resolve({ port: MITM_PORT });
    });
  });
}

function stopMitm() {
  if (state.mitmServer) {
    state.mitmServer.close();
    state.mitmServer = null;
  }
  state.mitmActive = false;
  return {};
}

/* ---------- eksekusi perintah ---------- */

async function executeCommand(command) {
  const payload = command.payload || {};
  switch (command.type) {
    case "launch-kiro": return launchKiro(payload.path);
    case "close-kiro": return closeKiro();
    case "open-url": return openUrl(payload.url);
    case "start-mitm": return await startMitm();
    case "stop-mitm": return stopMitm();
    case "ping": return { pong: true, time: new Date().toISOString() };
    default: throw new Error(`Perintah tidak dikenal: ${command.type}`);
  }
}

/* ---------- polling loop ---------- */

async function poll() {
  const body = {
    deviceId,
    name: DEVICE_NAME,
    platform: `${process.platform}/${process.arch}`,
    version: BRIDGE_VERSION,
    status: {
      kiroRunning: state.kiroRunning,
      mitmActive: state.mitmActive,
      mitmPort: state.mitmActive ? MITM_PORT : undefined,
      kiroPath: state.kiroPath,
    },
    results: state.results.splice(0, state.results.length),
  };
  const res = await fetch(`${ROUTER_URL}/api/kiro-devices/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function mainLoop() {
  console.log(`[bridge] Max Router Kiro Bridge v${BRIDGE_VERSION}`);
  console.log(`[bridge] Router   : ${ROUTER_URL}`);
  console.log(`[bridge] Perangkat: ${DEVICE_NAME} (${deviceId})`);
  console.log("[bridge] Menunggu perintah dari dashboard... (Ctrl+C untuk berhenti)");

  for (;;) {
    let commands = [];
    try {
      const data = await poll();
      commands = data.commands || [];
    } catch (error) {
      console.error(`[bridge] Poll gagal: ${error.message} — mencoba lagi...`);
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }

    for (const command of commands) {
      console.log(`[bridge] Perintah: ${command.type}`);
      let result = { commandId: command.id, type: command.type, at: new Date().toISOString() };
      try {
        result.ok = true;
        result.data = await executeCommand(command);
        console.log(`[bridge] ✓ ${command.type} berhasil`, result.data ?? "");
      } catch (error) {
        result.ok = false;
        result.error = error.message;
        console.error(`[bridge] ✗ ${command.type} gagal: ${error.message}`);
      }
      state.results.push(result);
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

mainLoop().catch((error) => {
  console.error("[bridge] Berhenti:", error);
  process.exit(1);
});
