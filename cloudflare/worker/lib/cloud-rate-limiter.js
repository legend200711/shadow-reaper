/**
 * cloudflare/worker/lib/cloud-rate-limiter.js
 * Shadow Reaper Cloud API — In-Worker Rate Limiter
 *
 * Build: SR-CLOUD-API-1
 *
 * Per-UID sliding window rate limiter backed by a module-level Map.
 * Cloudflare Workers are stateless across invocations but stateful within
 * a single isolate's lifetime — this provides reasonable abuse protection
 * for the same installation hitting the same isolate rapidly.
 *
 * For stronger rate limiting, configure Cloudflare Rate Limiting rules
 * at the Zone/Route level (no extra code needed).
 *
 * LIMITS (designed for a free personal assistant):
 *   Memory writes:       20 per minute per installation
 *   Conversation writes: 20 per minute per installation
 *   Project writes:      15 per minute per installation
 *   Settings:            10 per minute per installation
 *   Adaptive profile:    10 per minute per installation
 *   Sync:                10 per minute per installation
 *   Reads (GET):         60 per minute per installation
 *   Health:              120 per minute (no uid)
 */

'use strict';

const TIERS = {
  READ:        { max: 60,  windowMs: 60_000 },
  MEMORY:      { max: 20,  windowMs: 60_000 },
  CONVERSATION:{ max: 20,  windowMs: 60_000 },
  PROJECT:     { max: 15,  windowMs: 60_000 },
  SETTINGS:    { max: 10,  windowMs: 60_000 },
  ADAPTIVE:    { max: 10,  windowMs: 60_000 },
  SYNC:        { max: 10,  windowMs: 60_000 },
  HEALTH:      { max: 120, windowMs: 60_000 },
  DEFAULT:     { max: 30,  windowMs: 60_000 },
};

function _tierForRequest(method, path) {
  if (path === '/api/v1/health') return 'HEALTH';
  if (method === 'GET') return 'READ';
  if (path.startsWith('/api/v1/memory'))           return 'MEMORY';
  if (path.startsWith('/api/v1/conversations'))    return 'CONVERSATION';
  if (path.startsWith('/api/v1/projects'))         return 'PROJECT';
  if (path.startsWith('/api/v1/settings'))         return 'SETTINGS';
  if (path.startsWith('/api/v1/adaptive-profile')) return 'ADAPTIVE';
  if (path.startsWith('/api/v1/sync'))             return 'SYNC';
  return 'DEFAULT';
}

// Map: key → { count, windowStart }
const _store = new Map();

/**
 * Check and increment rate limit.
 *
 * @param {string} identity  - UID or 'anonymous'
 * @param {string} method    - HTTP method
 * @param {string} path      - URL path
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs?: number }}
 */
function check(identity, method, path) {
  const tierName = _tierForRequest(method, path);
  const tier     = TIERS[tierName];
  const key      = identity + ':' + tierName;
  const now      = Date.now();

  let bucket = _store.get(key);
  if (!bucket || (now - bucket.windowStart) >= tier.windowMs) {
    _store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: tier.max - 1 };
  }

  bucket.count++;
  if (bucket.count > tier.max) {
    const retryAfterMs = tier.windowMs - (now - bucket.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }
  return { allowed: true, remaining: tier.max - bucket.count };
}

/** Reset all buckets (for testing). */
function reset() {
  _store.clear();
}

export { TIERS, check, reset };
