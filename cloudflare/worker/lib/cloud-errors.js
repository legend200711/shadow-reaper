/**
 * cloudflare/worker/lib/cloud-errors.js
 * Shadow Reaper Cloud API — Error helpers
 *
 * Build: SR-CLOUD-API-1
 *
 * Consistent { ok, error: { code, message }, requestId } format.
 * NEVER leaks stack traces, credentials, or Firebase internals.
 */

'use strict';

const ERROR_CODES = {
  INVALID_REQUEST:     { status: 400, message: 'The request could not be processed due to invalid input.' },
  UNAUTHORIZED:        { status: 401, message: 'Authentication is required.' },
  FORBIDDEN:           { status: 403, message: 'You do not have permission to perform this action.' },
  NOT_FOUND:           { status: 404, message: 'The requested resource does not exist.' },
  PAYLOAD_TOO_LARGE:   { status: 413, message: 'The request payload exceeds the allowed size limit.' },
  RATE_LIMITED:        { status: 429, message: 'Too many requests. Please wait before trying again.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'A required service is temporarily unavailable.' },
  FIREBASE_UNAVAILABLE:{ status: 503, message: 'Cloud storage is temporarily unavailable.' },
  INTERNAL_ERROR:      { status: 500, message: 'An internal error occurred. Please try again.' },
  ENDPOINT_NOT_FOUND:  { status: 404, message: 'The requested endpoint does not exist.' },
};

/**
 * Build a standardized error response body.
 * @param {string}  code      - Key from ERROR_CODES
 * @param {string}  requestId
 * @param {string}  [detail]  - Optional safe detail (no stacks)
 * @returns {{ ok: false, error: { code, message }, requestId }}
 */
function buildError(code, requestId, detail) {
  const entry = ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR;
  const body  = {
    ok:        false,
    error:     { code, message: entry.message },
    requestId: requestId || 'unknown',
  };
  if (detail && typeof detail === 'string' && detail.length <= 256) {
    // Strip stack-like content
    const safe = detail.replace(/at\s+\S+\s*\([^)]*\)/g, '').replace(/\/[^\s:]+:\d+:\d+/g, '').trim();
    if (safe.length > 0) body.error.detail = safe;
  }
  return body;
}

/**
 * @param {string} code
 * @returns {number} HTTP status
 */
function statusFor(code) {
  return (ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR).status;
}

/**
 * Build a success response body.
 * @param {*}      data
 * @param {string} requestId
 * @returns {{ ok: true, data, requestId }}
 */
function buildSuccess(data, requestId) {
  return { ok: true, data, requestId: requestId || 'unknown' };
}

export { ERROR_CODES, buildError, statusFor, buildSuccess };
