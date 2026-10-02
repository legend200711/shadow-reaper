/**
 * shadow-reaper-v2/api/v1/lib/auth.js
 * Shadow Reaper API v1 — Authentication & Authorization Foundation
 *
 * Build: SR-API-V1-1
 *
 * PRINCIPLES:
 *   - Authentication: WHO is calling?
 *   - Authorization:  WHAT may it do?
 *   - These are separate concerns.
 *
 * DESIGN:
 *   - Machine-to-machine tokens (not Founder email)
 *   - Scoped service identities
 *   - Short-lived / rotatable credentials
 *   - No permanent master keys exposed to frontend
 *   - Credentials verified server-side (Cloudflare Worker env secrets)
 *
 * SCOPES (v1):
 *   shadow.chat                  — POST /api/v1/chat
 *   shadow.understand            — POST /api/v1/understand
 *   shadow.knowledge.read        — POST /api/v1/knowledge/query
 *   engine.command.interpret     — POST /api/v1/engine/command
 *   engine.context.write         — POST /api/v1/engine/context
 *
 * TOKEN FORMAT (v1 — simple bearer):
 *   Authorization: Bearer <token>
 *   Where <token> is a pre-shared service token issued per integration.
 *
 * FUTURE:
 *   Replace with JWT + short-lived credentials + revocation list.
 *   For now: environment-variable backed pre-shared tokens with scope maps.
 *
 * SECURITY NOTE:
 *   The Founder account email is NEVER used as API authorization.
 *   Tokens are NEVER hardcoded in source — they come from env secrets.
 *   Do NOT expose tokens in error responses.
 */

'use strict';

// ── Scope definitions ────────────────────────────────────────────────────────

var SCOPES = {
  CHAT:                'shadow.chat',
  UNDERSTAND:          'shadow.understand',
  KNOWLEDGE_READ:      'shadow.knowledge.read',
  ENGINE_COMMAND:      'engine.command.interpret',
  ENGINE_CONTEXT:      'engine.context.write',
  RESEARCH:            'shadow.research',
  WEATHER:             'shadow.weather',
};

// ── Endpoint → required scope mapping ───────────────────────────────────────

var ENDPOINT_SCOPES = {
  'POST /api/v1/chat':              SCOPES.CHAT,
  'POST /api/v1/understand':        SCOPES.UNDERSTAND,
  'POST /api/v1/knowledge/query':   SCOPES.KNOWLEDGE_READ,
  'POST /api/v1/engine/command':    SCOPES.ENGINE_COMMAND,
  'POST /api/v1/engine/context':    SCOPES.ENGINE_CONTEXT,
  'POST /api/v1/research':          SCOPES.RESEARCH,
  'POST /api/v1/weather':           SCOPES.WEATHER,
  // Health and capabilities are public (no scope required)
  'GET /api/v1/health':             null,
  'GET /api/v1/capabilities':       null,
};

/**
 * Extract a bearer token from an Authorization header value.
 * Returns null if not present or malformed.
 *
 * @param {string|null} headerValue
 * @returns {string|null}
 */
function extractBearer(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return null;
  var parts = headerValue.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  var token = parts[1];
  // Sanity: tokens must be non-empty, reasonable length, no whitespace
  if (!token || token.length < 8 || token.length > 512) return null;
  return token;
}

/**
 * Verify a bearer token against the environment-provided token registry.
 *
 * In production (Cloudflare Worker), tokens come from env secrets.
 * In Node.js test context, tokens come from process.env or a mock registry.
 *
 * @param {string}      token      - The extracted bearer token
 * @param {object}      env        - Environment/secrets object { SR_SERVICE_TOKENS? }
 * @param {string}      scopeRequired - The scope that must be granted
 * @returns {{ ok: boolean, serviceId?: string, scopes?: string[], reason?: string }}
 */
function verifyToken(token, env, scopeRequired) {
  if (!token) {
    return { ok: false, reason: 'No token provided.' };
  }

  // The env must supply SR_SERVICE_TOKENS as a JSON string:
  // {
  //   "token_value_1": { "serviceId": "24hour-engine-v1", "scopes": ["engine.command.interpret","engine.context.write"] },
  //   "token_value_2": { "serviceId": "test-client-v1",   "scopes": ["shadow.chat","shadow.understand","shadow.knowledge.read"] }
  // }
  var registry = null;
  try {
    var raw = (env && env.SR_SERVICE_TOKENS) ? env.SR_SERVICE_TOKENS : null;
    if (!raw) {
      // NODE.JS TEST MODE: if SR_API_TEST_MODE is set, allow a well-known test token
      if (process && process.env && process.env.SR_API_TEST_MODE === 'true') {
        var testTokens = _getTestTokenRegistry();
        var testEntry  = testTokens[token];
        if (!testEntry) return { ok: false, reason: 'Token not recognized.' };
        if (scopeRequired && testEntry.scopes.indexOf(scopeRequired) === -1) {
          return { ok: false, reason: 'Token does not have required scope: ' + scopeRequired };
        }
        return { ok: true, serviceId: testEntry.serviceId, scopes: testEntry.scopes };
      }
      return { ok: false, reason: 'Token registry not configured.' };
    }
    registry = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: 'Token registry configuration is invalid.' };
  }

  var entry = registry[token];
  if (!entry) {
    return { ok: false, reason: 'Token not recognized.' };
  }
  if (!entry.serviceId || !Array.isArray(entry.scopes)) {
    return { ok: false, reason: 'Token record is malformed.' };
  }

  // Check scope
  if (scopeRequired && entry.scopes.indexOf(scopeRequired) === -1) {
    return { ok: false, reason: 'Token does not have required scope: ' + scopeRequired };
  }

  return { ok: true, serviceId: entry.serviceId, scopes: entry.scopes };
}

/**
 * Returns the in-memory test token registry used in SR_API_TEST_MODE.
 * These tokens only work when SR_API_TEST_MODE=true.
 * They must never appear in production.
 */
function _getTestTokenRegistry() {
  return {
    'sr-test-chat-token-v1': {
      serviceId: 'test-client',
      scopes:    [SCOPES.CHAT, SCOPES.UNDERSTAND, SCOPES.KNOWLEDGE_READ],
    },
    'sr-test-engine-token-v1': {
      serviceId: 'test-engine-client',
      scopes:    [SCOPES.ENGINE_COMMAND, SCOPES.ENGINE_CONTEXT],
    },
    'sr-test-full-token-v1': {
      serviceId: 'test-full-client',
      scopes:    Object.values(SCOPES),
    },
  };
}

/**
 * Get the required scope for an endpoint key.
 * @param {string} method  - HTTP method (GET, POST)
 * @param {string} path    - URL path (e.g. /api/v1/chat)
 * @returns {string|null}  - scope string or null (public)
 */
function scopeForEndpoint(method, endpointPath) {
  var key = method.toUpperCase() + ' ' + endpointPath;
  return ENDPOINT_SCOPES.hasOwnProperty(key) ? ENDPOINT_SCOPES[key] : SCOPES.CHAT;
}

/**
 * Get test tokens for testing purposes (returns non-secret test tokens only).
 * @returns {object} map of testTokenValue → { serviceId, scopes }
 */
function getTestTokens() {
  return _getTestTokenRegistry();
}

module.exports = {
  SCOPES:            SCOPES,
  ENDPOINT_SCOPES:   ENDPOINT_SCOPES,
  extractBearer:     extractBearer,
  verifyToken:       verifyToken,
  scopeForEndpoint:  scopeForEndpoint,
  getTestTokens:     getTestTokens,
};
