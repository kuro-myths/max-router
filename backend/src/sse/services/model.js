// Re-export from open-sse with localDb integration
import { getModelAliases, getComboByName, getProviderNodes, getProviderConnections } from "../../lib/localDb.js";
import { OPENAI_COMPATIBLE_PREFIX, ANTHROPIC_COMPATIBLE_PREFIX } from "../../shared/constants/providers.js";
import { parseModel as parseModelCore, resolveModelAliasFromMap, getModelInfoCore } from "open-sse/services/model.js";

// Local provider alias overrides (HMR-friendly, applied on top of open-sse map)
const LOCAL_PROVIDER_ALIASES = {
  xmtp: "xiaomi-tokenplan",
  "xiaomi-tokenplan": "xiaomi-tokenplan",
};

export function parseModel(modelStr) {
  const parsed = parseModelCore(modelStr);
  if (parsed?.providerAlias && LOCAL_PROVIDER_ALIASES[parsed.providerAlias]) {
    return { ...parsed, provider: LOCAL_PROVIDER_ALIASES[parsed.providerAlias] };
  }
  return parsed;
}

/**
 * Resolve model alias from localDb
 */
export async function resolveModelAlias(alias) {
  const aliases = await getModelAliases();
  return resolveModelAliasFromMap(alias, aliases);
}

/**
 * Cari model di katalog model koneksi kompatibel aktif (mis. xKiro).
 * Model dari penyedia kompatibel sering berformat "vendor/model" (mis.
 * "qwen/qwen3-...", "google/gemini-..."). Tanpa pemetaan ini router salah
 * mengira "vendor" sebagai penyedia bawaan sehingga gagal dengan
 * "No active credentials for provider: vendor".
 */
async function findModelInCompatibleCatalogs(model) {
  if (!model) return null;
  try {
    const connections = await getProviderConnections({ isActive: true });
    const needle = String(model);
    for (const conn of connections) {
      const providerId = String(conn.provider || "");
      if (!providerId.startsWith(OPENAI_COMPATIBLE_PREFIX) && !providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX)) continue;
      const catalog = conn.providerSpecificData?.modelCatalog?.models;
      if (!Array.isArray(catalog) || catalog.length === 0) continue;
      const ids = catalog.map((m) => (typeof m === "string" ? m : (m?.id || m?.name || ""))).filter(Boolean);
      const exact = ids.find((id) => id === needle);
      if (exact) return { provider: providerId, model: exact };
      const suffix = ids.find((id) => id.endsWith("/" + needle));
      if (suffix) return { provider: providerId, model: suffix };
    }
  } catch (error) {
    console.log("[model] catalog fallback error:", error?.message || error);
  }
  return null;
}

/**
 * Get full model info (parse or resolve)
 */
export async function getModelInfo(modelStr) {
  const parsed = parseModel(modelStr);

  if (!parsed.isAlias) {
    // Always check provider-node prefix matching using original input first
    const openaiNodes = await getProviderNodes({ type: "openai-compatible" });
    const matchedOpenAI = openaiNodes.find((node) => node.prefix === parsed.providerAlias);
    if (matchedOpenAI) {
      return { provider: matchedOpenAI.id, model: parsed.model };
    }

    const anthropicNodes = await getProviderNodes({ type: "anthropic-compatible" });
    const matchedAnthropic = anthropicNodes.find((node) => node.prefix === parsed.providerAlias);
    if (matchedAnthropic) {
      return { provider: matchedAnthropic.id, model: parsed.model };
    }

    const embeddingNodes = await getProviderNodes({ type: "custom-embedding" });
    const matchedEmbedding = embeddingNodes.find((node) => node.prefix === parsed.providerAlias);
    if (matchedEmbedding) {
      return { provider: matchedEmbedding.id, model: parsed.model };
    }
    const catalogHit = await findModelInCompatibleCatalogs(modelStr);
    if (catalogHit) {
      return { provider: catalogHit.provider, model: catalogHit.model };
    }
    return {
      provider: parsed.provider,
      model: parsed.model
    };
  }

  // Check if this is a combo name before resolving as alias
  // This prevents combo names from being incorrectly routed to providers
  const combo = await getComboByName(parsed.model);
  if (combo) {
    // Return null provider to signal this should be handled as combo
    // The caller (handleChat) will detect this and handle it as combo
    return { provider: null, model: parsed.model };
  }

  const catalogAliasHit = await findModelInCompatibleCatalogs(parsed.model);
  if (catalogAliasHit) {
    return { provider: catalogAliasHit.provider, model: catalogAliasHit.model };
  }
  return getModelInfoCore(modelStr, getModelAliases);
}

/**
 * Check if model is a combo and get models list
 * @returns {Promise<string[]|null>} Array of models or null if not a combo
 */
export async function getComboModels(modelStr) {
  // Only check if it's not in provider/model format
  if (modelStr.includes("/")) return null;

  const combo = await getComboByName(modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}
