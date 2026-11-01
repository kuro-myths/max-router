/**
 * POST /api/kiro-devices/poll — dipanggil Max Router Kiro Bridge di komputer.
 * Bridge mengirim status (Kiro jalan / MITM aktif) + hasil perintah sebelumnya,
 * dan menerima antrean perintah baru dari dashboard.
 *
 * Auth: header x-api-key (API key dashboard) — divalidasi authMiddleware.
 */
import { pollDevice } from "../../../lib/kiroDeviceStore.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req, res) {
  try {
    const body = req.body || {};
    const { commands } = await pollDevice({
      deviceId: body.deviceId,
      name: body.name,
      platform: body.platform,
      version: body.version,
      status: body.status,
      results: body.results,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, commands });
  } catch (error) {
    console.error("[kiro-devices] poll failed:", error);
    return res.status(400).json({ error: error.message });
  }
}
