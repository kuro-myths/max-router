
import {
  getProviderConnections,
  createProviderConnection,
  getProviderNodeById,
  getProviderNodes,
  getProxyPoolById,
} from "../../models/index.js";
import { AI_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "../../shared/constants/providers.js";
import { normalizeProviderId, normalizeProviderSpecificData } from "../../lib/providerNormalization.js";

export const dynamic = "force-dynamic";

function normalizeProxyConfig(body = {}) {
  const enabled = body?.connectionProxyEnabled === true;
  const url = typeof body?.connectionProxyUrl === "string" ? body.connectionProxyUrl.trim() : "";
  const noProxy = typeof body?.connectionNoProxy === "string" ? body.connectionNoProxy.trim() : "";

  if (enabled && !url) {
    return { error: "Connection proxy URL is required when connection proxy is enabled" };
  }

  return {
    connectionProxyEnabled: enabled,
    connectionProxyUrl: url,
    connectionNoProxy: noProxy,
  };
}

async function normalizeProxyPoolId(proxyPoolId) {
  if (proxyPoolId === undefined || proxyPoolId === null || proxyPoolId === "" || proxyPoolId === "__none__") {
    return { proxyPoolId: null };
  }

  const normalizedId = String(proxyPoolId).trim();
  if (!normalizedId) {
    return { proxyPoolId: null };
  }

  const proxyPool = await getProxyPoolById(normalizedId);
  if (!proxyPool) {
    return { error: "Proxy pool not found" };
  }

  return { proxyPoolId: normalizedId };
}

// GET /api/providers - List all connections
export async function GET(req, res) {
  try {
    const connections = await getProviderConnections();

    // Build nodeNameMap for compatible providers (id → name)
    let nodeNameMap = {};
    try {
      const nodes = await getProviderNodes();
      for (const node of nodes) {
        if (node.id && node.name) nodeNameMap[node.id] = node.name;
      }
    } catch { }

    // Hide sensitive fields, enrich name for compatible providers
    const safeConnections = connections.map(c => {
      const isCompatible = isOpenAICompatibleProvider(c.provider) || isAnthropicCompatibleProvider(c.provider);
      const name = isCompatible
        ? (c.name || nodeNameMap[c.provider] || c.providerSpecificData?.nodeName || c.provider)
        : c.name;
      return {
        ...c,
        name,
        hasApiKey: Boolean(c.apiKey),
        apiKey: undefined,
        accessToken: undefined,
        refreshToken: undefined,
        idToken: undefined,
      };
    });

    return res.json({ connections: safeConnections });
  } catch (error) {
    console.log("Error fetching providers:", error);
    return res.status(500).json({ error: "Failed to fetch providers" });
  }
}

// POST /api/providers - Create one or many compatible connections.
export async function POST_handler(req, res) {
  try {
    const body = req.body || {};
    const provider = normalizeProviderId(body.provider);
    const proxyConfig = normalizeProxyConfig(body);
    if (proxyConfig.error) return res.status(400).json({ error: proxyConfig.error });

    const proxyPoolResult = await normalizeProxyPoolId(body.proxyPoolId);
    if (proxyPoolResult.error) return res.status(400).json({ error: proxyPoolResult.error });
    const proxyPoolId = proxyPoolResult.proxyPoolId;

    const isOpenAI = isOpenAICompatibleProvider(provider);
    const isAnthropic = isAnthropicCompatibleProvider(provider);
    if (!provider || (!isOpenAI && !isAnthropic)) {
      return res.status(400).json({ error: "Invalid compatible provider" });
    }

    const node = await getProviderNodeById(provider);
    if (!node) return res.status(404).json({ error: "Compatible provider node not found" });

    // Batch input: [{ apiKey, defaultModel?, name? }].
    // Single-key requests remain supported through apiKey.
    const batch = Array.isArray(body.batch) && body.batch.length
      ? body.batch
      : [{ apiKey: body.apiKey, defaultModel: body.defaultModel, name: body.name || body.displayName }];

    const validBatch = batch
      .map((item) => ({
        apiKey: typeof item?.apiKey === "string" ? item.apiKey.trim() : "",
        defaultModel: typeof item?.defaultModel === "string" ? item.defaultModel.trim() : "",
        name: typeof item?.name === "string" ? item.name.trim() : "",
      }))
      .filter((item) => item.apiKey);

    if (!validBatch.length) return res.status(400).json({ error: "Minimal satu API key diperlukan" });

    const existing = await getProviderConnections({ provider });
    const created = [];
    const skippedDuplicates = [];
    const seenIncomingKeys = new Set();

    for (let index = 0; index < validBatch.length; index += 1) {
      const item = validBatch[index];
      // Ignore duplicate lines in this request and keys already stored for this provider.
      if (seenIncomingKeys.has(item.apiKey) || existing.some((connection) => connection.apiKey === item.apiKey)) {
        skippedDuplicates.push(item.name || "Key " + (index + 1));
        continue;
      }
      seenIncomingKeys.add(item.apiKey);

      const connectionName =
        item.name ||
        `${node.name || "Provider Kompatibel"} Key ${existing.length + created.length + 1}`;

      let providerSpecificData = {
        prefix: node.prefix,
        apiType: node.apiType,
        baseUrl: node.baseUrl,
        nodeName: node.name,
        iconUrl: node.iconUrl || null,
        connectionProxyEnabled: proxyConfig.connectionProxyEnabled,
        connectionProxyUrl: proxyConfig.connectionProxyUrl,
        connectionNoProxy: proxyConfig.connectionNoProxy,
      };

      if (proxyPoolId !== null) providerSpecificData.proxyPoolId = proxyPoolId;

      const connection = await createProviderConnection({
        provider,
        authType: "apikey",
        name: connectionName,
        apiKey: item.apiKey,
        email: body.email || "",
        priority: Number(body.priority || index + 1),
        globalPriority: body.globalPriority || null,
        defaultModel: item.defaultModel || body.defaultModel || null,
        providerSpecificData,
        isActive: true,
        testStatus: "unknown",
      });
      const safe = { ...connection, hasApiKey: Boolean(connection.apiKey) };
      delete safe.apiKey;
      created.push(safe);
    }

    if (created.length === 0 && skippedDuplicates.length > 0) {
      return res.status(200).json({
        connections: [],
        connection: null,
        createdCount: 0,
        skippedDuplicateCount: skippedDuplicates.length,
        message: "Semua API key sudah tersimpan untuk penyedia ini.",
      });
    }

    return res.status(201).json({
      connections: created,
      connection: created[0] || null,
      createdCount: created.length,
      skippedDuplicateCount: skippedDuplicates.length,
      message: skippedDuplicates.length
        ? created.length + " key baru disimpan; " + skippedDuplicates.length + " key duplikat dilewati."
        : created.length + " key berhasil disimpan.",
    });
  } catch (error) {
    console.log("Error creating compatible provider:", error);
    return res.status(500).json({ error: "Failed to create provider" });
  }
}

