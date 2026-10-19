import test from "node:test";
import assert from "node:assert/strict";
import { applyOutcome, classifyOutcome, compareEntries, createState, evaluate, outcomeFromDetail, pickBest, pruneStates, HALF_LIFE_MS } from "../src/lib/modelHealth/scoring.js";

const T0 = 1_700_000_000_000;
const ok = (ms = 800, extra = {}) => ({ ok: true, totalMs: ms, ttftMs: ms / 2, ...extra });
const fail = (status, error = "boom") => ({ ok: false, status, error });
function run(outcomes, t = T0) { const s = createState("p", "m", t); outcomes.forEach((o, i) => applyOutcome(s, o, t + i)); return s; }

test("classifyOutcome: what counts against a model", () => {
  assert.equal(classifyOutcome({ ok: true }), "ok");
  assert.equal(classifyOutcome({ status: 429 }), "rate_limited");
  for (const c of [401, 402, 403]) assert.equal(classifyOutcome({ status: c }), "auth");
  for (const c of [400, 413, 422]) assert.equal(classifyOutcome({ status: c }), "client");
  for (const c of [404, 408, 500, 502, 503, 0]) assert.equal(classifyOutcome({ status: c }), "server");
  assert.equal(classifyOutcome({ status: 499 }), "aborted");
  assert.equal(classifyOutcome({ status: 502, error: "AbortError: aborted" }), "aborted");
});

test("client mistakes and aborts are not evidence about the model", () => {
  const s = run([fail(400), fail(422), fail(499), ok(), ok()]);
  assert.equal(s.total, 2);
  assert.equal(evaluate(s, T0 + 10).successRate, 1);
});

test("a model with no data is unknown and sits at the neutral score", () => {
  const e = evaluate(createState("p", "m", T0), T0);
  assert.equal(e.status, "unknown");
  assert.equal(e.score, 50);
});

test("healthy model is working; flaky is degraded; dead is down", () => {
  assert.equal(evaluate(run(Array(10).fill(ok())), T0 + 20).status, "working");
  assert.equal(evaluate(run([ok(), ok(), ok(), ok(), ok(), ok(), ok(), fail(500), fail(500), ok()]), T0 + 20).status, "degraded"); // 80%
  assert.equal(evaluate(run([ok(), fail(500), fail(500), fail(500), fail(500)]), T0 + 20).status, "down");
});

test("a model that fails about half the time is degraded (sometimes works), not down", () => {
  const flaky = [];
  for (let i = 0; i < 8; i++) flaky.push(ok(), fail(503));
  assert.equal(evaluate(run(flaky), T0 + 50).status, "degraded");
});

test("three hard failures in a row mark a formerly good model down", () => {
  const s = run([...Array(20).fill(ok()), fail(401), fail(401), fail(401)]);
  assert.equal(evaluate(s, T0 + 100).status, "down");
});

test("rate limiting counts half and is flagged, not treated as dead", () => {
  const e = evaluate(run([ok(), ok(), fail(429), fail(429), ok()]), T0 + 20);
  assert.notEqual(e.status, "down");
  assert.ok(e.reasons.some((r) => r.includes("429")));
});

test("ranking: reliable and fast beats slow beats unreliable; newcomers cannot jump the queue", () => {
  const mk = (id, outcomes) => ({ id, ...evaluate(run(outcomes), T0 + 50) });
  const fast = mk("fast", Array(10).fill(ok(600)));
  const slow = mk("slow", Array(10).fill(ok(9000)));
  const flaky = mk("flaky", [ok(), fail(500), ok(), fail(500), ok(), fail(500)]);
  const fresh = mk("fresh", [ok(100)]); // one lucky sample
  assert.ok(fast.score > slow.score && slow.score > flaky.score);
  assert.ok(fresh.score < fast.score, "one sample must not outrank a proven model");
  assert.equal(pickBest([flaky, slow, fast, fresh]).id, "fast");
});

test("pickBest only recommends working, enabled models", () => {
  const down = { id: "d", status: "down", score: 99, ttftMs: 1 };
  const degraded = { id: "g", status: "degraded", score: 95, ttftMs: 1 };
  const disabled = { id: "x", status: "working", score: 90, disabled: true, ttftMs: 1 };
  assert.equal(pickBest([down, degraded, disabled]), null);
  assert.equal(pickBest([down, degraded, disabled, { id: "w", status: "working", score: 60, ttftMs: 1 }]).id, "w");
  assert.equal(pickBest([{ id: "w", status: "working", score: 60 }], { minScore: 70 }), null);
});

test("empty replies reduce usefulness and trigger a degraded verdict when they dominate", () => {
  const good = evaluate(run(Array(10).fill(ok())), T0 + 20);
  const empty = evaluate(run(Array(10).fill(ok(800, { empty: true }))), T0 + 20);
  assert.ok(empty.score < good.score);
  assert.equal(empty.status, "degraded");
});

test("evidence fades: after a day of silence a model falls back to unknown", () => {
  const s = run(Array(10).fill(ok()));
  assert.equal(evaluate(s, T0 + 100).status, "working");
  assert.equal(evaluate(s, T0 + 2 * HALF_LIFE_MS).status, "working"); // 10 -> 2.5 effective samples
  assert.equal(evaluate(s, T0 + 4 * HALF_LIFE_MS).status, "unknown"); // 10 -> 0.6
});

test("recovery: recent successes outweigh old failures", () => {
  const s = createState("p", "m", T0);
  for (let i = 0; i < 6; i++) applyOutcome(s, fail(500), T0 + i);
  assert.equal(evaluate(s, T0 + 10).status, "down");
  const later = T0 + 3 * HALF_LIFE_MS;
  for (let i = 0; i < 6; i++) applyOutcome(s, ok(), later + i);
  assert.equal(evaluate(s, later + 10).status, "working");
});

test("evaluate never mutates the stored state", () => {
  const s = run(Array(5).fill(ok()));
  const copy = JSON.stringify(s);
  evaluate(s, T0 + 3 * HALF_LIFE_MS);
  assert.equal(JSON.stringify(s), copy);
});

test("outcomeFromDetail: streaming placeholder is ignored, real records are mapped", () => {
  const base = { provider: "cc", model: "m1", latency: { total: 900, ttft: 300 }, tokens: { completion_tokens: 5 } };
  assert.equal(outcomeFromDetail({ ...base, status: "success", response: { type: "streaming", content: "[Streaming in progress...]" } }), null);
  const good = outcomeFromDetail({ ...base, status: "success", response: { content: "hello", type: "streaming" } });
  assert.deepEqual([good.ok, good.empty, good.ttftMs], [true, false, 300]);
  const emptyStream = outcomeFromDetail({ ...base, tokens: {}, status: "success", response: { content: "[Empty streaming response]" } });
  assert.equal(emptyStream.empty, true);
  const toolCall = outcomeFromDetail({ ...base, status: "success", response: { content: null } }); // tokens>0 => not empty
  assert.equal(toolCall.empty, false);
  const err = outcomeFromDetail({ ...base, status: "error", response: { error: "upstream down", status: 503 } });
  assert.deepEqual([err.ok, err.status, err.error], [false, 503, "upstream down"]);
  assert.equal(outcomeFromDetail({ provider: "unknown", model: "x", status: "success", response: {} }), null);
});

test("compareEntries / pruneStates", () => {
  const list = [{ id: "b", status: "down", score: 90 }, { id: "a", status: "working", score: 10 }, { id: "c", status: "unknown", score: 50 }];
  assert.deepEqual(list.sort(compareEntries).map((e) => e.id), ["a", "c", "b"]);
  const now = T0;
  const kept = pruneStates([{ lastAt: now }, { lastAt: now - 20 * 86400000 }, { lastAt: now - 1000 }], now, { maxKeys: 5 });
  assert.equal(kept.length, 2);
  assert.equal(pruneStates([{ lastAt: now }, { lastAt: now - 1 }, { lastAt: now - 2 }], now, { maxKeys: 2 }).length, 2);
});
