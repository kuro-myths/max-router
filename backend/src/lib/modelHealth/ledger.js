// In-memory ledger of per-model health, persisted to the `kv` table (scope "modelHealth").
// Deliberately imports only the DB driver + the pure scoring core: requestDetailsRepo calls
// recordModelOutcome() on every request, so anything heavier here would create import cycles.
import { getAdapter } from "../db/driver.js";
import { applyOutcome, createState, outcomeFromDetail, pruneStates } from "./scoring.js";

const SCOPE = "modelHealth";
const KEY = "ledger";
const FLUSH_MS = 5000; // a hard stop can lose at most this much health data

if (!global._modelHealthLedger) global._modelHealthLedger = { states: new Map(), loading: null, dirty: false, timer: null };
const G = global._modelHealthLedger;

export const stateKey = (provider, model) => provider + "::" + model;

async function load() {
  try {
    const db = await getAdapter();
    const row = await db.get("SELECT value FROM kv WHERE scope = ? AND key = ?", [SCOPE, KEY]);
    const saved = row ? JSON.parse(row.value) : [];
    if (Array.isArray(saved)) for (const s of saved) if (s?.provider && s?.model) G.states.set(stateKey(s.provider, s.model), s);
  } catch (e) {
    console.error("[model-health] gagal memuat ledger:", e.message); // start empty rather than block requests
  }
}

/** Load persisted state once; concurrent callers share the same promise. */
export function ensureLoaded() {
  return (G.loading ||= load());
}

export async function flushLedger() {
  if (G.timer) { clearTimeout(G.timer); G.timer = null; }
  if (!G.dirty) return;
  G.dirty = false;
  try {
    const kept = pruneStates([...G.states.values()]);
    if (kept.length !== G.states.size) { G.states.clear(); for (const s of kept) G.states.set(stateKey(s.provider, s.model), s); }
    const db = await getAdapter();
    await db.run(
      "INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value",
      [SCOPE, KEY, JSON.stringify(kept)],
    );
  } catch (e) {
    G.dirty = true; // retry on the next write
    console.error("[model-health] gagal menyimpan ledger:", e.message);
  }
}

function scheduleFlush() {
  G.dirty = true;
  if (G.timer) return;
  G.timer = setTimeout(() => { G.timer = null; flushLedger(); }, FLUSH_MS);
  G.timer.unref?.(); // never keep the process alive just to flush
}

/** Fold an outcome (see scoring.outcomeFromDetail) into the ledger. */
export async function recordOutcome(outcome, now = Date.now()) {
  if (!outcome?.provider || !outcome?.model) return;
  await ensureLoaded();
  const key = stateKey(outcome.provider, outcome.model);
  let state = G.states.get(key);
  if (!state) { state = createState(outcome.provider, outcome.model, now); G.states.set(key, state); }
  const before = state.total;
  applyOutcome(state, outcome, now);
  if (state.total !== before) scheduleFlush();
}

/** Called for every finished request (see requestDetailsRepo.saveRequestDetail). Never throws. */
export async function recordModelOutcome(detail) {
  try { await recordOutcome(outcomeFromDetail(detail)); } catch { /* health tracking must never affect a request */ }
}

export async function allStates() {
  await ensureLoaded();
  return [...G.states.values()];
}

export function getState(provider, model) {
  return G.states.get(stateKey(provider, model));
}
