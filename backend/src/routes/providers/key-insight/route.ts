import { inspectApiKey } from "../../../lib/apiKeyInsight.js";
import { getProviderConnectionById, updateProviderConnection } from "../../../lib/localDb.js";

export const dynamic = "force-dynamic";

// POST /api/providers/key-insight
// Body: { connectionId } or { provider, apiKey, providerSpecificData, defaultModel }
export async function POST_handler(req, res) {
  try {
    const body = req.body || {};
    let provider = typeof body.provider === "string" ? body.provider : "";
    let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    let providerSpecificData = body.providerSpecificData && typeof body.providerSpecificData === "object"
      ? body.providerSpecificData
      : undefined;
    let connection = null;

    if (body.connectionId) {
      connection = await getProviderConnectionById(body.connectionId);
      if (!connection) return res.status(404).json({ error: "Koneksi tidak ditemukan" });
      provider = connection.provider;
      apiKey = connection.apiKey || connection.accessToken || "";
      providerSpecificData = {
        ...(connection.providerSpecificData || {}),
        ...(providerSpecificData || {}),
      };
    }

    if (!provider || !apiKey) {
      return res.status(400).json({ error: "Provider dan API key diperlukan" });
    }

    const insight = await inspectApiKey({
      provider,
      apiKey,
      providerSpecificData,
      defaultModel: typeof body.defaultModel === "string" ? body.defaultModel : undefined,
    });

    if (connection) {
      const update = {
        providerSpecificData: {
          ...(connection.providerSpecificData || {}),
          lastKeyInsight: insight,
        },
        updatedAt: new Date().toISOString(),
      };
      if (insight.status === "invalid") {
        update.testStatus = "error";
        update.lastError = insight.error || "API key tidak valid";
      } else if (insight.status === "limited") {
        update.lastError = insight.note || insight.error || "API key kena limit";
      } else if (insight.status === "ok") {
        update.testStatus = "active";
        update.lastError = null;
      }
      await updateProviderConnection(connection.id, update);
    }

    return res.json(insight);
  } catch (error) {
    console.log("Error inspecting API key:", error);
    return res.status(500).json({ error: "Gagal memeriksa API key" });
  }
}
