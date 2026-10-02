/**
 * shadow-reaper-v2/api/v1/lib/errors.js
 * Shadow Reaper API v1 — Standardized Error Definitions
 *
 * Build: SR-API-V1-1
 *
 * PRINCIPLES:
 *   - Never leak stack traces to API clients.
 *   - Never include credentials, tokens, or private data in errors.
 *   - Always include a requestId for tracing.
 *   - Every error has a stable machine-readable code.
 */

'use strict';

// ── Error code registry ──────────────────────────────────────────────────────

var ERROR_CODES = {
  INVALID_REQUEST:     { status: 400, message: 'The request could not be processed due to invalid input.' },
  UNAUTHORIZED:        { status: 401, message: 'Authentication is required.' },
  FORBIDDEN:           { status: 403, message: 'You do not have permission to perform this action.' },
  RATE_LIMITED:        { status: 429, message: 'Too many requests. Please wait before trying again.' },
  PAYLOAD_TOO_LARGE:   { status: 413, message: 'The request payload exceeds the allowed size limit.' },
  UNKNOWN_INTENT:      { status: 422, message: 'The intent could not be determined from the input.' },
  LOW_CONFIDENCE:      { status: 422, message: 'Confidence is too low to return a reliable result.' },
  KNOWLEDGE_NOT_FOUND: { status: 404, message: 'No matching knowledge was found for the query.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'A required service is temporarily unavailable.' },
  INTERNAL_ERROR:      { status: 500, message: 'An internal error occurred. Please try again.' },
  NOT_FOUND:           { status: 404, message: 'The requested endpoint does not exist.' },
};

/**
 * Build a standardized error response body.
 *
 * @param {string} code       - One of ERROR_CODES keys
 * @param {string} requestId  - The request ID for tracing
 * @param {string} [detail]   - Optional safe detail (no stacks, no credentials)
 * @returns {{ ok: false, error: { code, message, detail? }, requestId }}
 */
function buildError(code, requestId, detail) {
  var entry = ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR;
  var body  = {
    ok:        false,
    error:     { code: code, message: entry.message },
    requestId: requestId || 'unknown',
  };
  // Only include detail if it is a safe, non-stack string
  if (detail && typeof detail === 'string' && detail.length <= 256) {
    // Strip anything that looks like a stack trace
    var safeDetail = detail
      .replace(/at\s+\S+\s*\([^)]*\)/g, '')    // "at foo (bar.js:1)"
      .replace(/\/[^\s:]+:\d+:\d+/g, '')        // "/path/file.js:1:2"
      .trim();
    if (safeDetail.length > 0) {
      body.error.detail = safeDetail;
    }
  }
  return body;
}

/**
 * Get the HTTP status code for a given error code.
 * @param {string} code
 * @returns {number}
 */
function statusFor(code) {
  var entry = ERROR_CODES[code];
  return entry ? entry.status : 500;
}

module.exports = {
  ERROR_CODES:  ERROR_CODES,
  buildError:   buildError,
  statusFor:    statusFor,
};
