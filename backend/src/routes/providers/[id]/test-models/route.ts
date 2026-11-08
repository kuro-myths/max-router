import { getProviderConnectionById } from "../../../../lib/localDb.js";
import { getProviderModels, PROVIDER_ID_TO_ALIAS } from "../../../../../open-sse/config/providerModels.js";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "../../../../shared/constants/providers.js";
import { pingModelByKind } from "../../../models/test/ping.js";

/**
 * Test every model belonging to one saved provider connection.
 * Kiro must use its live, account-specific catalog rather than the static
 * fallback catalog; synthetic thinking/agentic variants are tested too.
 */
export async function POST_handler(req, res, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);
    if (!connection) return res.status(404).json({ error: "Connection not found" });

    const providerId = connection.provider;
    const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
    const isCompatible = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

    const reqHost = req.headers?.host || "";
    const isLocalHost = /^(localhost|127\.|0\.0\.0\.0)/.test(reqHost);
    const baseUrl = isLocalHost
      ? `http://127.0.0.1:${process.env.PORT || 3001}`
      : `${req.headers?.["x-forwarded-proto"] || "https"}://${reqHost}`;

    let models = getProviderModels(alias);

    // Always discover Kiro models live: its model catalog depends on the
    // authenticated account and may change independently of our static list.
    if (providerId === "kiro" || (isCompatible && models.length === 0)) {
      const headers = { Accept: "application/json" };
      if (req.headers?.cookie) headers.cookie = req.headers.cookie;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);
      let modelsRes;
      try {
        modelsRes = await fetch(`${baseUrl}/api/providers/${encodeURIComponent(id)}/models?refresh=1`, {
          method: "GET", headers, cache: "no-store", signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
      const raw = await modelsRes.text();
      let data;
      try { data = raw ? JSON.parse(raw) : {}; }
      catch { throw new Error(`Daftar model tidak mengembalikan JSON (HTTP ${modelsRes.status}).`); }
      if (!modelsRes.ok) {
        const detail = data?.error?.message || data?.error || data?.message || raw.slice(0, 500);
        throw new Error(`Gagal mengambil katalog model live (HTTP ${modelsRes.status}): ${detail}`);
      }
      const live = Array.isArray(data) ? data : (data.models || data.data || data.results || []);
      models = live.map((m) => {
        const modelId = typeof m === "string" ? m : (m?.id || m?.name || m?.model);
        return modelId ? { ...(typeof m === "object" ? m : {}), id: modelId, name: m?.name || modelId, type: m?.type || "llm" } : null;
      }).filter(Boolean);
    }

    // De-duplicate IDs before sending requests; do not test aliases twice.
    const seen = new Set();
    models = models.filter((m) => {
      const modelId = String(m?.id || "").trim();
      if (!modelId || seen.has(modelId)) return false;
      seen.add(modelId);
      return true;
    });
    if (!models.length) {
      return res.status(400).json({
        error: providerId === "kiro"
          ? "Kiro tidak mengembalikan model untuk akun ini. Periksa token, profileArn, dan region."
          : "No models configured for this provider"
      });
    }

    const results = new Array(models.length);
    let cursor = 0;
    // Bound concurrency to avoid exhausting Kiro/account quotas and producing
    // false failures from bursts of simultaneous GenerateAssistantResponse calls.
    const concurrency = Math.min(3, models.length);
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= models.length) return;
        const model = models[index];
        try {
          const result = await pingModelByKind(`${alias}/${model.id}`, model.type || "llm", baseUrl);
          results[index] = { modelId: model.id, name: model.name || model.id, ...result };
        } catch (error) {
          results[index] = { modelId: model.id, name: model.name || model.id, ok: false, error: error?.message || "Model test failed" };
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const passed = results.filter((r) => r.ok || r.success).length;
    return res.json({
      provider: providerId,
      connectionId: id,
      source: providerId === "kiro" ? "live-account-catalog" : "provider-catalog",
      testedAt: new Date().toISOString(),
      summary: { total: results.length, passed, failed: results.length - passed },
      results
    });
  } catch (error) {
    console.log("Error testing models:", error);
    return res.status(502).json({ error: error?.message || "Test failed" });
  }
}
