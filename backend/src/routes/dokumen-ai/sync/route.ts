// GET  /api/dokumen-ai/sync — info sinkron terakhir + daftar konsumen terdaftar.
// POST /api/dokumen-ai/sync — dipanggil chat-dokumen-ai (Kuro AI) untuk:
//   1. mendaftarkan dirinya sebagai konsumen router ini (base URL + mode);
//   2. menarik daftar model terbaru (OpenAI-compatible) dan model `working`
//      terbaik dari model health ledger.
// Dengan begini router dan aplikasi dokumen AI selalu sinkron, dan Kuro AI
// otomatis memakai router aktif — online (Railway) maupun lokal.
import { buildModelsList } from "../../v1/models/route.js";
import { getModelHealthReport } from "../../../lib/modelHealth/index.js";
import { registerConsumer, getConsumers, getLastSync } from "../../../lib/dokumenAiRegistry.js";

export const dynamic = "force-dynamic";

export async function GET(req: any, res: any) {
  res.json({
    ok: true,
    service: "max-router",
    scope: process.env.RAILWAY_PUBLIC_DOMAIN ? "online" : "local",
    lastSync: getLastSync(),
    consumers: getConsumers(),
    hint: "POST { base_url, mode, model } untuk mendaftarkan konsumen dan menarik model.",
  });
}

export async function POST(req: any, res: any) {
  try {
    const body = req.body || {};
    const consumer = registerConsumer({
      app: String(body.app || "chat-dokumen-ai"),
      name: body.name ? String(body.name) : null,
      baseUrl: String(body.base_url || "").trim(),
      mode: ["gemini", "manual"].includes(body.mode) ? body.mode : null,
      model: body.model ? String(body.model) : null,
    });

    // Daftar model LLM (OpenAI-compatible) yang bisa dipakai Kuro AI
    // lewat driver openai-compatible + base URL router ini.
    const models = await buildModelsList(["llm"]);

    // Model working terbaik dari model health ledger (opsional —
    // instance tanpa ledger/DB tetap bisa sinkron model list).
    let best = null;
    try {
      const report = await getModelHealthReport({ status: "working", limit: "10" });
      best = report?.best || null;
    } catch {
      // ledger belum siap / tidak tersedia — biarkan null
    }

    res.json({
      ok: true,
      service: "max-router",
      scope: process.env.RAILWAY_PUBLIC_DOMAIN ? "online" : "local",
      syncedAt: new Date().toISOString(),
      consumer,
      best,
      modelCount: models.length,
      models: models.map((m) => m.id).slice(0, 500),
      chatEndpoint: "/v1/chat/completions",
      hint: "Pakai model id di atas di POST /v1/chat/completions "
        + "(driver openai-compatible, base URL = URL router ini + /v1).",
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || "Gagal sinkron" });
  }
}
