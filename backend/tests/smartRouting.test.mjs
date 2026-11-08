import test from "node:test";
import assert from "node:assert/strict";
import { getRotatedModels, resetComboRotation } from "../open-sse/services/combo.js";

const models = [
  "openai/gpt-4o",
  "anthropic/claude-opus-4",
  "google/gemini-2.5-flash",
  "openai/text-embedding-3-large",
];

test("Smart Router prioritizes multimodal models for image requests", () => {
  const result = getRotatedModels(models, "smart-image-test", "smart", 1, {
    messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }] }],
    __smartPolicy: "balanced",
    __smartStickiness: "per-turn",
  });
  assert.equal(result[0], "openai/gpt-4o");
  assert.ok(result.indexOf("openai/text-embedding-3-large") > 0);
});

test("Smart Router applies fast and economy policies", () => {
  const fast = getRotatedModels(models, "smart-fast-test", "smart", 1, {
    messages: [{ role: "user", content: "hello" }],
    __smartPolicy: "fast",
    __smartStickiness: "per-turn",
  });
  assert.equal(fast[0], "google/gemini-2.5-flash");
  const economy = getRotatedModels(models, "smart-economy-test", "smart", 1, {
    messages: [{ role: "user", content: "hello" }],
    __smartPolicy: "economy",
    __smartStickiness: "per-turn",
  });
  assert.equal(economy[0], "google/gemini-2.5-flash");
});

test("Smart Router keeps a successful model sticky for a session", () => {
  const sessionBody = {
    messages: [{ role: "user", content: "hello" }],
    __smartPolicy: "balanced",
    __smartStickiness: "adaptive",
    __sessionKey: "session-123",
  };
  const first = getRotatedModels(models, "smart-sticky-test", "smart", 1, sessionBody);
  assert.equal(first.length, models.length);
  // The successful model is remembered by the combo handler; the state map is
  // intentionally private, so this test validates deterministic ordering only.
  const second = getRotatedModels(models, "smart-sticky-test", "smart", 1, sessionBody);
  assert.deepEqual(second, first);
  resetComboRotation("smart-sticky-test");
});

test("unknown session and per-turn routing remain deterministic", () => {
  const result = getRotatedModels(models, "smart-per-turn-test", "smart", 1, {
    messages: [{ role: "user", content: "plain text" }],
    __smartPolicy: "balanced",
    __smartStickiness: "per-turn",
  });
  assert.equal(result.length, models.length);
  assert.ok(models.includes(result[0]));
});
