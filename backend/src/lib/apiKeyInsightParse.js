/**
 * Pure helpers for API-key insight: rate-limit headers, model catalogs, status.
 * No I/O so the dashboard probe and unit tests share one interpretation.
 */

function firstNumber(value) {
  if (value == null || value === "") return null;
  const match = String(value).trim().match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function header(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const target = name.toLowerCase();
  const key = Object.keys(headers).find((item) => item.toLowerCase() === target);
  return key ? headers[key] : null;
}

function bucket(limit, remaining, reset) {
  if (limit == null && remaining == null && !reset) return null;
  return { limit, remaining, reset: reset || null };
}

export function parseRateLimitHeaders(headers) {
  const requests = bucket(
    firstNumber(header(headers, "x-ratelimit-limit-requests") ?? header(headers, "anthropic-ratelimit-requests-limit") ?? header(headers, "x-ratelimit-limit") ?? header(headers, "ratelimit-limit") ?? header(headers, "x-rpm-limit")),
    firstNumber(header(headers, "x-ratelimit-remaining-requests") ?? header(headers, "anthropic-ratelimit-requests-remaining") ?? header(headers, "x-ratelimit-remaining") ?? header(headers, "ratelimit-remaining") ?? header(headers, "x-rpm-remaining")),
    header(headers, "x-ratelimit-reset-requests") || header(headers, "anthropic-ratelimit-requests-reset") || header(headers, "x-ratelimit-reset") || header(headers, "ratelimit-reset") || null
  );
  const tokens = bucket(
    firstNumber(header(headers, "x-ratelimit-limit-tokens") ?? header(headers, "anthropic-ratelimit-tokens-limit") ?? header(headers, "anthropic-ratelimit-input-tokens-limit")),
    firstNumber(header(headers, "x-ratelimit-remaining-tokens") ?? header(headers, "anthropic-ratelimit-tokens-remaining") ?? header(headers, "anthropic-ratelimit-input-tokens-remaining")),
    header(headers, "x-ratelimit-reset-tokens") || header(headers, "anthropic-ratelimit-tokens-reset") || null
  );
  const retryRaw = header(headers, "retry-after");
  const retryAfterSec = firstNumber(retryRaw);
  const hasAny = !!(requests || tokens || retryRaw);
  return {
    requests,
    tokens,
    retryAfter: retryRaw || null,
    retryAfterSec: retryRaw && retryAfterSec != null && String(retryRaw).trim() === String(retryAfterSec) ? retryAfterSec : retryAfterSec,
    present: hasAny,
  };
}

function modelId(row) {
  if (typeof row === "string") return row.replace(/^models\//, "");
  if (!row || typeof row !== "object") return "";
  const raw = row.id || row.name || row.model || row.slug || "";
  return String(raw).replace(/^models\//, "");
}

export function extractModels(payload) {
  if (!payload) return [];
  const rows = Array.isArray(payload) ? payload
    : Array.isArray(payload.data) ? payload.data
    : Array.isArray(payload.models) ? payload.models
    : Array.isArray(payload.result) ? payload.result
    : Array.isArray(payload.data?.models) ? payload.data.models
    : [];
  const models = [];
  const seen = new Set();
  for (const row of rows) {
    const id = modelId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const owner = typeof row === "object" && row
      ? (row.owned_by || row.ownedBy || row.provider || null)
      : null;
    const name = typeof row === "object" && row
      ? (row.display_name || row.displayName || row.name || id)
      : id;
    models.push({ id, name: String(name).replace(/^models\//, ""), owner: owner ? String(owner) : null });
  }
  return models;
}

export function topOwners(models, limit = 4) {
  const counts = new Map();
  for (const model of models) {
    const key = model.owner || "lainnya";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

const QUOTA_TEXT = /rate limit|too many requests|quota exceeded|insufficient_quota|resource_exhausted|exceeded your current quota|credit balance is too low|insufficient credits|billing/;

export function classifyKeyInsight({ httpStatus, provider, rateLimit, errorText, quota }) {
  const text = String(errorText || "").toLowerCase();
  const quotaHit = QUOTA_TEXT.test(text);
  const headerLimited = rateLimit?.requests?.remaining === 0
    || rateLimit?.tokens?.remaining === 0
    || quota?.remaining === 0;
  const xaiNoCredit = provider === "xai" && httpStatus === 403;

  if (httpStatus === 401 || (httpStatus === 403 && !xaiNoCredit && !quotaHit)) {
    return { status: "invalid", valid: false, limited: false };
  }
  if (httpStatus === 429 || quotaHit || headerLimited || xaiNoCredit) {
    return { status: "limited", valid: true, limited: true };
  }
  if (typeof httpStatus === "number" && httpStatus >= 200 && httpStatus < 300) {
    return { status: "ok", valid: true, limited: false };
  }
  return { status: "unknown", valid: null, limited: false };
}

export function readErrorMessage(text) {
  if (!text) return "";
  try {
    const data = JSON.parse(text);
    const message = data?.error?.message || data?.error || data?.message || data?.msg || "";
    return typeof message === "string" ? message : JSON.stringify(message);
  } catch {
    return String(text).slice(0, 300);
  }
}
