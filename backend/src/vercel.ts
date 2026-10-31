import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { authMiddleware } from "./middleware/auth.js";
import { buildAutoRouter } from "./autoRouter.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

function normalizeOrigin(value) {
  if (!value?.trim()) return null;
  try { return new URL(/^https?:\/\//i.test(value) ? value : "https://" + value).origin; }
  catch { return null; }
}
const allowedOrigins = new Set([
  process.env.FRONTEND_ORIGIN || "https://max-router.vercel.app",
  process.env.PUBLIC_BASE_URL || "https://max-router.vercel.app",
  ...(process.env.CORS_ORIGINS || "").split(","),
].map(normalizeOrigin).filter(Boolean));

app.use(cors({
  origin: (requestOrigin, callback) => callback(null, !requestOrigin || allowedOrigins.has(normalizeOrigin(requestOrigin))),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-9r-cli-token"],
}));
app.use(cookieParser());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "16mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.FORM_BODY_LIMIT || "1mb" }));

app.get("/api/health", (_req, res) => res.status(200).json({
  status: "ok", ready: true, service: "max-router", version: "3.0.0",
  runtime: "vercel-functions", timestamp: new Date().toISOString(),
}));
app.get("/api/diagnostics", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok", service: "max-router", version: "3.0.0", runtime: "vercel-functions", timestamp: new Date().toISOString() });
});

app.use((req, res, next) => {
  if (req.path === "/api" || req.path.startsWith("/api/") ||
      req.path === "/v1" || req.path.startsWith("/v1/") ||
      req.path === "/v1beta" || req.path.startsWith("/v1beta/")) {
    return authMiddleware(req, res, next);
  }
  return next();
});

let routerPromise;
async function getRouter() {
  if (!routerPromise) routerPromise = buildAutoRouter();
  return routerPromise;
}
app.use(async (req, res, next) => {
  const isApi = req.path === "/api" || req.path.startsWith("/api/");
  const isV1 = req.path === "/v1" || req.path.startsWith("/v1/");
  const isV1beta = req.path === "/v1beta" || req.path.startsWith("/v1beta/");
  if (!isApi && !isV1 && !isV1beta) return next();
  try {
    const router = await getRouter();
    // The auto-router defines ordinary API routes relative to /api, while
    // OpenAI/Gemini compatibility routes are defined with /v1 and /v1beta.
    // Vercel rewrites those public prefixes through this single function.
    if (isApi) req.url = req.url.replace(/^\\/api(?=\\/|$)/, "") || "/";
    return router(req, res, next);
  } catch (error) {
    console.error("[vercel] route initialization failed:", error);
    return res.status(503).json({ error: "API initialization failed" });
  }
});
app.use(["/api", "/v1", "/v1beta"], (_req, res) => res.status(404).json({ error: "Not found" }));
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

export default app;
