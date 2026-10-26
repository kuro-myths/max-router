// GET /api/agent/config
// Config ringkas untuk AI agent ekosistem MAX (MAX Browser extension, MAX Editor AI):
// model `working` terbaik saat ini diambil dari model health ledger, jadi agent
// tidak perlu menebak model mana yang layak dipakai.
import { getModelHealthReport } from "../../../lib/modelHealth/index.js";

export const dynamic = "force-dynamic";

export async function GET(req: any, res: any) {
  try {
    const report = await getModelHealthReport({ status: "working", limit: "10" });
    const hint = report.best?.id
      ? "Set model = best.id di /v1/chat/completions, atau kosongkan model untuk routing default."
      : "Belum ada model working yang tercatat. Jalankan POST /api/model-health/probe dulu.";
    return res.json({
      service: "max-router",
      generatedAt: report.generatedAt,
      agent: {
        name: "max-browser",
        chatEndpoint: "/v1/chat/completions",
        modelsEndpoint: "/v1/models",
      },
      best: report.best,
      top: report.top,
      summary: report.summary,
      hint,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Gagal menyusun config agent" });
  }
}
