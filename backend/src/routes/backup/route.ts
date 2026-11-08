import { exportDb, importDb } from "../../lib/db/index.js";

const BACKUP_FORMAT = "max-router-backup";
const BACKUP_VERSION = 1;

export async function GET_handler(_req, res) {
  try {
    const data = await exportDb();
    const generatedAt = new Date().toISOString();
    const stamp = generatedAt.replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
    const backup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      generatedAt,
      application: "Max Router",
      data,
    };
    const filename = `max-router-backup-${stamp}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, private");
    return res.status(200).send(JSON.stringify(backup, null, 2));
  } catch (error) {
    console.error("[backup] Export failed:", error?.message || error);
    return res.status(500).json({ error: "Backup gagal dibuat. Periksa koneksi database." });
  }
}

export async function POST_handler(req, res) {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ error: "Format backup tidak valid." });
    }
    if (payload.format && payload.format !== BACKUP_FORMAT) {
      return res.status(400).json({ error: "File bukan backup Max Router." });
    }
    if (payload.format === BACKUP_FORMAT && payload.version !== BACKUP_VERSION) {
      return res.status(400).json({ error: "Versi backup tidak didukung." });
    }
    const data = payload.format === BACKUP_FORMAT ? payload.data : payload;
    if (!data || typeof data !== "object" || !Array.isArray(data.providerConnections) ||
        !Array.isArray(data.providerNodes) || !Array.isArray(data.proxyPools) ||
        !Array.isArray(data.apiKeys) || !Array.isArray(data.combos)) {
      return res.status(400).json({ error: "Struktur backup tidak lengkap atau rusak." });
    }
    if (req.body?.confirmReplace !== "REPLACE") {
      return res.status(409).json({ error: "Restore penuh membutuhkan konfirmasi eksplisit." });
    }
    const restored = await importDb(data);
    return res.json({
      success: true,
      restored: {
        providerConnections: restored.providerConnections.length,
        providerNodes: restored.providerNodes.length,
        proxyPools: restored.proxyPools.length,
        apiKeys: restored.apiKeys.length,
        combos: restored.combos.length,
        customModels: restored.customModels.length,
      },
      message: "Restore selesai. Muat ulang aplikasi untuk menyegarkan data.",
    });
  } catch (error) {
    console.error("[backup] Restore failed:", error?.message || error);
    return res.status(500).json({ error: "Restore gagal. Database tidak dapat dipulihkan dari file ini." });
  }
}
