import { getAdapter } from "../../../lib/db/driver.js";

// GET /api/providers/failed-archive — retrieve safe metadata for failed service tests.
export async function GET_handler(req, res) {
  try {
    const db = await getAdapter();
    const row = await db.get(
      "SELECT value FROM kv WHERE scope = ? AND key = ?",
      ["failedServiceArchive", "latest"]
    );
    let archive = { schemaVersion: 1, generatedAt: null, failedServices: [] };
    if (row?.value) {
      try {
        archive = JSON.parse(row.value);
      } catch {
        // A corrupt archive must not prevent provider management from loading.
      }
    }
    return res.json({ archive });
  } catch (error) {
    console.error("Failed to read provider failure archive:", error);
    return res.status(500).json({ error: "Gagal membaca arsip layanan gagal." });
  }
}

// POST /api/providers/failed-archive — persist a metadata-only JSON archive.
// Credentials/tokens are intentionally never accepted or stored here.
export async function POST_handler(req, res) {
  try {
    const incoming = req.body?.archive;
    if (!incoming || typeof incoming !== "object" || !Array.isArray(incoming.failedServices)) {
      return res.status(400).json({ error: "Format arsip tidak valid." });
    }
    const failedServices = incoming.failedServices.slice(0, 1000).map((item) => ({
      id: String(item.id || ""),
      name: String(item.name || "Layanan tanpa nama").slice(0, 200),
      provider: item.provider ? String(item.provider).slice(0, 120) : null,
      authType: item.authType ? String(item.authType).slice(0, 40) : null,
      endpoint: item.endpoint ? String(item.endpoint).slice(0, 500) : null,
      model: item.model ? String(item.model).slice(0, 200) : null,
      result: "failed",
      verified: item.verified === true,
      httpStatus: Number.isFinite(Number(item.httpStatus)) ? Number(item.httpStatus) : null,
      errorCode: item.errorCode ? String(item.errorCode).slice(0, 80) : null,
      reason: String(item.reason || "Uji layanan gagal").slice(0, 1000),
      testedAt: item.testedAt || new Date().toISOString(),
      removedFromActiveServices: item.removedFromActiveServices === true,
      deleteHttpStatus: item.deleteHttpStatus ?? null,
    })).filter((item) => item.id);

    const archive = {
      schemaVersion: 1,
      generatedAt: incoming.generatedAt || new Date().toISOString(),
      source: "Max Router / Uji Semua Penyedia",
      summary: incoming.summary && typeof incoming.summary === "object" ? incoming.summary : {},
      failedServices,
    };
    const db = await getAdapter();
    await db.run(
      "INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value",
      ["failedServiceArchive", "latest", JSON.stringify(archive)]
    );
    return res.json({ success: true, saved: failedServices.length, generatedAt: archive.generatedAt });
  } catch (error) {
    console.error("Failed to persist provider failure archive:", error);
    return res.status(500).json({ error: "Gagal menyimpan arsip ke database." });
  }
}
