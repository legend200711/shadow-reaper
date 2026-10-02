/**
 * shadow-reaper-v2/api/v1/lib/rate-limiter.js
 * Shadow Reaper API v1 — Rate Limiter
 *
 * Build: SR-API-V1-1
 *
 * In-memory rate limiter for Node.js local development and testing.
 * In production (Cloudflare Worker), Cloudflare's built-in rate limiting
 * should be configured at the Workers route level for scalable enforcement.
 *
 * DESIGN:
 *   - Per-service-identity windows (not per-IP in API tier — IP is handled by CF)
 *   - Different limits per endpoint category:
 *       CHAT:          30 requests / 60 seconds
 *       UNDERSTAND:    60 requests / 60 seconds
 *       KNOWLEDGE:     60 requests / 60 seconds
 *       ENGINE_CMD:    30 requests / 60 seconds
 *       ENGINE_CTX:    60 requests / 60 seconds
 *       HEALTH:       120 requests / 60 seconds  (generous — monitoring)
 *   - Sliding window (simple token bucket)
 *   - Safe defaults that do NOT break normal local development
 *
 * NOTE:
 *   This limiter is intentionally simple for the API readiness stage.
 *   It resets between process restarts (in-memory only).
 */

'use strict';

// ── Limit tiers (requests per window) ───────────────────────────────────────

var TIERS = {
  CHAT:        { max: 30,  windowMs: 60000 },
  UNDERSTAND:  { max: 60,  windowMs: 60000 },
  KNOWLEDGE:   { max: 60,  windowMs: 60000 },
  ENGINE_CMD:  { max: 30,  windowMs: 60000 },
  ENGINE_CTX:  { max: 60,  windowMs: 60000 },
  HEALTH:      { max: 120, windowMs: 60000 },
  DEFAULT:     { max: 30,  windowMs: 60000 },
};

// ── Path → tier mapping ──────────────────────────────────────────────────────

function _tierForPath(apiPath) {
  if (apiPath === '/api/v1/chat')             return 'CHAT';
  if (apiPath === '/api/v1/understand')       return 'UNDERSTAND';
  if (apiPath === '/api/v1/knowledge/query')  return 'KNOWLEDGE';
  if (apiPath === '/api/v1/engine/command')   return 'ENGINE_CMD';
  if (apiPath === '/api/v1/engine/context')   return 'ENGINE_CTX';
  if (apiPath === '/api/v1/health')           return 'HEALTH';
  if (apiPath === '/api/v1/capabilities')     return 'HEALTH';
  return 'DEFAULT';
}

// ── In-memory store: { key → { count, windowStart } } ───────────────────────

var _store = {};

/**
 * Check and increment rate limit for a given identity and path.
 *
 * @param {string} identity  - Service ID or IP (from auth or request)
 * @param {string} apiPath   - The API endpoint path
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs?: number }}
 */
function check(identity, apiPath) {
  var tier   = TIERS[_tierForPath(apiPath)] || TIERS.DEFAULT;
  var key    = identity + ':' + apiPath;
  var now    = Date.now();

  var bucket = _store[key];
  if (!bucket || (now - bucket.windowStart) >= tier.windowMs) {
    // New window
    _store[key] = { count: 1, windowStart: now };
    return { allowed: true, remaining: tier.max - 1 };
  }

  bucket.count++;
  if (bucket.count > tier.max) {
    var retryAfter = tier.windowMs - (now - bucket.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs: retryAfter };
  }

  return { allowed: true, remaining: tier.max - bucket.count };
}

/**
 * Reset all rate limit buckets (for testing).
 */
function reset() {
  _store = {};
}

/**
 * Get current bucket state for a key (for testing / debugging).
 * @param {string} identity
 * @param {string} apiPath
 */
function peek(identity, apiPath) {
  var key = identity + ':' + apiPath;
  return _store[key] || null;
}

module.exports = {
  TIERS:  TIERS,
  check:  check,
  reset:  reset,
  peek:   peek,
};
