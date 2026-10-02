/**
 * cloudflare/worker/lib/cloud-logger.js
 * Shadow Reaper Cloud API — Safe Structured Logger
 *
 * Build: SR-CLOUD-API-1
 *
 * Logs safe diagnostic information only.
 *
 * NEVER logs:
 *   - Private memory contents
 *   - Full conversation text
 *   - Credentials, tokens, or secrets
 *   - Firebase service account or access tokens
 *   - Full request/response bodies
 *
 * DOES log:
 *   - Request ID
 *   - Endpoint (method + path)
 *   - Response status code
 *   - Latency (ms)
 *   - Auth outcome (success/failure, NOT the token value)
 *   - Firebase errors (class, NOT detailed internal data)
 *   - Rate limit events (identity prefix only, NOT full UID)
 */

'use strict';

/**
 * Log a completed request.
 *
 * @param {object} opts
 * @param {string} opts.requestId
 * @param {string} opts.method
 * @param {string} opts.path
 * @param {number} opts.status
 * @param {number} opts.latencyMs
 * @param {string} [opts.event]   - Optional event tag (e.g. 'auth_failure', 'rate_limited')
 */
function logRequest({ requestId, method, path, status, latencyMs, event }) {
  const entry = {
    ts:        new Date().toISOString(),
    reqId:     requestId,
    method,
    path,
    status,
    latMs:     latencyMs,
  };
  if (event) entry.event = event;
  // Use structured console.log — Cloudflare Workers Logs picks this up
  console.log(JSON.stringify(entry));
}

/**
 * Log a Firebase/cloud storage failure.
 *
 * @param {string} requestId
 * @param {string} operation   - 'get' | 'set' | 'list' | 'delete' etc.
 * @param {string} errorClass  - Generic error class, NOT message content
 */
function logFirebaseFailure(requestId, operation, errorClass) {
  console.warn(JSON.stringify({
    ts:        new Date().toISOString(),
    reqId:     requestId,
    event:     'firebase_failure',
    operation,
    errorClass,
  }));
}

/**
 * Log an auth failure event.
 *
 * @param {string} requestId
 * @param {string} reason  - Safe reason (no token values)
 */
function logAuthFailure(requestId, reason) {
  console.warn(JSON.stringify({
    ts:     new Date().toISOString(),
    reqId:  requestId,
    event:  'auth_failure',
    reason,
  }));
}

/**
 * Log a rate limit event.
 *
 * @param {string} requestId
 * @param {string} uidPrefix  - First 6 chars of UID only (not full UID)
 * @param {string} path
 */
function logRateLimit(requestId, uidPrefix, path) {
  console.warn(JSON.stringify({
    ts:        new Date().toISOString(),
    reqId:     requestId,
    event:     'rate_limited',
    uidPrefix,
    path,
  }));
}

export { logRequest, logFirebaseFailure, logAuthFailure, logRateLimit };
