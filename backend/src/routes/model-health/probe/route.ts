import { getModelHealthReport, probeModels } from "../../../lib/modelHealth/index.js";

export const dynamic = "force-dynamic";

// POST /api/model-health/probe   { models?: ["alias/model", ...], limit?: number }
// Sends a 1-token request to each model and records whether it answered. Without `models`,
// the least recently seen known models are probed. Returns the probe results and the fresh report.
export async function POST(req: any, res: any) {
  try {
    const { models, limit } = req.body || {};
    if (models !== undefined && !(Array.isArray(models) && models.every((m: unknown) => typeof m === "string"))) {
      return res.status(400).json({ error: "models harus berupa array string 'alias/model'" });
    }
    const probe = await probeModels({ models, limit });
    if (probe.busy) return res.status(409).json({ error: "Probe lain sedang berjalan. Coba lagi sebentar." });
    return res.json({ probe, report: await getModelHealthReport({ limit: 20 }) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Probe model gagal" });
  }
}
