import { Request, Response, NextFunction } from "express";
import { verifyDashboardAuthToken } from "../lib/auth/dashboardSession.js";
import { getSettings, validateApiKey } from "../lib/localDb.js";
import { getConsistentMachineId } from "../shared/utils/machineId.js";

const CLI_TOKEN_HEADER = "x-9r-cli-token";
const CLI_TOKEN_SALT = "9r-cli-auth";

let cachedCliToken: string | null = null;
async function getCliToken() {
  if (!cachedCliToken) cachedCliToken = await getConsistentMachineId(CLI_TOKEN_SALT);
  return cachedCliToken;
}

async function hasValidCliToken(req: Request) {
  const token = req.headers[CLI_TOKEN_HEADER] as string | undefined;
  if (!token) return false;
  return token === (await getCliToken());
}

const PUBLIC_API_PATHS = [
  "/api/health",
  "/api/init",
  "/api/locale",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
  "/api/version",
  "/api/settings/require-login",
  "/api/automation/ammail/webhook",
  "/api/email/oauth/gmail/start",
  "/api/email/oauth/gmail/callback",
];

const PUBLIC_PREFIXES = ["/v1", "/v1beta", "/api/v1", "/api/v1beta"];

const ALWAYS_PROTECTED = [
  "/api/shutdown",
  "/api/settings/database",
  "/api/version/shutdown",
  "/api/version/update",
];

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const path = req.path;

  // Read-only combo metadata is exposed so MAX Editor can sync combo names/models\n  // without requiring a dashboard cookie from a different browser origin.\n  // Keep every write operation on /api/combos protected by the normal auth checks.\n  if (path === "/api/combos" && req.method === "GET") return next();\n\n  if (PUBLIC_API_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return next();
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return next();
  if (await hasValidCliToken(req)) return next();

  const alwaysProtected = ALWAYS_PROTECTED.some(
    (p) => path === p || path.startsWith(p + "/")
  );

  try {
    const settings = await getSettings();
    const requireLogin = settings?.requireLogin === true;

    const token = req.cookies?.["9r_session"];
    if (token) {
      const valid = await verifyDashboardAuthToken(token);
      if (valid) return next();
    }

    if (!requireLogin && !alwaysProtected) return next();

    const apiKey = (req.headers["x-api-key"] ||
      req.headers["authorization"]?.replace(/^Bearer\s+/i, "")) as string | undefined;

    if (apiKey && await validateApiKey(apiKey)) return next();

    const reason = token ? "session_invalid" : "session_missing";
    console.warn(
      "[auth] 401",
      JSON.stringify({ path, method: req.method, reason, requireLogin, hasApiKey: Boolean(apiKey) })
    );

    return res.status(401).json({
      error: "Unauthorized",
      reason,
      requireLogin,
      hint: reason === "session_missing"
        ? "Cookie 9r_session tidak diterima oleh server."
        : "Cookie 9r_session ada tetapi tidak valid.",
    });
  } catch (err) {
    console.error("[auth]", err);
    return res.status(500).json({ error: "Auth error" });
  }
}
