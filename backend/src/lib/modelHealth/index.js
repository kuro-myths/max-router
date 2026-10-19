// Model health: which provider/model pairs work, which are useful, and which one is best right now.
// Data comes from two sources that feed the same ledger:
//   1. passive  - every real request (see requestDetailsRepo.saveRequestDetail)
//   2. active   - probeModels(): a 1-token ping, on demand or on a timer (MODEL_HEALTH_PROBE_INTERVAL_MIN)
import { getProviderAlias, ALIAS_TO_ID } from "../../shared/constants/providers.js";
import { getDisabledModels } from "../db/repos/disabledModelsRepo.js";
import { allStates, ensureLoaded, flushLedger, getState, recordModelOutcome, recordOutcome } from "./ledger.js";
import { compareEntries, evaluate, pickBest } from "./scoring.js";

export { recordModelOutcome, flushLedger };

const MAX_PROBE = 25;
const DEFAULT_STALE_MS = 10 * 60 * 1000; // live traffic in the last 10 min already tells us the truth

const toEntry = (state, disabled, now) => {
  const alias = getProviderAlias(state.provider);
  return {
    id: alias + "/" + state.model, provider: state.provider, alias, model: state.model,
    disabled: (disabled[alias] || []).includes(state.model),
    ...evaluate(state, now),
  };
};

export async function getModelHealthReport({ status, provider, limit } = {}) {
  const now = Date.now();
  const disabled = await getDisabledModels().catch(() => ({}));
  const all = (await allStates()).map((s) => toEntry(s, disabled, now)).sort(compareEntries);

  const summary = { working: 0, degraded: 0, down: 0, unknown: 0 };
  const byProvider = new Map();
  for (const e of all) {
    summary[e.status] += 1;
    const p = byProvider.get(e.provider) || { provider: e.provider, alias: e.alias, models: 0, working: 0, degraded: 0, down: 0, unknown: 0, bestModel: null };
    p.models += 1; p[e.status] += 1;
    if (!p.bestModel && e.status === "working" && !e.disabled) p.bestModel = e.id; // `all` is sorted best-first
    byProvider.set(e.provider, p);
  }

  let models = all;
  if (status) models = models.filter((e) => e.status === status);
  if (provider) models = models.filter((e) => e.provider === provider || e.alias === provider);
  const cap = Number(limit);
  if (cap > 0) models = models.slice(0, cap);

  const best = pickBest(all);
  return {
    generatedAt: new Date(now).toISOString(),
    summary,
    best: best ? { id: best.id, score: best.score, latencyMs: best.ttftMs ?? best.latencyMs } : null,
    top: all.filter((e) => e.status === "working" && !e.disabled).slice(0, 5).map((e) => ({ id: e.id, score: e.score })),
    providers: [...byProvider.values()].sort((a, b) => b.working - a.working || a.provider.localeCompare(b.provider)),
    models,
  };
}

function parseModelId(id) {
  const text = String(id || "").trim();
  const slash = text.indexOf("/");
  if (slash < 1 || slash === text.length - 1) return null;
  const alias = text.slice(0, slash);
  return { id: text, provider: ALIAS_TO_ID[alias] || alias, model: text.slice(slash + 1) };
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

let probing = false;

/**
 * Ping models with a 1-token request and record the result.
 * - `models`: explicit "alias/model" ids; otherwise the least-recently-seen known models are used.
 * - Real traffic already feeds the ledger through chatCore, so a probe only records directly when
 *   the request never reached chatCore (e.g. no credentials) - otherwise it would count twice.
 */
export async function probeModels({ models, limit = 8, concurrency = 2, staleMs = DEFAULT_STALE_MS } = {}) {
  if (probing) return { busy: true, results: [] };
  probing = true;
  try {
    // getState() reads memory only: without this, persisted history would look like "0 samples" and a
    // concurrent record could make a probe that never reached chatCore appear as if it had.
    await ensureLoaded();
    const cap = Math.max(1, Math.min(MAX_PROBE, Number(limit) || 8));
    let targets;
    if (Array.isArray(models) && models.length) {
      targets = [...new Set(models)].map(parseModelId).filter(Boolean).slice(0, cap);
    } else {
      const now = Date.now();
      const disabled = await getDisabledModels().catch(() => ({}));
      targets = (await allStates())
        .filter((s) => now - s.lastAt > staleMs)
        .filter((s) => !(disabled[getProviderAlias(s.provider)] || []).includes(s.model))
        .sort((a, b) => a.lastAt - b.lastAt)
        .slice(0, cap)
        .map((s) => ({ id: getProviderAlias(s.provider) + "/" + s.model, provider: s.provider, model: s.model }));
    }

    const { pingModelByKind } = await import("../../routes/models/test/ping.js"); // lazy: avoids an import cycle with the DB layer
    const results = await pool(targets, Math.max(1, Math.min(4, concurrency)), async (t) => {
      const before = getState(t.provider, t.model)?.total || 0;
      let r;
      try { r = await pingModelByKind(t.id, "llm"); } catch (e) { r = { ok: false, error: e?.message || String(e), status: 0 }; }
      await new Promise((resolve) => setTimeout(resolve, 80)); // let chatCore's async record land
      const reachedChatCore = (getState(t.provider, t.model)?.total || 0) > before;
      if (!reachedChatCore) {
        await recordOutcome({ provider: t.provider, model: t.model, ok: !!r.ok, status: r.status || 0, error: r.error || "", totalMs: r.latencyMs, ttftMs: r.latencyMs });
      }
      return { id: t.id, ok: !!r.ok, latencyMs: r.latencyMs ?? null, error: r.ok ? null : (r.error || "gagal"), recordedBy: reachedChatCore ? "router" : "probe" };
    });
    return { busy: false, probed: results.length, working: results.filter((r) => r.ok).length, results };
  } finally {
    probing = false;
  }
}

/** Optional background probing. Off by default: probes are tiny but still use provider quota. */
export function startModelHealthMonitor() {
  const minutes = Number(process.env.MODEL_HEALTH_PROBE_INTERVAL_MIN) || 0;
  if (minutes <= 0) return null;
  const limit = Number(process.env.MODEL_HEALTH_PROBE_LIMIT) || 5;
  const timer = setInterval(() => {
    probeModels({ limit, staleMs: minutes * 60 * 1000 }).catch((e) => console.error("[model-health] probe terjadwal gagal:", e.message));
  }, minutes * 60 * 1000);
  timer.unref?.();
  console.log(`[model-health] probe terjadwal aktif: setiap ${minutes} menit, maks ${limit} model.`);
  return timer;
}
