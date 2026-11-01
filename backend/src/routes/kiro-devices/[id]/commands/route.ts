/**
 * POST /api/kiro-devices/:id/commands — kirim perintah ke perangkat Kiro
 * dari dashboard (Vercel). Perintah masuk antrean dan diambil bridge
 * lokal pada polling berikutnya (± beberapa detik).
 *
 * Perintah yang didukung: launch-kiro, close-kiro, open-url, start-mitm, stop-mitm, ping
 */
import { enqueueCommand, getDevice } from "../../../../lib/kiroDeviceStore.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req, res) {
  try {
    const { id } = req.params || {};
    const body = req.body || {};
    const type = body.type;
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

    if (!id) return res.status(400).json({ error: "ID perangkat wajib diisi" });
    if (!type) return res.status(400).json({ error: "type perintah wajib diisi" });

    const device = await getDevice(id);
    if (!device) return res.status(404).json({ error: "Perangkat tidak ditemukan" });
    if (!device.online) {
      return res.status(409).json({ error: "Perangkat sedang offline. Jalankan Kiro Bridge di komputer kamu." });
    }

    const command = await enqueueCommand(id, type, payload);
    return res.json({ ok: true, command });
  } catch (error) {
    console.error("[kiro-devices] enqueue failed:", error);
    return res.status(400).json({ error: error.message });
  }
}
