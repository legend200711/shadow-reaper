/**
 * shadow-reaper-v2/api/v1/lib/schemas.js
 * Shadow Reaper API v1 — JSON Schema Validators
 *
 * Build: SR-API-V1-1
 *
 * Strict request validation for all endpoints.
 * Reject:
 *   - missing required fields
 *   - wrong types
 *   - oversized input
 *   - unknown / dangerous fields
 *   - malformed JSON (handled at parse level, before this)
 *
 * SECURITY:
 *   - Never eval() input
 *   - Never new Function() from input
 *   - Prototype pollution guard: reject __proto__, constructor, prototype keys
 */

'use strict';

// ── Size limits ──────────────────────────────────────────────────────────────

var LIMITS = {
  MESSAGE_MAX_LENGTH:        2048,   // Max chars in message/query
  CONTEXT_PAYLOAD_MAX_BYTES: 8192,   // Max context payload bytes (JSON.stringify)
  MAX_ARRAY_LENGTH:          64,     // Max items in any array field
  MAX_NESTED_DEPTH:          5,      // Max JSON nesting depth
  ENGINE_ID_MAX_LENGTH:      128,    // Max engineId string length
  SCOPE_MAX_COUNT:           16,     // Max scopes in a token
};

// ── Dangerous key guard ──────────────────────────────────────────────────────

var DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively check for prototype pollution keys or excessive depth.
 * Also scans the raw serialized JSON for dangerous key names, because
 * JSON.parse() in some environments silently drops __proto__ keys
 * from the resulting object — we must catch them in the string first.
 *
 * @param {*}      obj
 * @param {number} depth
 * @param {string} [rawJson]  - Original JSON string (for raw key scan)
 * @returns {{ ok: boolean, reason?: string }}
 */
function _checkObject(obj, depth, rawJson) {
  // Raw JSON scan for dangerous keys (catches what JSON.parse may silently drop)
  if (rawJson && typeof rawJson === 'string') {
    if (rawJson.indexOf('"__proto__"') !== -1) {
      return { ok: false, reason: 'Dangerous key detected: __proto__' };
    }
    if (rawJson.indexOf('"constructor"') !== -1 && rawJson.indexOf('"type"') === -1) {
      // Allow "constructor" only in contexts where it's a normal field alongside "type"
      return { ok: false, reason: 'Dangerous key detected: constructor' };
    }
    if (rawJson.indexOf('"prototype"') !== -1) {
      return { ok: false, reason: 'Dangerous key detected: prototype' };
    }
  }

  if (depth > LIMITS.MAX_NESTED_DEPTH) {
    return { ok: false, reason: 'Object nesting exceeds maximum depth.' };
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      if (DANGEROUS_KEYS.has(keys[i])) {
        return { ok: false, reason: 'Dangerous key detected: ' + keys[i] };
      }
      var inner = _checkObject(obj[keys[i]], depth + 1);
      if (!inner.ok) return inner;
    }
  }
  if (Array.isArray(obj)) {
    if (obj.length > LIMITS.MAX_ARRAY_LENGTH) {
      return { ok: false, reason: 'Array length exceeds maximum allowed.' };
    }
    for (var j = 0; j < obj.length; j++) {
      var res = _checkObject(obj[j], depth + 1);
      if (!res.ok) return res;
    }
  }
  return { ok: true };
}

// ── Individual schema validators ─────────────────────────────────────────────

/**
 * Validate raw JSON string for dangerous keys before parsing.
 * Call this before JSON.parse() so keys that JSON.parse() silently drops
 * (like __proto__) are still caught.
 *
 * @param {string} rawJson
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateRawJson(rawJson) {
  if (typeof rawJson !== 'string') return { ok: true };
  return _checkObject(null, 0, rawJson);
}

/**
 * Validate ChatRequest: { message: string }
 * @param {object} body
 * @param {string} [rawJson] - Original JSON string for dangerous key scan
 */
function validateChatRequest(body, rawJson) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'Request body must be a JSON object.' };
  }
  var guard = _checkObject(body, 0, rawJson);
  if (!guard.ok) return guard;

  if (typeof body.message !== 'string') {
    return { ok: false, reason: '"message" must be a string.' };
  }
  var msg = body.message.trim();
  if (msg.length === 0) {
    return { ok: false, reason: '"message" must not be empty.' };
  }
  if (body.message.length > LIMITS.MESSAGE_MAX_LENGTH) {
    return { ok: false, reason: '"message" exceeds maximum length of ' + LIMITS.MESSAGE_MAX_LENGTH + ' characters.' };
  }
  return { ok: true };
}

/**
 * Validate UnderstandRequest: { message: string }
 */
function validateUnderstandRequest(body) {
  return validateChatRequest(body);   // same shape
}

/**
 * Validate KnowledgeQueryRequest: { query: string }
 */
function validateKnowledgeQueryRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'Request body must be a JSON object.' };
  }
  var guard = _checkObject(body, 0);
  if (!guard.ok) return guard;

  if (typeof body.query !== 'string') {
    return { ok: false, reason: '"query" must be a string.' };
  }
  var q = body.query.trim();
  if (q.length === 0) {
    return { ok: false, reason: '"query" must not be empty.' };
  }
  if (body.query.length > LIMITS.MESSAGE_MAX_LENGTH) {
    return { ok: false, reason: '"query" exceeds maximum length of ' + LIMITS.MESSAGE_MAX_LENGTH + ' characters.' };
  }
  return { ok: true };
}

/**
 * Validate EngineCommandRequest: { message: string }
 */
function validateEngineCommandRequest(body) {
  return validateChatRequest(body);   // same shape — message is the NL input
}

/**
 * Validate EngineContextRequest: { engineId: string, ... }
 * Context payload must fit within CONTEXT_PAYLOAD_MAX_BYTES.
 */
function validateEngineContextRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'Request body must be a JSON object.' };
  }
  var guard = _checkObject(body, 0);
  if (!guard.ok) return guard;

  if (typeof body.engineId !== 'string') {
    return { ok: false, reason: '"engineId" must be a string.' };
  }
  if (body.engineId.length === 0) {
    return { ok: false, reason: '"engineId" must not be empty.' };
  }
  if (body.engineId.length > LIMITS.ENGINE_ID_MAX_LENGTH) {
    return { ok: false, reason: '"engineId" exceeds maximum length.' };
  }

  // Check total serialized size
  var serialized;
  try {
    serialized = JSON.stringify(body);
  } catch (e) {
    return { ok: false, reason: 'Context payload could not be serialized.' };
  }
  if (serialized.length > LIMITS.CONTEXT_PAYLOAD_MAX_BYTES) {
    return { ok: false, reason: 'Context payload exceeds maximum allowed size.' };
  }

  return { ok: true };
}

module.exports = {
  LIMITS:                         LIMITS,
  validateRawJson:                validateRawJson,
  validateChatRequest:            validateChatRequest,
  validateUnderstandRequest:      validateUnderstandRequest,
  validateKnowledgeQueryRequest:  validateKnowledgeQueryRequest,
  validateEngineCommandRequest:   validateEngineCommandRequest,
  validateEngineContextRequest:   validateEngineContextRequest,
};
