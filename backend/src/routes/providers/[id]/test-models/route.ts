import { getProviderConnectionById, updateProviderConnection } from "../../../../lib/localDb.js";
import { getProviderModels, PROVIDER_ID_TO_ALIAS } from "../../../../../open-sse/config/providerModels.js";
import { resolveKiroModels } from "../../../../../open-sse/services/kiroModels.js";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "../../../../shared/constants/providers.js";
import { pingModelByKind } from "../../../models/test/ping.js";

export async function POST_handler(req, res, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);
    if (!connection) return res.status(404).json({ error: "Connection not found" });

    const providerId = connection.provider;
    const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
    const isCompatible = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

    // Resolve Kiro's account-specific catalog directly in this invocation.
    // Never self-fetch /api/providers/... from a protected Vercel deployment:
    // Vercel's protection layer returns 401 before the app can authenticate it.
    let models;
    let source = "provider-catalog";
    if (providerId === "kiro") {
      const resolved = await resolveKiroModels({
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        providerSpecificData: connection.providerSpecificData || {}
      }, {
        forceRefresh: true,
        log: console,
        onCredentialsRefreshed: async (refreshed) => {
          if (!refreshed?.accessToken) return;
          await updateProviderConnection(connection.id, {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken || connection.refreshToken,
            expiresIn: refreshed.expiresIn
          });
          connection.accessToken = refreshed.accessToken;
          if (refreshed.refreshToken) connection.refreshToken = refreshed.refreshToken;
        }
      });
      models = resolved?.models || [];
      source = "kiro-live-account-catalog";
      if (!models.length) {
        return res.status(502).json({
          error: "Katalog Kiro live kosong atau autentikasi gagal. Periksa token, profileArn, dan region pada koneksi ini.",
          hint: "Model statis tidak ditandai berhasil karena belum diverifikasi ke upstream."
        });
      }
    } else {
      models = getProviderModels(alias);
      if (isCompatible && models.length === 0) {
        return res.status(400).json({ error: "No models configured for this provider" });
      }
    }

    const seen = new Set();
    models = models.filter((m) => {
      const modelId = String(m?.id || "").trim();
      if (!modelId || seen.has(modelId)) return false;
      seen.add(modelId);
      return true;
    });
    if (!models.length) return res.status(400).json({ error: "No models available to test" });

    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.FRONTEND_ORIGIN || "";
    if (!baseUrl) return res.status(500).json({ error: "PUBLIC_BASE_URL is not configured; refusing to self-call a protected deployment hostname." });

    const results = new Array(models.length);
    let cursor = 0;
    const concurrency = Math.min(2, models.length);
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= models.length) return;
        const model = models[index];
        try {
          const result = await pingModelByKind(`${alias}/${model.id}`, model.type || "llm", baseUrl.replace(/\/+$/, ""));
          results[index] = { modelId: model.id, name: model.name || model.id, ...result };
        } catch (error) {
          results[index] = { modelId: model.id, name: model.name || model.id, ok: false, error: error?.message || "Model test failed" };
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const passed = results.filter((r) => r.ok === true).length;
    return res.json({
      provider: providerId,
      connectionId: id,
      source,
      testedAt: new Date().toISOString(),
      summary: { total: results.length, passed, failed: results.length - passed },
      results
    });
  } catch (error) {
    console.log("Error testing models:", error);
    return res.status(502).json({ error: error?.message || "Test failed" });
  }
}
