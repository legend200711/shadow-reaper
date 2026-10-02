/**
 * cloudflare/worker/routes/cloud-inference.js
 * Shadow Reaper Cloud API — Hosted Inference Endpoint
 *
 * Build: SR-CLOUD-INFERENCE-2
 *
 * POST /api/v1/inference
 *
 * Provides hosted Shadow Reaper inference via Cloudflare Workers AI.
 * This is NOT a new AI — it is the remote execution backend for ShadowReaper.
 *
 * INFERENCE BACKEND:
 *   Uses env.AI (Cloudflare Workers AI binding).
 *   Model: @cf/meta/llama-3-8b-instruct (or env.SR_INFERENCE_MODEL override).
 *   Fallback: @cf/mistral/mistral-7b-instruct-v0.1
 *
 *   If env.AI is not bound, returns INFERENCE_NOT_CONFIGURED (503) so the
 *   client (SRInferenceRuntime) gracefully falls back to emergency templates.
 *
 * REQUEST (POST /api/v1/inference):
 *   {
 *     requestId:          string           — client-generated unique ID
 *     conversationId:     string | null
 *     messages:           Array<{ role: "system"|"user"|"assistant", content: string }>
 *                         Already bounded by SRLocalModel._buildMessages() — max 20 messages
 *     generationOptions:  {
 *       max_tokens:   number   (1–512)
 *       temperature:  number   (0.0–2.0)
 *     }
 *   }
 *
 * RESPONSE (success):
 *   {
 *     success:     true,
 *     response:    string,     — generated text (trimmed)
 *     runtime:     "hosted",
 *     model:       string,     — model ID used
 *     requestId:   string,
 *     latencyMs:   number
 *   }
 *
 * RESPONSE (not configured — no AI binding):
 *   HTTP 503
 *   { success: false, notConfigured: true, requestId }
 *
 * RESPONSE (model error):
 *   HTTP 503
 *   { success: false, error: "INFERENCE_FAILED", requestId }
 *
 * PRIVACY:
 *   Only the prepared messages array is processed — never the full memory DB,
 *   unrelated conversations, or private user data.
 *   No conversation content is logged.
 *
 * SECURITY:
 *   Auth: Optional Firebase ID token (Bearer).
 *   Rate limiting: Applied at the router level.
 *   Payload size: Enforced at router level (64KB max).
 *   Input size: Each message content limited to 4096 chars at validation.
 *   Output size: max_tokens bounded to 512.
 */

'use strict';

// Default model — Cloudflare Workers AI hosted model
var DEFAULT_MODEL  = '@cf/meta/llama-3-8b-instruct';
var FALLBACK_MODEL = '@cf/mistral/mistral-7b-instruct-v0.1';

// Per-request timeout: Workers AI should respond within 25s
var INFERENCE_TIMEOUT_MS = 25000;

/**
 * Validate the incoming inference request body.
 * Returns { ok: true } or { ok: false, error: string }
 */
function _validateInferenceRequest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  if (typeof body.requestId !== 'string' || body.requestId.trim().length === 0) {
    return { ok: false, error: 'requestId is required and must be a non-empty string.' };
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, error: 'messages must be a non-empty array.' };
  }

  if (body.messages.length > 20) {
    return { ok: false, error: 'messages array too large (max 20).' };
  }

  for (var i = 0; i < body.messages.length; i++) {
    var msg = body.messages[i];
    if (!msg || typeof msg !== 'object') {
      return { ok: false, error: 'Each message must be an object.' };
    }
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      return { ok: false, error: 'Invalid message role: ' + msg.role };
    }
    if (typeof msg.content !== 'string') {
      return { ok: false, error: 'Message content must be a string.' };
    }
    if (msg.content.length > 4096) {
      return { ok: false, error: 'Message content[' + i + '] exceeds 4096 characters.' };
    }
  }

  if (body.generationOptions !== undefined) {
    var go = body.generationOptions;
    if (typeof go !== 'object') {
      return { ok: false, error: 'generationOptions must be an object.' };
    }
    if (go.max_tokens !== undefined &&
        (typeof go.max_tokens !== 'number' || go.max_tokens < 1 || go.max_tokens > 512)) {
      return { ok: false, error: 'generationOptions.max_tokens must be between 1 and 512.' };
    }
    if (go.temperature !== undefined &&
        (typeof go.temperature !== 'number' || go.temperature < 0 || go.temperature > 2)) {
      return { ok: false, error: 'generationOptions.temperature must be between 0 and 2.' };
    }
  }

  return { ok: true };
}

/**
 * Extract the text content from a Workers AI response object.
 * Workers AI returns: { response: "..." } for chat completions.
 * Some models use { result: { response: "..." } }.
 */
function _extractResponseText(aiResult) {
  if (!aiResult) return null;

  // Standard Workers AI shape
  if (typeof aiResult.response === 'string') {
    return aiResult.response.trim() || null;
  }

  // Wrapped shape
  if (aiResult.result && typeof aiResult.result.response === 'string') {
    return aiResult.result.response.trim() || null;
  }

  // Choices array (OpenAI-compatible shape some models return)
  if (Array.isArray(aiResult.choices) && aiResult.choices.length > 0) {
    var choice = aiResult.choices[0];
    if (choice && choice.message && typeof choice.message.content === 'string') {
      return choice.message.content.trim() || null;
    }
    if (choice && typeof choice.text === 'string') {
      return choice.text.trim() || null;
    }
  }

  return null;
}

/**
 * Run inference against Workers AI.
 *
 * @param {object} ai           - env.AI binding
 * @param {string} modelId      - model to use
 * @param {Array}  messages     - chat messages array
 * @param {object} genOpts      - { max_tokens, temperature }
 * @returns {Promise<{ text: string|null, model: string, error: string|null }>}
 */
async function _runInference(ai, modelId, messages, genOpts) {
  try {
    var params = {
      messages:    messages,
      max_tokens:  genOpts.max_tokens  || 256,
      temperature: genOpts.temperature !== undefined ? genOpts.temperature : 0.7,
    };

    var result = await ai.run(modelId, params);
    var text   = _extractResponseText(result);

    if (!text) {
      return { text: null, model: modelId, error: 'EMPTY_RESPONSE' };
    }

    return { text: text, model: modelId, error: null };

  } catch (err) {
    var errMsg = (err && err.message) ? err.message.substring(0, 100) : 'unknown';
    return { text: null, model: modelId, error: 'AI_RUN_FAILED: ' + errMsg };
  }
}

/**
 * handleInference(body, ctx)
 *
 * @param {object} body   — Parsed request body
 * @param {object} ctx    — Worker context { requestId, uid, env }
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleInference(body, ctx) {
  var startMs   = Date.now();
  var requestId = (ctx && ctx.requestId) || (body && body.requestId) || 'unknown';
  var env       = (ctx && ctx.env) || {};

  // ── Validate request ──────────────────────────────────────────────────────
  var validation = _validateInferenceRequest(body);
  if (!validation.ok) {
    return {
      status: 400,
      body: {
        success:   false,
        error:     'INVALID_REQUEST',
        message:   validation.error,
        requestId: requestId,
      },
    };
  }

  // ── Check Workers AI binding ───────────────────────────────────────────────
  if (!env.AI || typeof env.AI.run !== 'function') {
    // Workers AI not bound — client will fall through to emergency fallback.
    // This is normal during local development without wrangler bindings.
    console.log('[inference] Workers AI binding not configured. requestId:', requestId);
    return {
      status: 503,
      body: {
        success:        false,
        notConfigured:  true,
        message:        'Shadow inference backend not yet configured on this deployment. ' +
                        'Bind the AI Workers AI binding and redeploy to enable hosted inference.',
        requestId:      requestId,
      },
    };
  }

  // ── Select model ──────────────────────────────────────────────────────────
  // Allow override via env.SR_INFERENCE_MODEL for future model changes
  // without rewriting any client code.
  var modelId = (env.SR_INFERENCE_MODEL && typeof env.SR_INFERENCE_MODEL === 'string')
    ? env.SR_INFERENCE_MODEL.trim()
    : DEFAULT_MODEL;

  var messages  = body.messages;
  var genOpts   = body.generationOptions || {};

  // ── Enforce output size limit ──────────────────────────────────────────────
  if (!genOpts.max_tokens || genOpts.max_tokens > 512) {
    genOpts = Object.assign({}, genOpts, { max_tokens: 256 });
  }

  // ── Run inference (with fallback model on failure) ─────────────────────────
  var result = await _runInference(env.AI, modelId, messages, genOpts);

  if (!result.text && modelId !== FALLBACK_MODEL) {
    // Primary model failed — try fallback silently
    console.log('[inference] Primary model failed (' + result.error + '), trying fallback. requestId:', requestId);
    result = await _runInference(env.AI, FALLBACK_MODEL, messages, genOpts);
  }

  var latencyMs = Date.now() - startMs;

  if (!result.text) {
    // Both models failed — return 503 so client falls through to emergency templates
    console.log('[inference] All models failed. Error:', result.error, 'requestId:', requestId, 'latencyMs:', latencyMs);
    return {
      status: 503,
      body: {
        success:   false,
        error:     'INFERENCE_FAILED',
        message:   'Shadow inference models are temporarily unavailable.',
        requestId: requestId,
        latencyMs: latencyMs,
      },
    };
  }

  // ── Success ────────────────────────────────────────────────────────────────
  // Log only metadata — never conversation content
  console.log('[inference] OK. model:', result.model, 'tokens:', result.text.length, 'requestId:', requestId, 'latencyMs:', latencyMs);

  return {
    status: 200,
    body: {
      success:   true,
      response:  result.text,
      runtime:   'hosted',
      model:     result.model,
      requestId: requestId,
      latencyMs: latencyMs,
    },
  };
}
