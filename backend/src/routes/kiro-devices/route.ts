/**
 * GET /api/kiro-devices — daftar perangkat Kiro yang terhubung ke bridge.
 * Dipakai halaman dashboard "Perangkat Kiro".
 */
import { listDevices } from "../../lib/kiroDeviceStore.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req, res) {
  try {
    const devices = await listDevices();
    res.set("Cache-Control", "no-store");
    return res.json({ devices });
  } catch (error) {
    console.error("[kiro-devices] list failed:", error);
    return res.status(500).json({ error: error.message });
  }
}
