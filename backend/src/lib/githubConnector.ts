import crypto from "node:crypto";
import { getAdapter } from "./db/driver.js";

const SCOPE = "githubConnector";
const TOKEN_KEY = "accessToken";
const SECRET = String(process.env.JWT_SECRET || process.env.API_KEY_SECRET || "");
if (!SECRET) console.warn("[github-connector] JWT_SECRET/API_KEY_SECRET belum dikonfigurasi.");

function encryptionKey() {
  if (!SECRET) throw new Error("JWT_SECRET atau API_KEY_SECRET wajib diatur untuk mengenkripsi token GitHub.");
  return crypto.createHash("sha256").update(SECRET).digest();
}

export function encryptGitHubToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptGitHubToken(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Format token GitHub tersimpan tidak valid.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export async function saveGitHubConnection(data: { token: string; login: string; name?: string; avatarUrl?: string; scopes?: string }) {
  const db = await getAdapter();
  const value = JSON.stringify({
    encryptedToken: encryptGitHubToken(data.token),
    login: data.login,
    name: data.name || data.login,
    avatarUrl: data.avatarUrl || "",
    scopes: data.scopes || "",
    connectedAt: new Date().toISOString(),
  });
  await db.run("INSERT INTO kv(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value", [SCOPE, TOKEN_KEY, value]);
}

export async function getGitHubConnection() {
  const db = await getAdapter();
  const row = await db.get("SELECT value FROM kv WHERE scope=? AND key=?", [SCOPE, TOKEN_KEY]);
  if (!row?.value) return null;
  const saved = JSON.parse(row.value);
  return { ...saved, token: decryptGitHubToken(saved.encryptedToken) };
}

export async function removeGitHubConnection() {
  const db = await getAdapter();
  await db.run("DELETE FROM kv WHERE scope=? AND key=?", [SCOPE, TOKEN_KEY]);
}

export async function githubFetch(path: string, init: RequestInit = {}) {
  const connection = await getGitHubConnection();
  if (!connection) throw new Error("GitHub belum terhubung.");
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${connection.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
  if (!response.ok) {
    const error: any = new Error(data.message || `GitHub API HTTP ${response.status}`);
    error.status = response.status;
    error.github = data;
    throw error;
  }
  return data;
}

export function safeGitHubError(error: any) {
  const status = Number(error?.status) || 500;
  return { status: status >= 400 && status < 600 ? status : 500, error: status === 401 ? "Token GitHub tidak valid atau akses dicabut." : error?.message || "GitHub request gagal." };
}
