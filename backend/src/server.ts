import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { authMiddleware } from "./middleware/auth.js";
import { buildAutoRouter } from "./autoRouter.js";
import { resumeModelTestJobs } from "./lib/modelTestWorker.js";

const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5177";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

const app = express();
// Railway berada di belakang reverse proxy. Percayai satu hop agar Express
// membaca protokol/host asli dengan benar untuk cookie dan redirect.
app.set("trust proxy", 1);

// Lightweight in-process diagnostics. Never store request bodies, tokens, cookies,
// API keys, or other credentials here. These entries are intentionally bounded.
type RuntimeError = { timestamp: string; type: string; message: string; stack?: string };
const runtimeErrors: RuntimeError[] = [];
let startupReady = false;
const pushRuntimeError = (type: string, error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  runtimeErrors.push({
    timestamp: new Date().toISOString(),
    type,
    message: err.message,
    stack: err.stack,
  });
  if (runtimeErrors.length > 50) runtimeErrors.shift();
};

process.on("unhandledRejection", (reason) => {
  pushRuntimeError("unhandledRejection", reason);
  console.error("[runtime] unhandledRejection:", reason);
});
process.on("uncaughtException", (error) => {
  pushRuntimeError("uncaughtException", error);
  console.error("[runtime] uncaughtException:", error);
  process.exit(1);
});

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Never reflect arbitrary Origin values when credentialed cookies are enabled.
function normalizedOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const input = /^https?:\/\//i.test(value) ? value : "https://" + value;
    return new URL(input).origin;
  } catch {
    return null;
  }
}
const configuredOrigins = [
  FRONTEND_ORIGIN,
  process.env.PUBLIC_BASE_URL,
  process.env.RAILWAY_PUBLIC_DOMAIN,
  process.env.RAILWAY_STATIC_URL,
  ...(process.env.CORS_ORIGINS || "").split(","),
].map((value) => normalizedOrigin(value)).filter((value): value is string => Boolean(value));
const allowedOrigins = new Set(configuredOrigins);
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.add("http://localhost:5177");
  allowedOrigins.add("http://127.0.0.1:5177");
}
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    return callback(null, allowedOrigins.has(normalizedOrigin(origin) || ""));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-9r-cli-token"],
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// Keep default request memory use bounded. Raise JSON_BODY_LIMIT explicitly only
// when the deployment intentionally accepts very large JSON payloads.
app.use(cookieParser());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "16mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.FORM_BODY_LIMIT || "1mb" }));

// ─── Health Check (no auth) ────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: startupReady ? "ok" : "starting",
    ready: startupReady,
    version: "3.0.0",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Minimal public diagnostics only. Runtime errors, stack traces, host details,
// process identifiers and memory statistics stay in protected server logs.
app.get("/api/diagnostics", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    status: startupReady ? "ok" : "starting",
    service: "max-router",
    version: "3.0.0",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    ready: startupReady,
  });
});

// ─── Auth Middleware ───────────────────────────────────────────────────────────
// Authentication only applies to API/proxy traffic. Applying it globally would
// prevent the login page and SPA assets from loading when login is required.
app.use((req, res, next) => {
  if (
    req.path === "/api" ||
    req.path.startsWith("/api/") ||
    req.path === "/v1" ||
    req.path.startsWith("/v1/") ||
    req.path === "/v1beta" ||
    req.path.startsWith("/v1beta/")
  ) {
    return authMiddleware(req, res, next);
  }
  return next();
});

// ─── Auto-mount all routes ────────────────────────────────────────────────────
async function start() {
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("\n[server] 9Router V3 Backend listening on 0.0.0.0:" + PORT);
    console.log("   Frontend origin: " + FRONTEND_ORIGIN);
    console.log("   Environment: " + (process.env.NODE_ENV || "development"));
  });

  let apiRouter;
  try {
    apiRouter = await buildAutoRouter();
  } catch (err) {
    pushRuntimeError("startup", err);
    console.error("[startup] Route graph failed; shutting down so the deployment cannot report a false healthy state.");
    console.error(err);
    server.close(() => process.exit(1));
    return server;
  }

  startupReady = true;
  console.log("[startup] Route graph ready.");
  resumeModelTestJobs().catch((err) => console.error("[model-test-worker] startup resume gagal:", err));
  app.use("/api", (req, res, next) => {
    console.log("API request:", req.method, req.path);
    apiRouter(req, res, next);
  });

  // LLM proxy remaps: /v1/* → /api/v1/*
  app.use("/v1", (req, res, next) => {
    req.url = "/v1" + req.url;
    apiRouter(req, res, next);
  });
  app.use("/v1beta", (req, res, next) => {
    req.url = "/v1beta" + req.url;
    apiRouter(req, res, next);
  });

  app.use(["/api", "/v1", "/v1beta"], (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Serve the production SPA from the same origin as the API.
  app.use(express.static(FRONTEND_DIST, { index: false, redirect: false }));
  app.use((req, res, next) => {
    if (req.method === "GET" && req.accepts("html")) {
      return res.sendFile(path.join(FRONTEND_DIST, "index.html"));
    }
    return next();
  });

  // ─── 404 Fallback ──────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  // ─── Error Handler ─────────────────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    pushRuntimeError("request", err);
    console.error("[server] unhandled error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });

}

start().catch((err) => {
  pushRuntimeError("startup", err);
  console.error("Failed to start server:", err);
  process.exit(1);
});

export { app };
