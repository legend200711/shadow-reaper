/**
 * shadow-reaper-v2/api/v1/lib/request-id.js
 * Shadow Reaper API v1 — Request ID Generator
 *
 * Build: SR-API-V1-1
 *
 * Every API request receives a unique request ID for tracing without
 * logging private conversation content.
 *
 * Format: sr_<timestamp_base36>_<random_hex>
 * Example: sr_lzqx1k_4f8a2c9d
 */

'use strict';

/**
 * Generate a new request ID.
 * @returns {string} sr_<base36timestamp>_<randomhex>
 */
function generateRequestId() {
  var ts  = Date.now().toString(36);
  var rnd = Math.random().toString(16).slice(2, 10);
  return 'sr_' + ts + '_' + rnd;
}

/**
 * Middleware: attach requestId to request object and add to response log context.
 * Works in both Node.js (Express-style) and Cloudflare Worker context.
 *
 * Node/Express usage:
 *   app.use(requestIdMiddleware);
 *
 * Cloudflare usage:
 *   const reqId = generateRequestId();
 */
function requestIdMiddleware(req, res, next) {
  req.requestId = generateRequestId();
  if (next) next();
}

module.exports = {
  generateRequestId:    generateRequestId,
  requestIdMiddleware:  requestIdMiddleware,
};
