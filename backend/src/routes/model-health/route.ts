import { getModelHealthReport } from "../../lib/modelHealth/index.js";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["working", "degraded", "down", "unknown"]);

// GET /api/model-health?status=working&provider=cc&limit=20
// Ranked view of which provider/model pairs work and which one is best right now.
export async function GET(req: any, res: any) {
  try {
    const status = typeof req.query?.status === "string" && STATUSES.has(req.query.status) ? req.query.status : undefined;
    const provider = typeof req.query?.provider === "string" ? req.query.provider : undefined;
    const limit = typeof req.query?.limit === "string" ? req.query.limit : undefined;
    return res.json(await getModelHealthReport({ status, provider, limit }));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Gagal membaca kesehatan model" });
  }
}
