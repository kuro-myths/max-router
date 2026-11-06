import crypto from "node:crypto";
import { getAdapter } from "../../../../../lib/db/driver.js";

export async function GET_handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const clientId = String(process.env.GITHUB_CLIENT_ID || "").trim();
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET) {
    return res.status(503).json({ error: "GitHub OAuth belum dikonfigurasi. Set GITHUB_CLIENT_ID dan GITHUB_CLIENT_SECRET di environment backend." });
  }
  const base = String(process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  const redirectUri = `${base}/api/connectors/github/oauth/callback`;
  const state = crypto.randomBytes(32).toString("hex");
  const db = await getAdapter();
  await db.run("INSERT INTO kv(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value", [
    "githubOAuth", state, JSON.stringify({ redirectUri, createdAt: Date.now() }),
  ]);
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: "repo read:user", state });
  return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}
