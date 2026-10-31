import { getProviderConnectionById, updateProviderConnection } from "../../../../models/index.js";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "../../../../shared/constants/providers.js";
import { GEMINI_CONFIG } from "../../../../lib/oauth/constants/oauth.js";
import { refreshGoogleToken, updateProviderCredentials } from "../../../../sse/services/tokenRefresh.js";
import { resolveOllamaLocalHost } from "../../../../../open-sse/config/providers.js";
import { resolveKiroModels } from "../../../../../open-sse/services/kiroModels.js";
import { resolveQoderModels } from "../../../../../open-sse/services/qoderModels.js";

const normalizeCompatibleBaseUrl = (value) => {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() === "xkiro.com" || parsed.hostname.toLowerCase() === "www.xkiro.com") {
      parsed.hostname = "api.xkiro.com";
      parsed.pathname = "/v1";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {}
  return raw;
};

const GEMINI_CLI_MODELS_URL = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";

const readJsonResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      const preview = text.replace(/\s+/g, " ").slice(0, 500);
      const err = new Error(
        /html/i.test(contentType) || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)
          ? `Upstream mengembalikan HTML, bukan JSON (HTTP ${response.status}).`
          : `Respons upstream bukan JSON yang valid (HTTP ${response.status}).`
      );
      err.contentType = contentType;
      err.rawPreview = preview;
      err.parseError = error?.message || "JSON parse failed";
      throw err;
    }
  }
  return { data, text, contentType };
};

const normalizeModelMetadata = (model) => {
  if (!model || typeof model !== "object") return model;
  const capabilities = model.capabilities && typeof model.capabilities === "object" ? model.capabilities : {};
  const supported = new Set(
    Array.isArray(model.supported_parameters) ? model.supported_parameters :
    Array.isArray(model.supportedParameters) ? model.supportedParameters :
    Array.isArray(model.parameters) ? model.parameters :
    Array.isArray(model.metadata?.supported_parameters) ? model.metadata.supported_parameters : []
  );
  if (capabilities.tools === true) supported.add("tools");
  if (capabilities.vision === true) supported.add("vision");
  if (capabilities.reasoning === true) {
    supported.add("reasoning");
    supported.add("reasoning_effort");
  }
  if (model.reasoning_efforts?.levels?.length) supported.add("reasoning_effort");
  if (model.response_format || capabilities.structured_output === true) supported.add("response_format");
  return {
    ...model,
    supportedParameters: Array.from(supported),
    accessTier: model.access_tier || model.accessTier || model.tier || null,
    contextWindow: model.context_window ?? model.contextWindow ?? model.context_length ?? null,
    maxOutput: model.max_output_tokens ?? model.max_output ?? model.maxOutput ?? model.max_tokens ?? null,
    pricing: model.pricing ?? null,
    capabilities: Object.keys(capabilities).length ? capabilities : model.capabilities ?? null,
  };
};

const normalizeModels = (models) => (Array.isArray(models) ? models.map(normalizeModelMetadata) : []);

const getCachedModelCatalog = (connection) => {
  const cached = connection?.providerSpecificData?.modelCatalog;
  if (!cached || typeof cached !== "object") return null;
  const models = normalizeModels(cached.models || []);
  if (!models.length) return null;
  return {
    models,
    usage: cached.usage || null,
    endpoint: cached.endpoint || null,
    detectedAt: cached.detectedAt || null,
    source: "database-cache",
  };
};

const persistModelCatalog = async (connection, models, usage, endpoint) => {
  if (!connection?.id || !Array.isArray(models) || models.length === 0) return;
  try {
    await updateProviderConnection(connection.id, {
      providerSpecificData: {
        ...(connection.providerSpecificData || {}),
        modelCatalog: {
          version: 1,
          models,
          usage: usage || null,
          endpoint: endpoint || null,
          modelCount: models.length,
          detectedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.log("Model catalog cache save skipped:", error.message);
  }
};

const parseOpenAIStyleModels = (data) => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
};

const parseGeminiCliModels = (data) => {
  if (Array.isArray(data?.models)) {
    return data.models
      .map((item) => {
        const id = item?.id || item?.model || item?.name;
        if (!id) return null;
        return { id, name: item?.displayName || item?.name || id };
      })
      .filter(Boolean);
  }

  if (data?.models && typeof data.models === "object") {
    return Object.entries(data.models)
      .filter(([, info]) => !info?.isInternal)
      .map(([id, info]) => ({
        id,
        name: info?.displayName || info?.name || id,
      }));
  }

  return [];
};

const appendCodexReviewModels = (models) => models.flatMap((model) => {
  const id = model?.id || model?.slug || model?.model || model?.name;
  if (!id) return [];
  const name = model?.display_name || model?.displayName || model?.name || id;
  const normalized = { ...model, id, name };
  const isChatModel = (model?.type || "llm") !== "image" && !id.toLowerCase().includes("embed");
  if (!isChatModel || id.endsWith("-review")) return [normalized];
  return [
    normalized,
    {
      ...normalized,
      id: `${id}-review`,
      name: `${name} Review`,
      upstreamModelId: id,
      quotaFamily: "review",
    },
  ];
});

const parseCodexModels = (data) => appendCodexReviewModels(parseOpenAIStyleModels(data));

const createOpenAIModelsConfig = (url) => ({
  url,
  method: "GET",
  headers: { "Content-Type": "application/json" },
  authHeader: "Authorization",
  authPrefix: "Bearer ",
  parseResponse: parseOpenAIStyleModels
});

const resolveQwenModelsUrl = (connection) => {
  const fallback = "https://portal.qwen.ai/v1/models";
  const raw = connection?.providerSpecificData?.resourceUrl;
  if (!raw || typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (!value) return fallback;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return `${value.replace(/\/$/, "")}/models`;
  }
  return `https://${value.replace(/\/$/, "")}/v1/models`;
};

// Generic custom resolver for OAuth providers that need refresh-on-401 + token persist.
// Receives a `fetchFn(token)` and returns parsed models or throws.
const buildOAuthResolver = ({ refreshFn, fetchFn, parseFn, errorLabel }) => async (connection) => {
  const { accessToken, refreshToken } = connection;
  if (!accessToken) {
    return { error: "No valid token found", status: 401 };
  }
  let warning;
  try {
    let response = await fetchFn(accessToken, connection);
    if (!response.ok && (response.status === 401 || response.status === 403) && refreshToken) {
      const refreshed = await refreshFn(connection);
      if (refreshed?.accessToken) {
        await updateProviderCredentials(connection.id, {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || refreshToken,
          expiresIn: refreshed.expiresIn,
        });
        connection.accessToken = refreshed.accessToken;
        if (refreshed.refreshToken) connection.refreshToken = refreshed.refreshToken;
        response = await fetchFn(refreshed.accessToken, connection);
      }
    }
    if (response.ok) {
      const data = await response.json();
      const models = parseFn(data);
      if (models.length > 0) return { models };
    } else {
      const errorText = await response.text();
      warning = `${errorLabel}: ${response.status} ${errorText}`;
      console.log(`${errorLabel} (falling back to static):`, errorText);
    }
  } catch (error) {
    warning = `${errorLabel}: ${error.message}`;
    console.log(`${errorLabel} (falling back to static):`, error.message);
  }
  return { models: [], warning };
};

// Provider models endpoints configuration
const PROVIDER_MODELS_CONFIG = {
  claude: {
    url: "https://api.anthropic.com/v1/models",
    method: "GET",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Content-Type": "application/json"
    },
    authHeader: "x-api-key",
    parseResponse: (data) => data.data || []
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authQuery: "key", // Use query param for API key
    parseResponse: (data) => data.models || []
  },
  qwen: {
    url: "https://portal.qwen.ai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || []
  },
  codex: {
    url: "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0",
    method: "GET",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: parseCodexModels
  },
  github: {
    url: "https://api.githubcopilot.com/models",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Copilot-Integration-Id": "vscode-chat",
      "editor-version": "vscode/1.107.1",
      "editor-plugin-version": "copilot-chat/0.26.7",
      "user-agent": "GitHubCopilotChat/0.26.7"
    },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => {
      if (!data?.data) return [];
      // Filter out embeddings, non-chat models, and disabled models
      return data.data
        .filter(m => m.capabilities?.type === "chat")
        .filter(m => m.policy?.state !== "disabled") // Only return explicitly enabled models
        .map(m => ({
          id: m.id,
          name: m.name || m.id,
          version: m.version,
          capabilities: m.capabilities,
          isDefault: m.model_picker_enabled === true
        }));
    }
  },
  openai: createOpenAIModelsConfig("https://api.openai.com/v1/models"),
  openrouter: createOpenAIModelsConfig("https://openrouter.ai/api/v1/models"),
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    method: "GET",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Content-Type": "application/json"
    },
    authHeader: "x-api-key",
    parseResponse: (data) => data.data || []
  },

  alicode: {
    url: "https://coding.dashscope.aliyuncs.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || []
  },
  "alicode-intl": {
    url: "https://coding-intl.dashscope.aliyuncs.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || []
  },
  "volcengine-ark": createOpenAIModelsConfig("https://ark.cn-beijing.volces.com/api/coding/v3/models"),
  byteplus: createOpenAIModelsConfig("https://ark.ap-southeast.bytepluses.com/api/coding/v3/models"),

  // OpenAI-compatible API key providers
  deepseek: createOpenAIModelsConfig("https://api.deepseek.com/models"),
  groq: createOpenAIModelsConfig("https://api.groq.com/openai/v1/models"),
  xai: createOpenAIModelsConfig("https://api.x.ai/v1/models"),
  mistral: createOpenAIModelsConfig("https://api.mistral.ai/v1/models"),
  perplexity: createOpenAIModelsConfig("https://api.perplexity.ai/models"),
  together: createOpenAIModelsConfig("https://api.together.xyz/v1/models"),
  fireworks: createOpenAIModelsConfig("https://api.fireworks.ai/inference/v1/models"),
  cerebras: createOpenAIModelsConfig("https://api.cerebras.ai/v1/models"),
  cohere: createOpenAIModelsConfig("https://api.cohere.ai/v1/models"),
  nebius: createOpenAIModelsConfig("https://api.studio.nebius.ai/v1/models"),
  siliconflow: createOpenAIModelsConfig("https://api.siliconflow.cn/v1/models"),
  hyperbolic: createOpenAIModelsConfig("https://api.hyperbolic.xyz/v1/models"),
  ollama: createOpenAIModelsConfig("https://ollama.com/api/tags"),
  // ollama-local: url resolved dynamically below via providerSpecificData.baseUrl
  nanobanana: createOpenAIModelsConfig("https://api.nanobananaapi.ai/v1/models"),
  chutes: createOpenAIModelsConfig("https://llm.chutes.ai/v1/models"),
  nvidia: createOpenAIModelsConfig("https://integrate.api.nvidia.com/v1/models"),
  assemblyai: createOpenAIModelsConfig("https://api.assemblyai.com/v1/models"),
  "vercel-ai-gateway": createOpenAIModelsConfig("https://ai-gateway.vercel.sh/v1/models"),

  // Custom resolvers (non-OpenAI-shaped APIs / token-refresh flows)
  codebuddy: {
    customResolver: async (connection) => {
      const { getModelsByProviderId } = await import("../../../../shared/constants/models.js");
      const models = getModelsByProviderId("codebuddy");
      return { models };
    }
  },
  cb: {
    customResolver: async (connection) => {
      const { getModelsByProviderId } = await import("../../../../shared/constants/models.js");
      const models = getModelsByProviderId("cb");
      return { models };
    }
  },
  kiro: {
    customResolver: async (connection) => {
      const credentials = {
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        providerSpecificData: connection.providerSpecificData || {}
      };
      let warning;
      try {
        const result = await resolveKiroModels(credentials, {
          log: console,
          onCredentialsRefreshed: async (refreshed) => {
            if (refreshed?.accessToken) {
              await updateProviderCredentials(connection.id, {
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken || connection.refreshToken,
                expiresIn: refreshed.expiresIn,
              });
              connection.accessToken = refreshed.accessToken;
              if (refreshed.refreshToken) connection.refreshToken = refreshed.refreshToken;
            }
          }
        });
        if (result?.models?.length) {
          return {
            models: result.models.map((m) => ({
              id: m.id,
              name: m.name,
              upstreamModelId: m.upstreamModelId,
              contextLength: m.contextLength,
              rateMultiplier: m.rateMultiplier,
              capabilities: m.capabilities,
              description: m.description
            }))
          };
        }
        warning = "Kiro returned no models; falling back to static catalog.";
      } catch (error) {
        warning = `Failed to fetch Kiro models: ${error.message}`;
        console.log("Failed to fetch Kiro models dynamically, falling back to static:", error.message);
      }
      return { models: [], warning };
    }
  },
  qoder: {
    customResolver: async (connection) => {
      const credentials = {
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        email: connection.email,
        displayName: connection.displayName,
        providerSpecificData: connection.providerSpecificData || {},
      };
      let warning;
      try {
        const result = await resolveQoderModels(credentials, { forceRefresh: true });
        if (result?.models?.length) {
          return {
            models: result.models.map((m) => ({
              // Use the canonical "qoder/<key>" id so the dashboard
              // surfaces the same identifier the chat router expects.
              id: `qoder/${m.id}`,
              name: m.name,
              contextLength: m.contextLength,
              isVL: m.isVL,
              isReasoning: m.isReasoning,
              maxOutputTokens: m.maxOutputTokens,
              description: m.description,
            })),
          };
        }
        warning = "Qoder returned no models; falling back to static catalog.";
      } catch (error) {
        warning = `Failed to fetch Qoder models: ${error.message}`;
        console.log("Failed to fetch Qoder models dynamically, falling back to static:", error.message);
      }
      return { models: [], warning };
    },
  },
  "gemini-cli": {
    customResolver: buildOAuthResolver({
      refreshFn: (conn) => refreshGoogleToken(conn.refreshToken, GEMINI_CONFIG.clientId, GEMINI_CONFIG.clientSecret),
      fetchFn: (token, conn) => {
        const projectId = conn.projectId || conn.providerSpecificData?.projectId;
        const body = projectId ? { project: projectId } : {};
        return fetch(GEMINI_CLI_MODELS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "User-Agent": "google-api-nodejs-client/9.15.1",
            "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1"
          },
          body: JSON.stringify(body)
        });
      },
      parseFn: parseGeminiCliModels,
      errorLabel: "Failed to fetch Gemini CLI models"
    })
  },
  "ollama-local": {
    customResolver: async (connection) => {
      const url = `${resolveOllamaLocalHost(connection)}/api/tags`;
      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.log("Error fetching models from ollama-local:", errorText);
        return { error: `Failed to fetch models: ${response.status}`, status: response.status };
      }
      const data = await response.json();
      return { models: parseOpenAIStyleModels(data) };
    }
  }
};

/**
 * GET /api/providers/[id]/models - Get models list from provider
 */
export async function GET_handler(req, res, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);

    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    if (isOpenAICompatibleProvider(connection.provider)) {
      const baseUrl = normalizeCompatibleBaseUrl(connection.providerSpecificData?.baseUrl);
      if (!baseUrl) return res.status(400).json({ error: "No base URL configured for OpenAI compatible provider" });
      if (baseUrl !== connection.providerSpecificData?.baseUrl) {
        try {
          await updateProviderConnection(connection.id, {
            providerSpecificData: { ...(connection.providerSpecificData || {}), baseUrl },
          });
          connection.providerSpecificData = { ...(connection.providerSpecificData || {}), baseUrl };
        } catch (error) {
          console.log("Compatible base URL normalization skipped:", error.message);
        }
      }

      const rootBase = baseUrl.replace(/\/$/, "");
      // Prefer the standard OpenAI-compatible endpoint. Some providers serve
      // /models as an HTML dashboard, so a 2xx response is accepted only after
      // successful JSON parsing.
      const candidates = Array.from(new Set([
        rootBase.endsWith("/v1") ? rootBase + "/models" : rootBase + "/v1/models",
        rootBase + "/models",
        rootBase.replace(/\/v[0-9]+$/i, "") + "/v1/models",
      ]));

      let response = null;
      let lastError = "";
      let usedUrl = candidates[0];

      for (const url of candidates) {
        try {
          const candidate = await fetch(url, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Authorization": "Bearer " + connection.apiKey,
              "x-api-key": connection.apiKey,
            },
            signal: AbortSignal.timeout(12000),
          });

          const contentType = candidate.headers.get("content-type") || "";
          const raw = await candidate.text().catch(() => "");

          if (candidate.ok) {
            try {
              const parsed = raw ? JSON.parse(raw) : null;
              if (parsed && typeof parsed === "object") {
                response = { ...candidate, text: async () => raw };
                response.__parsedData = parsed;
                usedUrl = url;
                break;
              }
              lastError = "HTTP " + candidate.status + ": respons kosong/tidak berbentuk JSON";
            } catch {
              lastError = "HTTP " + candidate.status + ": respons bukan JSON (" + contentType + "): " + raw.replace(/\s+/g, " ").slice(0, 240);
            }
            continue;
          }

          lastError = "HTTP " + candidate.status + ": " + raw.slice(0, 240);
          continue;
        } catch (error) {
          lastError = error.message;
        }
      }

      if (!response) {
        const cached = getCachedModelCatalog(connection);
        if (cached) {
          return res.json({
            provider: connection.provider,
            connectionId: connection.id,
            models: cached.models,
            usage: cached.usage,
            endpoint: cached.endpoint,
            source: cached.source,
            stale: true,
            detectedAt: cached.detectedAt,
            warning: "Upstream /models gagal; daftar model terakhir dari database ditampilkan.",
            upstreamError: lastError || "Endpoint /models tidak tersedia",
            modelCount: cached.models.length,
            freeModelCount: cached.models.filter((m) => String(m.accessTier || "").toLowerCase() === "free").length,
            paidModelCount: cached.models.filter((m) => ["paid", "premium"].includes(String(m.accessTier || "").toLowerCase())).length,
            supportedParameters: Array.from(new Set(cached.models.flatMap((m) => m.supportedParameters || []))),
          });
        }
        return res.status(502).json({
          error: "Gagal mengambil daftar model. " + (lastError || "Endpoint /models tidak tersedia"),
          candidates,
          source: "upstream",
        });
      }

      let data;
      try {
        data = response.__parsedData ?? (await readJsonResponse(response)).data;
      } catch (parseError) {
        return res.status(502).json({
          error: "Upstream /models mengembalikan respons yang bukan JSON.",
          status: response.status,
          contentType: parseError.contentType || "unknown",
          upstreamError: parseError.message,
          upstreamPreview: parseError.rawPreview || "",
          endpoint: usedUrl,
          source: "upstream",
        });
      }
      const models = normalizeModels(data?.data || data?.models || data?.results || []);
      let usage = null;

      try {
        const parsedUrl = new URL(usedUrl);
        if (/xkiro[.]com$/i.test(parsedUrl.hostname)) {
          const usageRes = await fetch(parsedUrl.origin + "/v1/usage", {
            headers: {
              "Authorization": "Bearer " + connection.apiKey,
              "x-api-key": connection.apiKey,
              "Accept": "application/json",
            },
            signal: AbortSignal.timeout(8000),
          });
          if (usageRes.ok) usage = await usageRes.json();
        }
      } catch (usageError) {
        console.log("Usage detection skipped:", usageError.message);
      }

      await persistModelCatalog(connection, models, usage, usedUrl);

      return res.json({
        provider: connection.provider,
        connectionId: connection.id,
        models,
        usage,
        endpoint: usedUrl,
        modelCount: models.length,
        freeModelCount: models.filter((m) => ["free"].includes(String(m.accessTier || "").toLowerCase()) || (m.pricing && Number(m.pricing.input ?? -1) === 0 && Number(m.pricing.output ?? -1) === 0)).length,
        paidModelCount: models.filter((m) => ["paid", "premium"].includes(String(m.accessTier || "").toLowerCase()) || (m.pricing && (Number(m.pricing.input ?? 0) > 0 || Number(m.pricing.output ?? 0) > 0))).length,
        supportedParameters: Array.from(new Set(models.flatMap((m) => m.supportedParameters || []))),
        source: "upstream",
        stale: false,
        detectedAt: new Date().toISOString(),
      });
    }

    if (isAnthropicCompatibleProvider(connection.provider)) {
      let baseUrl = connection.providerSpecificData?.baseUrl;
      if (!baseUrl) return res.status(400).json({ error: "No base URL configured for Anthropic compatible provider" });
      baseUrl = baseUrl.replace(/\/$/, "");
      if (baseUrl.endsWith("/messages")) baseUrl = baseUrl.slice(0, -9);

      const candidates = Array.from(new Set([
        baseUrl + "/models",
        baseUrl.endsWith("/v1") ? baseUrl + "/models" : baseUrl + "/v1/models",
        baseUrl.replace(/\/v[0-9]+$/i, "") + "/v1/models",
      ]));
      let response = null;
      let lastError = "";

      for (const url of candidates) {
        try {
          const candidate = await fetch(url, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "x-api-key": connection.apiKey,
              "anthropic-version": "2023-06-01",
              "Authorization": "Bearer " + connection.apiKey,
            },
            signal: AbortSignal.timeout(12000),
          });
          if (candidate.ok) { response = candidate; break; }
          lastError = "HTTP " + candidate.status + ": " + (await candidate.text().catch(() => "")).slice(0, 240);
          if (![404, 405].includes(candidate.status)) break;
        } catch (error) {
          lastError = error.message;
        }
      }

      if (!response) {
        const cached = getCachedModelCatalog(connection);
        if (cached) {
          return res.json({
            provider: connection.provider,
            connectionId: connection.id,
            models: cached.models,
            endpoint: cached.endpoint,
            source: cached.source,
            stale: true,
            detectedAt: cached.detectedAt,
            warning: "Upstream /models gagal; daftar model terakhir dari database ditampilkan.",
            upstreamError: lastError || "Endpoint /models tidak tersedia",
            modelCount: cached.models.length,
            supportedParameters: Array.from(new Set(cached.models.flatMap((m) => m.supportedParameters || []))),
          });
        }
        return res.status(502).json({
          error: "Gagal mengambil daftar model Anthropic. " + (lastError || "Endpoint /models tidak tersedia"),
          candidates,
          source: "upstream",
        });
      }

      let data;
      try {
        ({ data } = await readJsonResponse(response));
      } catch (parseError) {
        return res.status(502).json({
          error: "Upstream Anthropic /models mengembalikan respons yang bukan JSON.",
          status: response.status,
          contentType: parseError.contentType || "unknown",
          upstreamError: parseError.message,
          upstreamPreview: parseError.rawPreview || "",
          endpoint: response.url || baseUrl,
          source: "upstream",
        });
      }
      const models = normalizeModels(data?.data || data?.models || data?.results || []);
      await persistModelCatalog(connection, models, null, candidates.find((url) => url && response.url === url) || baseUrl);
      return res.json({
        provider: connection.provider,
        connectionId: connection.id,
        models,
        modelCount: models.length,
        freeModelCount: models.filter((m) => ["free"].includes(String(m.accessTier || "").toLowerCase()) || (m.pricing && Number(m.pricing.input ?? -1) === 0 && Number(m.pricing.output ?? -1) === 0)).length,
        paidModelCount: models.filter((m) => ["paid", "premium"].includes(String(m.accessTier || "").toLowerCase()) || (m.pricing && (Number(m.pricing.input ?? 0) > 0 || Number(m.pricing.output ?? 0) > 0))).length,
        supportedParameters: Array.from(new Set(models.flatMap((m) => m.supportedParameters || []))),
        source: "upstream",
        stale: false,
        detectedAt: new Date().toISOString(),
      });
    }

    const config = PROVIDER_MODELS_CONFIG[connection.provider];
    if (!config) {
      return res.status(400).json(
        { error: `Provider ${connection.provider} does not support models listing` }
      );
    }

    // Config-driven custom resolver path (OAuth refresh, non-OpenAI shape, etc.)
    if (typeof config.customResolver === "function") {
      const result = await config.customResolver(connection);
      if (result.error) {
        return res.status(result.status || 500).json({ error: result.error });
      }
      return res.json({
        provider: connection.provider,
        connectionId: connection.id,
        models: result.models,
        ...(result.warning ? { warning: result.warning } : {})
      });
    }

    // Get auth token
    const token = connection.providerSpecificData?.copilotToken || connection.accessToken || connection.apiKey;
    if (!token) {
      return res.status(401).json({ error: "No valid token found" });
    }

    // Build request URL
    let url = config.url;
    if (connection.provider === "qwen") {
      url = resolveQwenModelsUrl(connection);
    }
    if (config.authQuery) {
      url += `?${config.authQuery}=${token}`;
    }

    // Build headers
    const headers = { ...config.headers };
    if (config.authHeader && !config.authQuery) {
      headers[config.authHeader] = (config.authPrefix || "") + token;
    }

    // Make request
    const fetchOptions = {
      method: config.method,
      headers
    };

    if (config.body && config.method === "POST") {
      fetchOptions.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Error fetching models from ${connection.provider}:`, errorText);
      return res.status(response.status).json(
        { error: `Failed to fetch models: ${response.status}` }
      );
    }

    let data;
    try {
      ({ data } = await readJsonResponse(response));
    } catch (parseError) {
      console.log(`Invalid JSON from ${connection.provider} models endpoint:`, parseError.message, parseError.rawPreview || "");
      return res.status(502).json({
        error: "Provider /models mengembalikan respons yang bukan JSON.",
        provider: connection.provider,
        status: response.status,
        contentType: parseError.contentType || "unknown",
        upstreamError: parseError.message,
        upstreamPreview: parseError.rawPreview || "",
        endpoint: url,
        source: "upstream",
      });
    }
    const models = config.parseResponse(data);

    return res.json({
      provider: connection.provider,
      connectionId: connection.id,
      models
    });
  } catch (error) {
    console.log("Error fetching provider models:", error);
    return res.status(500).json({
      error: "Gagal mengambil model: " + (error?.message || "Kesalahan server"),
      source: "server",
    });
  }
}
