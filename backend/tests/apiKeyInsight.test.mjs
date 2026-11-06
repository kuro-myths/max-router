import test from "node:test";
import assert from "node:assert/strict";
import { classifyKeyInsight, extractModels, parseRateLimitHeaders } from "../src/lib/apiKeyInsightParse.js";

test("reads OpenAI and Anthropic rate-limit headers", () => {
  const headers = new Headers({
    "x-ratelimit-limit-requests": "500",
    "x-ratelimit-remaining-requests": "0",
    "x-ratelimit-reset-requests": "6m0s",
    "anthropic-ratelimit-tokens-limit": "10000",
    "anthropic-ratelimit-tokens-remaining": "2500",
    "retry-after": "30",
  });
  const rate = parseRateLimitHeaders(headers);
  assert.equal(rate.requests.limit, 500);
  assert.equal(rate.requests.remaining, 0);
  assert.equal(rate.requests.reset, "6m0s");
  assert.equal(rate.tokens.remaining, 2500);
  assert.equal(rate.retryAfterSec, 30);
  assert.equal(rate.present, true);
});

test("extracts OpenAI, Gemini, and Ollama model catalogs", () => {
  const openai = extractModels({ data: [{ id: "gpt-4o", owned_by: "openai" }, { id: "gpt-4o" }] });
  assert.equal(openai.length, 1);
  assert.equal(openai[0].owner, "openai");

  const gemini = extractModels({ models: [{ name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" }] });
  assert.equal(gemini[0].id, "gemini-2.5-flash");
  assert.equal(gemini[0].name, "Gemini 2.5 Flash");

  const ollama = extractModels({ models: [{ name: "llama3:latest" }] });
  assert.equal(ollama[0].id, "llama3:latest");
});

test("classifies invalid, limited, and healthy keys", () => {
  assert.deepEqual(classifyKeyInsight({ httpStatus: 401, provider: "openai", rateLimit: null, errorText: "", quota: null }), {
    status: "invalid", valid: false, limited: false,
  });
  assert.equal(classifyKeyInsight({
    httpStatus: 200,
    provider: "groq",
    rateLimit: { requests: { remaining: 0, limit: 30, reset: "1s" } },
    errorText: "",
    quota: null,
  }).status, "limited");
  assert.equal(classifyKeyInsight({
    httpStatus: 429,
    provider: "openai",
    rateLimit: null,
    errorText: "Rate limit reached",
    quota: null,
  }).limited, true);
  assert.equal(classifyKeyInsight({ httpStatus: 200, provider: "openai", rateLimit: { present: false }, errorText: "", quota: null }).status, "ok");
  assert.equal(classifyKeyInsight({ httpStatus: 403, provider: "xai", rateLimit: null, errorText: "", quota: null }).status, "limited");
});
