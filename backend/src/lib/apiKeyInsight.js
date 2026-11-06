import { getProviderNodeById } from "../models/index.js";
import { isAnthropicCompatibleProvider, isCustomEmbeddingProvider, isOpenAICompatibleProvider } from "../shared/constants/providers.js";
import { resolveOllamaLocalHost, resolveXiaomiTokenplanBaseUrl } from "../../open-sse/config/providers.js";
import { classifyKeyInsight, extractModels, parseRateLimitHeaders, readErrorMessage, topOwners } from "./apiKeyInsightParse.js";

const SAMPLE_LIMIT = 12;
const REQUEST_TIMEOUT_MS = 12000;

const MODEL_ENDPOINTS = {
  openai: "https://api.openai.com/v1/models",
  "vercel-ai-gateway": "https://ai-gateway.vercel.sh/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
  deepseek: "https://api.deepseek.com/models",
  groq: "https://api.groq.com/openai/v1/models",
  xai: "https://api.x.ai/v1/models",
  mistral: "https://api.mistral.ai/v1/models",
  perplexity: "https://api.perplexity.ai/models",
  together: "https://api.together.xyz/v1/models",
  fireworks: "https://api.fireworks.ai/inference/v1/models",
  cerebras: "https://api.cerebras.ai/v1/models",
  cohere: "https://api.cohere.ai/v1/models",
  nebius: "https://api.studio.nebius.ai/v1/models",
  siliconflow: "https://api.siliconflow.cn/v1/models",
  hyperbolic: "https://api.hyperbolic.xyz/v1/models",
  ollama: "https://ollama.com/api/tags",
  assemblyai: "https://api.assemblyai.com/v1/account",
  nanobanana: "https://api.nanobananaapi.ai/v1/models",
  chutes: "https://llm.chutes.ai/v1/models",
  nvidia: "https://integrate.api.nvidia.com/v1/models",
  "xiaomi-mimo": "https://api.xiaomimimo.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/models",
};

function joinUrl(base, suffix) {
  return `${String(base || "").replace(/\/+$/, "")}${suffix}`;
}

function scrub(text, apiKey) {
  if (!text) return "";
  let out = String(text);
  if (apiKey) out = out.split(apiKey).join("***");
  return out.replace(/([?&]key=)[^&\s]+/gi, "$1***").slice(0, 300);
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return null; }
}

async function readBody(response) {
  const text = await response.text().catch(() => "");
  if (!text) return { text: "", json: null };
  try { return { text, json: JSON.parse(text) }; } catch { return { text, json: null }; }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const body = await readBody(response);
  return { response, ...body };
}

function bearerHeaders(apiKey, extra = {}) {
  return { Accept: "application/json", Authorization: `Bearer ${apiKey}`, ...extra };
}

async function resolveTarget(provider, apiKey, providerSpecificData) {
  if (provider === "gemini") {
    return {
      kind: "models",
      pages: true,
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`,
      fallbackUrls: [`https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`],
      headers: { Accept: "application/json" },
    };
  }
  if (provider === "ollama-local") {
    const host = resolveOllamaLocalHost({ providerSpecificData });
    return { kind: "models", url: joinUrl(host, "/api/tags"), headers: apiKey ? bearerHeaders(apiKey) : { Accept: "application/json" } };
  }
  if (provider === "xiaomi-tokenplan") {
    const base = resolveXiaomiTokenplanBaseUrl({ providerSpecificData });
    return { kind: "models", url: joinUrl(base, "/models"), headers: bearerHeaders(apiKey) };
  }
  if (provider === "cloudflare-ai") {
    const accountId = providerSpecificData?.accountId;
    if (!accountId) return null;
    return {
      kind: "models",
      url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search`,
      headers: bearerHeaders(apiKey),
    };
  }
  if (provider === "anthropic") {
    return {
      kind: "models",
      url: MODEL_ENDPOINTS.anthropic,
      headers: { ...bearerHeaders(apiKey), "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    };
  }
  if (MODEL_ENDPOINTS[provider]) {
    return {
      kind: provider === "assemblyai" ? "account" : "models",
      url: MODEL_ENDPOINTS[provider],
      headers: bearerHeaders(apiKey),
    };
  }

  if (isOpenAICompatibleProvider(provider) || isAnthropicCompatibleProvider(provider) || isCustomEmbeddingProvider(provider)) {
    const node = await getProviderNodeById(provider);
    if (!node?.baseUrl) return null;
    const base = String(node.baseUrl).trim().replace(/\/+$/, "").replace(/\/messages$/, "");
    if (isAnthropicCompatibleProvider(provider)) {
      return {
        kind: "models",
        url: joinUrl(base, "/models"),
        headers: { ...bearerHeaders(apiKey), "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      };
    }
    return { kind: "models", url: joinUrl(base, "/models"), headers: bearerHeaders(apiKey) };
  }
  return null;
}

async function collectModels(target) {
  const urls = [target.url, ...(target.fallbackUrls || [])];
  let first = null;
  const collected = [];
  for (const startUrl of urls) {
    let url = startUrl;
    let pageCount = target.pages ? 3 : 1;
    for (let page = 0; page < pageCount; page++) {
      const result = await requestJson(url, { headers: target.headers });
      if (!first || (first.response.status === 404 && result.response.status !== 404)) first = result;
      if (!result.response.ok) break;
      if (!first) first = result;
      collected.push(...extractModels(result.json));
      const token = result.json?.nextPageToken;
      if (!target.pages || !token) return { first: first || result, models: collected };
      const next = new URL(startUrl);
      next.searchParams.set("pageToken", token);
      url = next.toString();
    }
    if (first && first.response.ok) break;
    if (collected.length) break;
  }
  return { first, models: collected };
}

async function readOpenRouterQuota(apiKey) {
  try {
    const { response, json, text } = await requestJson("https://openrouter.ai/api/v1/key", { headers: bearerHeaders(apiKey) });
    if (!response.ok) return { quota: null, rateLimit: parseRateLimitHeaders(response.headers), errorText: readErrorMessage(text), httpStatus: response.status };
    const data = json?.data || json || {};
    const limit = typeof data.limit === "number" ? data.limit : null;
    const remaining = typeof data.limit_remaining === "number" ? data.limit_remaining : null;
    return {
      quota: {
        limit,
        remaining,
        used: typeof data.usage === "number" ? data.usage : null,
        currency: "USD",
        plan: data.is_free_tier ? "Gratis" : (limit == null ? "Tanpa batas harian" : "Berbayar"),
        label: data.label || null,
      },
      rateLimit: parseRateLimitHeaders(response.headers),
      errorText: "",
      httpStatus: response.status,
    };
  } catch (error) {
    return { quota: null, rateLimit: parseRateLimitHeaders(null), errorText: error?.message || "", httpStatus: null };
  }
}

function publicInsight(partial) {
  const models = partial.models || [];
  const unique = [];
  const seen = new Set();
  for (const model of models) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    unique.push(model);
  }
  const classified = classifyKeyInsight(partial);
  const modelCount = partial.kind === "account" ? null : (partial.listed ? unique.length : null);
  let note = partial.note || null;
  if (!note && classified.status === "unknown") {
    note = "Provider ini tidak membuka daftar model atau limit lewat endpoint yang dikenali.";
  }
  if (!note && classified.status === "ok" && !partial.rateLimit?.present && !partial.quota) {
    note = "Kunci diterima. Provider tidak mengirim sisa limit pada daftar model.";
  }
  if (!note && classified.status === "limited") {
    note = partial.provider === "xai" && partial.httpStatus === 403
      ? "Kunci dikenali, tetapi kredit atau izin ditolak."
      : "Kunci kena limit atau kuota habis.";
  }
  return {
    status: classified.status,
    valid: classified.valid,
    limited: classified.limited,
    provider: partial.provider,
    modelCount,
    modelSample: unique.slice(0, SAMPLE_LIMIT).map((model) => model.id),
    owners: topOwners(unique),
    rateLimit: partial.rateLimit?.present ? partial.rateLimit : null,
    quota: partial.quota || null,
    latencyMs: partial.latencyMs,
    checkedAt: new Date().toISOString(),
    httpStatus: partial.httpStatus ?? null,
    endpointHost: partial.endpointHost || null,
    note,
    error: classified.status === "ok" ? null : (partial.errorText || null),
  };
}

export async function inspectApiKey({ provider, apiKey, providerSpecificData, defaultModel }) {
  const started = Date.now();
  const safeProvider = typeof provider === "string" ? provider : "";
  if (!safeProvider || !apiKey) {
    return publicInsight({
      provider: safeProvider,
      httpStatus: null,
      rateLimit: parseRateLimitHeaders(null),
      errorText: "Provider dan API key diperlukan",
      quota: null,
      models: [],
      listed: false,
      latencyMs: 0,
    });
  }

  let target = null;
  try {
    target = await resolveTarget(safeProvider, apiKey, providerSpecificData || {});
  } catch (error) {
    return publicInsight({
      provider: safeProvider,
      httpStatus: null,
      rateLimit: parseRateLimitHeaders(null),
      errorText: scrub(error?.message || "Gagal menyiapkan pemeriksaan", apiKey),
      quota: null,
      models: [],
      listed: false,
      kind: "models",
      latencyMs: Date.now() - started,
    });
  }

  if (!target) {
    return publicInsight({
      provider: safeProvider,
      httpStatus: null,
      rateLimit: parseRateLimitHeaders(null),
      errorText: "",
      quota: null,
      models: [],
      listed: false,
      latencyMs: Date.now() - started,
      note: defaultModel
        ? `Model bawaan ${defaultModel} tersimpan, tetapi provider ini tidak punya endpoint katalog yang dikenali.`
        : "Provider ini tidak punya endpoint katalog yang dikenali. Status valid tetap dicek terpisah.",
    });
  }

  try {
    const quotaPromise = safeProvider === "openrouter" ? readOpenRouterQuota(apiKey) : Promise.resolve(null);
    const [{ first, models }, quotaResult] = await Promise.all([collectModels(target), quotaPromise]);
    const rateLimit = parseRateLimitHeaders(first?.response?.headers);
    if (quotaResult?.rateLimit?.present && !rateLimit.present) {
      rateLimit.requests = quotaResult.rateLimit.requests || rateLimit.requests;
      rateLimit.tokens = quotaResult.rateLimit.tokens || rateLimit.tokens;
      rateLimit.retryAfter = quotaResult.rateLimit.retryAfter;
      rateLimit.retryAfterSec = quotaResult.rateLimit.retryAfterSec;
      rateLimit.present = true;
    }
    const errorText = first?.response?.ok ? "" : scrub(readErrorMessage(first?.text), apiKey);
    return publicInsight({
      provider: safeProvider,
      httpStatus: first?.response?.status ?? null,
      rateLimit,
      errorText: errorText || scrub(quotaResult?.errorText || "", apiKey),
      quota: quotaResult?.quota || null,
      models,
      listed: target.kind !== "account" && !!first?.response?.ok,
      kind: target.kind,
      endpointHost: hostOf(target.url),
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return publicInsight({
      provider: safeProvider,
      httpStatus: null,
      rateLimit: parseRateLimitHeaders(null),
      errorText: scrub(timedOut ? "Waktu pemeriksaan habis" : (error?.message || "Gagal menghubungi provider"), apiKey),
      quota: null,
      models: [],
      listed: false,
      kind: target.kind,
      endpointHost: hostOf(target.url),
      latencyMs: Date.now() - started,
    });
  }
}
