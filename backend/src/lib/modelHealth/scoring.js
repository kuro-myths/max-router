// Pure scoring core for the model health ledger (no I/O, no imports) so it is unit-testable.
//
// Every provider/model pair keeps a small "state" of exponentially decayed counters
// (half-life HALF_LIFE_MS). Recent behaviour therefore dominates, old evidence fades by itself,
// storage stays O(models) instead of O(requests), and a model nobody has called for a day
// naturally falls back to "unknown" (which is the cue to probe it again).
//
//   works  = reliability  (success rate, smoothed with a prior so 1/1 is not "100%")
//   useful = speed (time to first token) + returns real content (not empty replies)
//   score  = 0..100, shrunk toward 50 while evidence is thin so newcomers cannot outrank proven models

export const HALF_LIFE_MS = 6 * 3600 * 1000;
export const MIN_EVIDENCE = 2; // effective samples needed before we dare give a verdict
const PRIOR_OK = 1.6, PRIOR_N = 2; // equals "2 samples at 80% success" as a starting belief
const CONFIDENCE_K = 3;
export const WEIGHTS = { reliability: 0.6, speed: 0.25, usefulness: 0.15 };

export function createState(provider, model, now = Date.now()) {
  return {
    provider, model,
    okW: 0, errW: 0, emptyW: 0, rlW: 0, // decayed weights: successes, errors, empty replies, rate-limits
    latSum: 0, latW: 0, ttftSum: 0, ttftW: 0, // decayed sums -> weighted means
    total: 0, okTotal: 0, consecutiveFails: 0,
    lastAt: now, lastOkAt: 0, lastErrorAt: 0, lastError: "", lastErrorKind: "",
  };
}

/** What kind of outcome is this? Decides how (and whether) it counts against the model. */
export function classifyOutcome({ ok, status, error } = {}) {
  if (ok) return "ok";
  const code = Number(status) || 0;
  const text = String(error || "");
  if (code === 499 || /abort/i.test(text)) return "aborted"; // the client left; says nothing about the model
  if (code === 429) return "rate_limited"; // works, but throttled
  if (code === 401 || code === 402 || code === 403) return "auth"; // credentials / quota: unusable for now
  if (code === 400 || code === 413 || code === 422) return "client"; // the request was bad, not the model
  if (code === 404 || code === 408 || code >= 500 || code === 0) return "server";
  return "client";
}

const ERROR_WEIGHT = { rate_limited: 0.5, auth: 1, server: 1 }; // aborted/client are ignored entirely

function decayFactor(from, to) {
  return to > from ? Math.pow(0.5, (to - from) / HALF_LIFE_MS) : 1;
}

function decayInPlace(state, now) {
  const f = decayFactor(state.lastAt, now);
  if (f !== 1) {
    for (const k of ["okW", "errW", "emptyW", "rlW", "latSum", "latW", "ttftSum", "ttftW"]) state[k] *= f;
    state.lastAt = now;
  }
  return state;
}

/** Fold one request outcome into a state (mutates and returns it). */
export function applyOutcome(state, outcome, now = Date.now()) {
  const kind = classifyOutcome(outcome);
  if (kind === "aborted" || kind === "client") return state; // not evidence about the model
  decayInPlace(state, now);
  state.total += 1;
  if (kind === "ok") {
    state.okTotal += 1;
    state.okW += 1;
    if (outcome.empty) state.emptyW += 1;
    const total = Number(outcome.totalMs) || 0, ttft = Number(outcome.ttftMs) || 0;
    if (total > 0) { state.latSum += total; state.latW += 1; }
    if (ttft > 0) { state.ttftSum += ttft; state.ttftW += 1; }
    state.consecutiveFails = 0;
    state.lastOkAt = now;
  } else {
    state.errW += ERROR_WEIGHT[kind];
    if (kind === "rate_limited") state.rlW += 1; else state.consecutiveFails += 1;
    state.lastErrorAt = now;
    state.lastError = String(outcome.error || "").slice(0, 200);
    state.lastErrorKind = kind;
  }
  return state;
}

const pct = (x) => Math.round(x * 100);
const seconds = (ms) => (ms / 1000).toFixed(ms < 10000 ? 1 : 0);

/** Turn a state into a verdict. Never mutates the stored state. */
export function evaluate(stored, now = Date.now()) {
  const s = decayInPlace({ ...stored }, now);
  const n = s.okW + s.errW;
  const rawRate = n > 0 ? s.okW / n : null;
  const reliability = (s.okW + PRIOR_OK) / (n + PRIOR_N);
  const ttftMs = s.ttftW >= 0.5 ? s.ttftSum / s.ttftW : null;
  const latencyMs = s.latW >= 0.5 ? s.latSum / s.latW : null;
  const speedMs = ttftMs ?? latencyMs; // time to first token is the fairer measure of "fast"
  const speed = speedMs == null ? 0.5 : 1 / (1 + speedMs / 4000); // 1s=.80, 4s=.50, 12s=.25
  const emptyRate = s.okW > 0 ? Math.min(1, s.emptyW / s.okW) : 0;
  const usefulness = 1 - emptyRate;
  const raw = WEIGHTS.reliability * reliability + WEIGHTS.speed * speed + WEIGHTS.usefulness * usefulness;
  const confidence = n / (n + CONFIDENCE_K);
  const score = Math.round(100 * (confidence * raw + (1 - confidence) * 0.5));

  let status;
  if (n < MIN_EVIDENCE) status = "unknown";
  else if (rawRate < 0.35 || (s.consecutiveFails >= 3 && s.lastErrorAt > s.lastOkAt)) status = "down";
  else if (rawRate < 0.85 || s.rlW / n > 0.3 || s.consecutiveFails >= 2 || emptyRate > 0.5) status = "degraded";
  else status = "working";

  const reasons = [];
  if (n >= MIN_EVIDENCE) reasons.push(`Tingkat sukses ${pct(rawRate)}% dari ${n.toFixed(1)} sampel terbaru`);
  else reasons.push("Belum cukup data terbaru; jalankan probe untuk memastikan");
  if (speedMs != null) reasons.push(`${ttftMs != null ? "Respons pertama" : "Latensi"} rata-rata ${seconds(speedMs)} dtk`);
  if (s.consecutiveFails >= 2) reasons.push(`${s.consecutiveFails} kegagalan berturut-turut (${s.lastErrorKind})`);
  if (n > 0 && s.rlW / n > 0.3) reasons.push("Sering dibatasi (429)");
  if (emptyRate > 0.25) reasons.push(`${pct(emptyRate)}% respons kosong`);

  return {
    status, score,
    successRate: rawRate == null ? null : Math.round(rawRate * 1000) / 1000,
    latencyMs: latencyMs == null ? null : Math.round(latencyMs),
    ttftMs: ttftMs == null ? null : Math.round(ttftMs),
    samples: Math.round(n * 10) / 10,
    emptyRate: Math.round(emptyRate * 1000) / 1000,
    consecutiveFails: s.consecutiveFails,
    total: s.total,
    lastOkAt: s.lastOkAt || null,
    lastErrorAt: s.lastErrorAt || null,
    lastError: s.lastError || null,
    lastErrorKind: s.lastErrorKind || null,
    reasons,
  };
}

const STATUS_ORDER = { working: 0, degraded: 1, unknown: 2, down: 3 };

/** Best first: working beats degraded beats unknown beats down; then score; then faster. */
export function compareEntries(a, b) {
  return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    || (b.score - a.score)
    || ((a.ttftMs ?? a.latencyMs ?? Infinity) - (b.ttftMs ?? b.latencyMs ?? Infinity))
    || String(a.id).localeCompare(String(b.id));
}

/** The model to recommend: the top-scoring one that is actually working (never degraded/unknown/down). */
export function pickBest(entries, { minScore = 0 } = {}) {
  return entries.filter((e) => e.status === "working" && !e.disabled && e.score >= minScore).sort(compareEntries)[0] || null;
}

/** Keep the ledger bounded: drop stale states, then cap by recency. */
export function pruneStates(states, now = Date.now(), { maxAgeMs = 14 * 86400000, maxKeys = 2000 } = {}) {
  return states
    .filter((s) => now - s.lastAt <= maxAgeMs)
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, maxKeys);
}

/** Turn a finished request record (what saveRequestDetail receives) into an outcome, or null to ignore it. */
export function outcomeFromDetail(detail) {
  const provider = detail?.provider, model = detail?.model;
  if (!provider || !model || provider === "unknown" || model === "unknown") return null;
  const resp = detail.response || {};
  if (detail.status === "success" && resp.type === "streaming" && resp.content === "[Streaming in progress...]") return null; // placeholder; the real record follows
  const ok = detail.status === "success";
  const text = String(resp.content ?? "").trim();
  const completion = Number(detail.tokens?.completion_tokens ?? detail.tokens?.output_tokens ?? 0) || 0;
  const empty = ok && (text === "" || text === "[Empty streaming response]") && !resp.thinking && completion === 0;
  return {
    provider, model, ok,
    status: Number(resp.status) || 0,
    error: ok ? "" : (typeof resp.error === "string" ? resp.error : JSON.stringify(resp.error || "")),
    totalMs: detail.latency?.total, ttftMs: detail.latency?.ttft,
    empty,
  };
}
