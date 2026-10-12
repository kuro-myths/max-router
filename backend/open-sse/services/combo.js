/**
 * Shared combo (model combo) handling with fallback support
 */

import { checkFallbackError, formatRetryAfter } from "./accountFallback.js";
import { unavailableResponse } from "../utils/error.js";

/**
 * Combo strategy state. Settings are persisted in the Router settings store;
 * these maps only hold runtime counters/hints and are safe to reset.
 */
const comboRotationState = new Map();
const comboUsageState = new Map();
const comboLastGoodState = new Map();

function normalizeStickyLimit(stickyLimit) {
  const parsed = Number.parseInt(stickyLimit, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
function rotateModelsFromIndex(models, currentIndex) {
  const rotated = [...models];
  for (let i = 0; i < currentIndex; i++) rotated.push(rotated.shift());
  return rotated;
}
function shuffleModels(models) {
  const shuffled = [...models];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
function stableKey(comboName) { return comboName || "__default__"; }
function getRotatedModels(models, comboName, strategy, stickyLimit = 1, body = {}) {
  if (!Array.isArray(models) || models.length <= 1) return models || [];
  const key = stableKey(comboName);
  switch (strategy || "fallback") {
    case "round-robin": {
      const limit = normalizeStickyLimit(stickyLimit);
      const state = comboRotationState.get(key) || { index: 0, consecutiveUseCount: 0 };
      const index = state.index % models.length;
      const count = state.consecutiveUseCount + 1;
      comboRotationState.set(key, count >= limit
        ? { index: (index + 1) % models.length, consecutiveUseCount: 0 }
        : { index, consecutiveUseCount: count });
      return rotateModelsFromIndex(models, index);
    }
    case "random": return shuffleModels(models);
    case "shuffle": return shuffleModels(models);
    case "reverse-priority": return [...models].reverse();
    case "least-used": {
      const usage = comboUsageState.get(key) || {};
      const ordered = [...models].sort((a, b) => (usage[a] || 0) - (usage[b] || 0));
      const first = ordered[0];
      comboUsageState.set(key, { ...usage, [first]: (usage[first] || 0) + 1 });
      return ordered;
    }
    case "last-good": {
      const lastGood = comboLastGoodState.get(key);
      return lastGood && models.includes(lastGood)
        ? [lastGood, ...models.filter(model => model !== lastGood)]
        : [...models];
    }
    case "capacity": {
      const raw = JSON.stringify(body?.messages || body?.input || "").toLowerCase();
      const wanted = /audio|input_audio|speech|transcri/.test(raw) ? /audio|speech|whisper|transcri/
        : /image_url|image|pdf|file/.test(raw) ? /vision|image|multimodal|omni|4o|gemini/
        : null;
      if (!wanted) return [...models];
      const capable = models.filter(model => wanted.test(model));
      return capable.length ? [...capable, ...models.filter(model => !capable.includes(model))] : [...models];
    }
    // "fallback" and "priority" both honor the configured order.
    case "fallback":
    case "priority":
    default: return [...models];
  }
}
/**
 * Reset in-memory rotation state when combo/settings change
 * @param {string} [comboName] - Combo name to reset; omit to clear all
 */
export function resetComboRotation(comboName) {
  if (comboName) { comboRotationState.delete(comboName); comboUsageState.delete(comboName); comboLastGoodState.delete(comboName); }
  else { comboRotationState.clear(); comboUsageState.clear(); comboLastGoodState.clear(); }
}

/**
 * Get combo models from combos data
 * @param {string} modelStr - Model string to check
 * @param {Array|Object} combosData - Array of combos or object with combos
 * @returns {string[]|null} Array of models or null if not a combo
 */
export function getComboModelsFromData(modelStr, combosData) {
  // Don't check if it's in provider/model format
  if (modelStr.includes("/")) return null;
  
  // Handle both array and object formats
  const combos = Array.isArray(combosData) ? combosData : (combosData?.combos || []);
  
  const combo = combos.find(c => c.name === modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}

/**
 * Handle combo chat with fallback
 * @param {Object} options
 * @param {Object} options.body - Request body
 * @param {string[]} options.models - Array of model strings to try
 * @param {Function} options.handleSingleModel - Function to handle single model: (body, modelStr) => Promise<Response>
 * @param {Object} options.log - Logger object
 * @param {string} [options.comboName] - Name of the combo (for round-robin tracking)
 * @param {string} [options.comboStrategy] - Routing strategy configured for this combo
 * @param {number|string} [options.comboStickyLimit=1] - Requests per combo model before switching
 * @returns {Promise<Response>}
 */
export async function handleComboChat({ body, models, handleSingleModel, log, comboName, comboStrategy, comboStickyLimit = 1 }) {
  // Apply rotation strategy if enabled
  const rotatedModels = getRotatedModels(models, comboName, comboStrategy, comboStickyLimit, body);

  // Fusion returns the successful outputs from all models in parallel. It deliberately
  // does not claim to synthesize a single judge answer because no judge model is configured.
  if (comboStrategy === "fusion") {
    const settled = await Promise.allSettled(models.map(model => handleSingleModel(body, model)));
    const outputs = [];
    let lastFailure = null;
    for (let i = 0; i < settled.length; i++) {
      const item = settled[i];
      if (item.status !== "fulfilled") { lastFailure = item.reason; continue; }
      const response = item.value;
      if (!response?.ok) { lastFailure = new Error("Model " + models[i] + " returned HTTP " + response?.status); continue; }
      try {
        const payload = await response.clone().json();
        const content = payload?.choices?.[0]?.message?.content;
        if (content) outputs.push({ model: models[i], content: Array.isArray(content) ? content.map(part => part.text || "").join("\\n") : String(content) });
      } catch (error) { lastFailure = error; }
    }
    if (!outputs.length) return new Response(JSON.stringify({ error: { message: lastFailure?.message || "Semua model dalam Fusion gagal." } }), { status: 503, headers: { "Content-Type": "application/json" } });
    const content = outputs.map((item, i) => "### Hasil " + (i + 1) + " — " + item.model + "\\n" + item.content).join("\\n\\n");
    return new Response(JSON.stringify({ id: "combo-fusion-" + Date.now(), object: "chat.completion", model: comboName || "fusion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, combo: { strategy: "fusion", successful_models: outputs.map(item => item.model) } }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  
  let lastError = null;
  let earliestRetryAfter = null;
  let lastStatus = null;

  for (let i = 0; i < rotatedModels.length; i++) {
    const modelStr = rotatedModels[i];
    log.info("COMBO", `Trying model ${i + 1}/${rotatedModels.length}: ${modelStr}`);

    try {
      const result = await handleSingleModel(body, modelStr);
      
      // Success (2xx) - return response
      if (result.ok) {
        comboLastGoodState.set(stableKey(comboName), modelStr);
        log.info("COMBO", `Model ${modelStr} succeeded`);
        return result;
      }

      // Extract error info from response
      let errorText = result.statusText || "";
      let retryAfter = null;
      try {
        const errorBody = await result.clone().json();
        errorText = errorBody?.error?.message || errorBody?.error || errorBody?.message || errorText;
        retryAfter = errorBody?.retryAfter || null;
      } catch {
        // Ignore JSON parse errors
      }

      // Track earliest retryAfter across all combo models
      if (retryAfter && (!earliestRetryAfter || new Date(retryAfter) < new Date(earliestRetryAfter))) {
        earliestRetryAfter = retryAfter;
      }

      // Normalize error text to string (Worker-safe)
      if (typeof errorText !== "string") {
        try { errorText = JSON.stringify(errorText); } catch { errorText = String(errorText); }
      }

      // Check if should fallback to next model
      const { shouldFallback, cooldownMs } = checkFallbackError(result.status, errorText);

      if (!shouldFallback) {
        log.warn("COMBO", `Model ${modelStr} failed (no fallback)`, { status: result.status });
        return result;
      }

      // For transient errors (503/502/504), wait for cooldown before falling through
      // so a briefly-overloaded provider gets a chance to recover rather than being
      // skipped immediately (fixes: combo falls through on transient 503)
      if (cooldownMs && cooldownMs > 0 && cooldownMs <= 5000 &&
          (result.status === 503 || result.status === 502 || result.status === 504)) {
        log.info("COMBO", `Model ${modelStr} transient ${result.status}, waiting ${cooldownMs}ms before next`);
        await new Promise(r => setTimeout(r, cooldownMs));
      }

      // Fallback to next model
      lastError = errorText || String(result.status);
      if (!lastStatus) lastStatus = result.status;
      log.warn("COMBO", `Model ${modelStr} failed, trying next`, { status: result.status });
    } catch (error) {
      // Catch unexpected exceptions to ensure fallback continues
      lastError = error.message || String(error);
      if (!lastStatus) lastStatus = 500;
      log.warn("COMBO", `Model ${modelStr} threw error, trying next`, { error: lastError });
    }
  }

  // All models failed
  // Use 503 (Service Unavailable) rather than 406 (Not Acceptable) — 406 implies
  // the request itself is invalid, but here the providers are simply unavailable
  // or have no active credentials. 503 is more accurate and retryable by clients.
  const allDisabled = lastError && lastError.toLowerCase().includes("no credentials");
  const status = allDisabled ? 503 : (lastStatus || 503);
  const msg = lastError || "All combo models unavailable";

  if (earliestRetryAfter) {
    const retryHuman = formatRetryAfter(earliestRetryAfter);
    log.warn("COMBO", `All models failed | ${msg} (${retryHuman})`);
    return unavailableResponse(status, msg, earliestRetryAfter, retryHuman);
  }

  log.warn("COMBO", `All models failed | ${msg}`);
  return new Response(
    JSON.stringify({ error: { message: msg } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
