/**
 * cloudflare/worker/lib/cloud-validator.js
 * Shadow Reaper Cloud API — Request Validation
 *
 * Build: SR-CLOUD-API-1
 *
 * Validates cloud API request bodies.
 * Rejects: missing required fields, wrong types, oversized input,
 *          dangerous keys (__proto__, constructor, prototype).
 */

'use strict';

const LIMITS = {
  MEMORY_CONTENT_MAX:   4096,
  MEMORY_CATEGORY_MAX:   128,
  CONV_TITLE_MAX:        256,
  TURNS_MAX:              500,
  TURN_TEXT_MAX:        2048,
  PROJECT_NAME_MAX:      256,
  PROJECT_DESC_MAX:     4096,
  SETTINGS_PAYLOAD_MAX: 8192,
  ADAPTIVE_PAYLOAD_MAX: 8192,
  ID_MAX:                128,
};

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function _checkObject(obj, depth) {
  if (depth > 6) return { ok: false, reason: 'Object nesting too deep.' };
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      if (DANGEROUS_KEYS.has(k)) return { ok: false, reason: 'Dangerous key: ' + k };
      const inner = _checkObject(obj[k], depth + 1);
      if (!inner.ok) return inner;
    }
  }
  if (Array.isArray(obj)) {
    if (obj.length > 1000) return { ok: false, reason: 'Array too large.' };
    for (const item of obj) {
      const r = _checkObject(item, depth + 1);
      if (!r.ok) return r;
    }
  }
  return { ok: true };
}

function _requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'Request body must be a JSON object.' };
  }
  return _checkObject(body, 0);
}

// ─── Memory ───────────────────────────────────────────────────────────────────

function validateMemoryCreate(body) {
  const g = _requireObject(body);
  if (!g.ok) return g;
  if (typeof body.content !== 'string' || !body.content.trim()) {
    return { ok: false, reason: '"content" must be a non-empty string.' };
  }
  if (body.content.length > LIMITS.MEMORY_CONTENT_MAX) {
    return { ok: false, reason: '"content" exceeds max length (' + LIMITS.MEMORY_CONTENT_MAX + ').' };
  }
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || body.category.length > LIMITS.MEMORY_CATEGORY_MAX) {
      return { ok: false, reason: '"category" must be a string ≤ ' + LIMITS.MEMORY_CATEGORY_MAX + ' chars.' };
    }
  }
  return { ok: true };
}

function validateMemoryPatch(body) {
  const g = _requireObject(body);
  if (!g.ok) return g;
  if (body.content !== undefined && (typeof body.content !== 'string' || body.content.length > LIMITS.MEMORY_CONTENT_MAX)) {
    return { ok: false, reason: '"content" must be a string ≤ ' + LIMITS.MEMORY_CONTENT_MAX + '.' };
  }
  if (body.category !== undefined && (typeof body.category !== 'string' || body.category.length > LIMITS.MEMORY_CATEGORY_MAX)) {
    return { ok: false, reason: '"category" must be a string ≤ ' + LIMITS.MEMORY_CATEGORY_MAX + '.' };
  }
  return { ok: true };
}

// ─── Conversations ────────────────────────────────────────────────────────────

function validateConversationCreate(body) {
  const g = _requireObject(body);
  if (!g.ok) return g;
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.length > LIMITS.CONV_TITLE_MAX) {
      return { ok: false, reason: '"title" must be a string ≤ ' + LIMITS.CONV_TITLE_MAX + '.' };
    }
  }
  if (body.turns !== undefined) {
    if (!Array.isArray(body.turns)) return { ok: false, reason: '"turns" must be an array.' };
    if (body.turns.length > LIMITS.TURNS_MAX) {
      return { ok: false, reason: '"turns" array exceeds max (' + LIMITS.TURNS_MAX + ').' };
    }
    for (const t of body.turns) {
      if (!t || typeof t !== 'object') return { ok: false, reason: 'Each turn must be an object.' };
      if (typeof t.role !== 'string') return { ok: false, reason: 'Turn "role" must be a string.' };
      if (typeof t.text !== 'string') return { ok: false, reason: 'Turn "text" must be a string.' };
      if (t.text.length > LIMITS.TURN_TEXT_MAX) {
        return { ok: false, reason: 'Turn "text" exceeds max length (' + LIMITS.TURN_TEXT_MAX + ').' };
      }
    }
  }
  return { ok: true };
}

function validateConversationPatch(body) {
  return validateConversationCreate(body);
}

// ─── Projects ─────────────────────────────────────────────────────────────────

function validateProjectCreate(body) {
  const g = _requireObject(body);
  if (!g.ok) return g;
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return { ok: false, reason: '"name" must be a non-empty string.' };
  }
  if (body.name.length > LIMITS.PROJECT_NAME_MAX) {
    return { ok: false, reason: '"name" exceeds max length (' + LIMITS.PROJECT_NAME_MAX + ').' };
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > LIMITS.PROJECT_DESC_MAX) {
      return { ok: false, reason: '"description" must be a string ≤ ' + LIMITS.PROJECT_DESC_MAX + '.' };
    }
  }
  return { ok: true };
}

function validateProjectPatch(body) {
  const g = _requireObject(body);
  if (!g.ok) return g;
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > LIMITS.PROJECT_NAME_MAX)) {
    return { ok: false, reason: '"name" must be a non-empty string ≤ ' + LIMITS.PROJECT_NAME_MAX + '.' };
  }
  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > LIMITS.PROJECT_DESC_MAX)) {
    return { ok: false, reason: '"description" must be a string ≤ ' + LIMITS.PROJECT_DESC_MAX + '.' };
  }
  return { ok: true };
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const ALLOWED_SETTINGS_KEYS = new Set([
  'assistantName', 'voicePreference', 'personalityPreference',
  'conversationPreference', 'memoryPreference', 'historyEnabled',
  'memoryEnabled', 'adaptiveEnabled', 'voiceEnabled', 'ttsEnabled',
  'theme', 'wakeName', 'wakeListening',
]);

const FORBIDDEN_SETTINGS_KEYS = new Set([
  'apiKey', 'token', 'password', 'secret', 'firebaseConfig', '_systemRule',
  'uid', 'serviceAccount',
]);

function validateSettingsPut(body) {
  const g = _requireObject(body);
  if (!g.ok) return g;
  const serialized = JSON.stringify(body);
  if (serialized.length > LIMITS.SETTINGS_PAYLOAD_MAX) {
    return { ok: false, reason: 'Settings payload exceeds max size.' };
  }
  for (const k of Object.keys(body)) {
    if (FORBIDDEN_SETTINGS_KEYS.has(k)) {
      return { ok: false, reason: 'Forbidden settings key: ' + k };
    }
  }
  return { ok: true };
}

// ─── Adaptive Profile ─────────────────────────────────────────────────────────

const ALLOWED_ADAPTIVE_KEYS = new Set([
  'preferredResponseLength', 'casualness', 'directness',
  'humorPreference', 'sarcasmTolerance', 'verbosity', 'formality',
]);

const FORBIDDEN_ADAPTIVE_KEYS = new Set([
  'apiKey', 'token', 'password', 'secret', 'uid', '_systemRule',
]);

function validateAdaptivePut(body) {
  const g = _requireObject(body);
  if (!g.ok) return g;
  const serialized = JSON.stringify(body);
  if (serialized.length > LIMITS.ADAPTIVE_PAYLOAD_MAX) {
    return { ok: false, reason: 'Adaptive profile payload exceeds max size.' };
  }
  for (const k of Object.keys(body)) {
    if (FORBIDDEN_ADAPTIVE_KEYS.has(k)) {
      return { ok: false, reason: 'Forbidden adaptive profile key: ' + k };
    }
  }
  return { ok: true };
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

function validateSyncRequest(body) {
  const g = _requireObject(body);
  if (!g.ok) return g;
  if (!body.type || typeof body.type !== 'string') {
    return { ok: false, reason: '"type" must be a non-empty string.' };
  }
  const validTypes = ['memory', 'conversations', 'projects', 'settings', 'adaptive-profile', 'full'];
  if (!validTypes.includes(body.type)) {
    return { ok: false, reason: '"type" must be one of: ' + validTypes.join(', ') };
  }
  return { ok: true };
}

// ─── ID validation ────────────────────────────────────────────────────────────

function validateId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id.length === 0 || id.length > LIMITS.ID_MAX) return false;
  // Allow Firestore auto-IDs (alphanumeric + hyphens only)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;
  return true;
}

export {
  LIMITS,
  validateMemoryCreate,
  validateMemoryPatch,
  validateConversationCreate,
  validateConversationPatch,
  validateProjectCreate,
  validateProjectPatch,
  validateSettingsPut,
  validateAdaptivePut,
  validateSyncRequest,
  validateId,
};
