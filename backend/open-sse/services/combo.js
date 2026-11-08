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
const comboSessionState = new Map();

function requestSignals(body = {}) {
  const messages = JSON.stringify(body?.messages || body?.input || body?.contents || []).toLowerCase();
  const tools = Array.isArray(body?.tools) && body.tools.length > 0;
  const hasImage = /image_url|"image"|inline_data|input_image/.test(messages);
  const hasAudio = /input_audio|audio_url|speech|transcri|"audio"/.test(messages);
  const hasVideo = /video_url|video_frame|"video"/.test(messages);
  const hasPdf = /application.{0,4}pdf|\.pdf|"file"/.test(messages);
  const effort = String(body?.reasoning_effort || body?.reasoning?.effort || body?.thinking?.level || "").toLowerCase();
  return { hasImage, hasAudio, hasVideo, hasPdf, tools, estimatedTokens: Math.ceil(messages.length / 4),
    reasoning: ["high", "xhigh", "max", "medium"].includes(effort) };
}
function modelHints(model) {
  const id = String(model || "").toLowerCase();
  return {
    vision: /vision|omni|4o|gemini|claude|grok|llava|qwen.*vl|pixtral|internvl/.test(id),
    audio: /audio|speech|whisper|transcri|tts|gemini|omni|4o/.test(id),
    video: /video|veo|sora|kling|seedance|gemini/.test(id),
    pdf: /claude|gemini|gpt-4|gpt-5|gpt-6|qwen|mistral/.test(id),
    tools: !/embed|whisper|tts|image|video/.test(id),
    context: /1m|1000k/.test(id) ? 1000000 : /200k/.test(id) ? 200000 : /128k/.test(id) ? 128000 : /32k/.test(id) ? 32000 : 0,
    fast: /flash|mini|haiku|fast|turbo|instant/.test(id),
    quality: /opus|pro|reason|thinking|sonnet/.test(id),
    cheap: /free|flash|mini|nano|lite/.test(id),
  };
}
function scoreSmartModel(model, signals, policy) {
  const hints = modelHints(model);
  let score = 0;
  if (signals.hasImage) score += hints.vision ? 14 : -12;
  if (signals.hasAudio) score += hints.audio ? 14 : -12;
  if (signals.hasVideo) score += hints.video ? 14 : -12;
  if (signals.hasPdf) score += hints.pdf ? 10 : -8;
  if (signals.tools) score += hints.tools ? 5 : -10;
  if (signals.estimatedTokens > 32000 && hints.context) score += hints.context >= signals.estimatedTokens ? 12 : -14;
  if (signals.reasoning) score += hints.quality ? 8 : -2;
  if (policy === "quality") score += hints.quality ? 12 : 0;
  if (policy === "fast") score += hints.fast ? 12 : 0;
  if (policy === "economy") score += hints.cheap ? 12 : 0;
  return score;
}
function sessionStateKey(comboName, body, sessionKey) {
  const id = sessionKey || body?.metadata?.session_id || body?.session_id || body?.conversation_id || body?.prompt_cache_key;
  return id ? String(comboName || "combo") + ":" + String(id).slice(0, 256) : null;
}
function applySmartRouting(models, comboName, body, policy = "balanced", stickiness = "adaptive", sessionKey = null) {
  const signals = requestSignals(body);
  const ranked = [...models].sort((a, b) => scoreSmartModel(b, signals, policy) - scoreSmartModel(a, signals, policy));
  const key = sessionStateKey(comboName, body, sessionKey);
  if (!key || stickiness === "per-turn") return ranked;
  const previous = comboSessionState.get(key);
  if (!previous || !ranked.includes(previous)) return ranked;
  const previousScore = scoreSmartModel(previous, signals, policy);
  const bestScore = scoreSmartModel(ranked[0], signals, policy);
  return stickiness === "strict" || previousScore >= bestScore - 5
    ? [previous, ...ranked.filter(model => model !== previous)] : ranked;
}

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
export function getRotatedModels(models, comboName, strategy, stickyLimit = 1, body = {}) {
  if (!Array.isArray(models) || models.length <= 1) return models || [];
  const key = stableKey(comboName);
  if (strategy === "smart") return applySmartRouting(models, comboName, body, body?.__smartPolicy || "balanced", body?.__smartStickiness || "adaptive", body?.__sessionKey || null);
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
  if (comboName) {
    comboRotationState.delete(comboName); comboUsageState.delete(comboName); comboLastGoodState.delete(comboName);
    for (const key of comboSessionState.keys()) if (key.startsWith(comboName + ":")) comboSessionState.delete(key);
  } else {
    comboRotationState.clear(); comboUsageState.clear(); comboLastGoodState.clear(); comboSessionState.clear();
  }
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

function fusionMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(part => {
    if (typeof part === "string") return part;
    if (part?.type === "text" && typeof part.text === "string") return part.text;
    if (part?.type === "tool_result") return "[Tool result: " + fusionMessageText(part.content) + "]";
    if (part?.type === "tool_use") return "[Called tool: " + (part.name || "tool") + "]";
    return "";
  }).filter(Boolean).join("\n");
}

function flattenFusionToolHistory(messages) {
  return messages.filter(Boolean).map(message => {
    if (message.role === "tool" || message.role === "function") {
      return { role: "assistant", content: "[Tool result: " + fusionMessageText(message.content) + "]" };
    }
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      const { tool_calls, ...rest } = message;
      const names = tool_calls.map(call => call?.function?.name || call?.name || "tool").join(", ");
      const base = fusionMessageText(rest.content);
      return { ...rest, content: [base, "[Called tools: " + names + "]"].filter(Boolean).join("\n") };
    }
    if (Array.isArray(message.content)) {
      const hasToolBlocks = message.content.some(part => part?.type === "tool_use" || part?.type === "tool_result");
      if (hasToolBlocks) return { ...message, content: fusionMessageText(message.content) };
    }
    return message;
  });
}

// Stop waiting for stragglers once two panel answers are ready, but give the
// remaining models a short grace window. The hard cap prevents a hung provider
// from holding the whole request open indefinitely.
function collectFusionPanel(calls, minPanel = 2, graceMs = 5000, hardTimeoutMs = 45000) {
  return new Promise(resolve => {
    const results = new Array(calls.length);
    let settled = 0;
    let successful = 0;
    let finished = false;
    let graceTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(hardTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve(results);
    };
    const hardTimer = setTimeout(finish, hardTimeoutMs);
    calls.forEach((call, index) => {
      Promise.resolve(call)
        .then(value => { results[index] = { status: "fulfilled", value }; })
        .catch(reason => { results[index] = { status: "rejected", reason }; })
        .finally(() => {
          settled++;
          if (results[index]?.value?.ok) successful++;
          if (settled === calls.length) return finish();
          if (successful >= minPanel && !graceTimer) graceTimer = setTimeout(finish, graceMs);
        });
    });
  });
}

function buildFusionJudgeBody(body, judgeModel, panelText) {
  const instruction = "You are the Judge in a model-fusion panel. Synthesize independent responses into one accurate, complete answer. Resolve contradictions, prioritize verifiable reasoning, preserve unique useful insights, and identify uncertainty. Do not mention models, sources, or panel labels. Answer in the user's language.";
  const panelPrompt = "Independent responses (anonymized):\n" + panelText + "\n\nProduce one authoritative final answer using the conversation context above.";
  const judgeBody = { ...body, model: judgeModel, stream: body?.stream === true };

  if (Array.isArray(body?.messages)) {
    judgeBody.messages = [
      { role: "system", content: instruction },
      ...flattenFusionToolHistory(body.messages),
      { role: "user", content: panelPrompt },
    ];
    delete judgeBody.input;
    delete judgeBody.contents;
  } else if (Array.isArray(body?.input)) {
    judgeBody.input = [...body.input, { role: "user", content: [{ type: "input_text", text: panelPrompt }] }];
    judgeBody.instructions = [body.instructions, instruction].filter(Boolean).join("\n\n");
    delete judgeBody.messages;
    delete judgeBody.contents;
  } else if (typeof body?.input === "string") {
    judgeBody.input = body.input + "\n\n" + panelPrompt;
    judgeBody.instructions = [body.instructions, instruction].filter(Boolean).join("\n\n");
    delete judgeBody.messages;
    delete judgeBody.contents;
  } else if (Array.isArray(body?.contents)) {
    const currentSystem = body.systemInstruction;
    const existingParts = Array.isArray(currentSystem?.parts) ? currentSystem.parts : [];
    const existingText = typeof currentSystem === "string" ? [{ text: currentSystem }] : [];
    judgeBody.systemInstruction = {
      ...(currentSystem && typeof currentSystem === "object" ? currentSystem : {}),
      parts: [...existingParts, ...existingText, { text: instruction }],
    };
    judgeBody.contents = [...body.contents, { role: "user", parts: [{ text: panelPrompt }] }];
    delete judgeBody.messages;
    delete judgeBody.input;
  } else {
    judgeBody.messages = [
      { role: "system", content: instruction },
      { role: "user", content: panelPrompt },
    ];
  }
  return judgeBody;
}

function fusionCompletionResponse({ content, comboName, metadata, stream = false }) {
  const id = "chatcmpl-fusion-" + Date.now();
  const model = comboName || "fusion";
  const payload = {
    id, object: "chat.completion", model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    combo: metadata,
  };
  if (!stream) return new Response(JSON.stringify(payload), {
    status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  const encoder = new TextEncoder();
  const created = Math.floor(Date.now() / 1000);
  const chunks = [
    { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] },
    { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ];
  const streamBody = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode("data: " + JSON.stringify(chunk) + "\\n\\n"));
      controller.enqueue(encoder.encode("data: [DONE]\\n\\n"));
      controller.close();
    },
  });
  return new Response(streamBody, { status: 200, headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  } });
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
export async function handleComboChat({ body, models, handleSingleModel, log, comboName, comboStrategy, comboStickyLimit = 1, judgeModel = null, fusionMinPanel = 2, fusionGraceMs = 5000, fusionTimeoutMs = 45000, smartPolicy = "balanced", smartStickiness = "adaptive", sessionKey = null }) {
  // Apply rotation strategy if enabled
  const routingBody = comboStrategy === "smart" ? { ...body, __smartPolicy: smartPolicy, __smartStickiness: smartStickiness, __sessionKey: sessionKey } : body;
  const rotatedModels = getRotatedModels(models, comboName, comboStrategy, comboStickyLimit, routingBody);

  // Fusion: fan out to panel models, then synthesize with the configured Judge.
  if (comboStrategy === "fusion") {
    const panelBody = { ...body, stream: false };
    delete panelBody.tools;
    delete panelBody.tool_choice;
    if (Array.isArray(panelBody.messages)) panelBody.messages = flattenFusionToolHistory(panelBody.messages);

    const settled = await collectFusionPanel(
      models.map(model => handleSingleModel(panelBody, model)),
      Math.max(1, Math.min(Number(fusionMinPanel) || 2, models.length)),
      Math.max(0, Math.min(Number(fusionGraceMs) || 5000, 15000)),
      Math.max(5000, Math.min(Number(fusionTimeoutMs) || 45000, 90000)),
    );
    const outputs = [];
    let lastFailure = null;
    for (let i = 0; i < settled.length; i++) {
      const item = settled[i];
      if (!item) continue; // panel exceeded the quorum grace/hard timeout
      if (item.status !== "fulfilled") { lastFailure = item.reason; continue; }
      const response = item.value;
      if (!response?.ok) { lastFailure = new Error("Model " + models[i] + " returned HTTP " + response?.status); continue; }
      try {
        const payload = await response.clone().json();
        const raw = payload?.choices?.[0]?.message?.content ?? payload?.output_text;
        const content = Array.isArray(raw) ? raw.map(part => part.text || "").join("\\n") : (raw == null ? "" : String(raw));
        if (content.trim()) outputs.push({ model: models[i], content });
      } catch (error) { lastFailure = error; }
    }
    if (!outputs.length) return new Response(JSON.stringify({ error: { message: lastFailure?.message || "Semua model dalam Fusion gagal." } }), {
      status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

    const panelMeta = { strategy: "fusion", successful_models: outputs.map(item => item.model), failed_count: models.length - outputs.length };
    const panelText = outputs.map((item, i) => "[Source " + (i + 1) + "]\\n" + item.content).join("\\n\\n");
    if (outputs.length === 1 || !judgeModel || !models.includes(judgeModel)) {
      const content = outputs.length === 1 ? outputs[0].content : "Hasil panel Fusion:\\n\\n" + panelText;
      return fusionCompletionResponse({ content, comboName, metadata: panelMeta, stream: body?.stream === true });
    }

    const judgeBody = buildFusionJudgeBody(body, judgeModel, panelText);
    try {
      const judged = await handleSingleModel(judgeBody, judgeModel);
      if (judged?.ok) {
        if (body?.stream === true) return judged;
        const payload = await judged.clone().json();
        const raw = payload?.choices?.[0]?.message?.content ?? payload?.output_text;
        const content = Array.isArray(raw) ? raw.map(part => part.text || "").join("\\n") : (raw == null ? "" : String(raw));
        if (content.trim()) return fusionCompletionResponse({
          content, comboName, metadata: { ...panelMeta, judge_model: judgeModel }, stream: false,
        });
      }
      log.warn("COMBO", "Fusion judge failed; returning panel responses", { judgeModel, status: judged?.status });
      panelMeta.judge_error = "Judge tidak tersedia; hasil panel dikembalikan.";
    } catch (error) {
      log.warn("COMBO", "Fusion judge threw error; returning panel responses", { judgeModel, error: error?.message });
      panelMeta.judge_error = "Judge tidak tersedia; hasil panel dikembalikan.";
    }

    return fusionCompletionResponse({
      content: "Hasil panel Fusion (Judge tidak tersedia):\\n\\n" + panelText,
      comboName, metadata: panelMeta, stream: body?.stream === true,
    });
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
        if (comboStrategy === "smart" && smartStickiness !== "per-turn") {
          const key = sessionStateKey(comboName, body, sessionKey);
          if (key) {
            comboSessionState.set(key, modelStr);
            if (comboSessionState.size > 5000) comboSessionState.delete(comboSessionState.keys().next().value);
          }
        }
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
