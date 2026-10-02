/**
 * shadow-reaper-v2/api/v1/routes/chat.js
 * Shadow Reaper API v1 — POST /api/v1/chat
 *
 * Build: SR-API-V1-1
 *
 * Routes through the SAME intelligence used by the local Shadow Reaper UI.
 * Does NOT create a second AI brain.
 */

'use strict';

var schemas = require('../lib/schemas');
var errors  = require('../lib/errors');
var bridge  = require('../lib/intelligence-bridge');

var TIMEOUT_MS = 8000;

/**
 * Handle POST /api/v1/chat
 *
 * @param {object} body - Parsed JSON request body
 * @param {object} ctx  - { requestId }
 * @returns {Promise<{ status: number, body: object }>}
 */
async function handleChat(body, ctx) {
  var validation = schemas.validateChatRequest(body);
  if (!validation.ok) {
    return {
      status: 400,
      body:   errors.buildError('INVALID_REQUEST', ctx.requestId, validation.reason),
    };
  }

  var result = await bridge.chat(body.message.trim(), TIMEOUT_MS);

  if (result && result.timedOut) {
    return {
      status: 503,
      body:   errors.buildError('SERVICE_UNAVAILABLE', ctx.requestId, 'Request timed out.'),
    };
  }

  if (!result || !result.ok) {
    var errCode = (result && result.error) ? result.error : 'INTERNAL_ERROR';
    if (errors.ERROR_CODES[errCode]) {
      return {
        status: errors.statusFor(errCode),
        body:   errors.buildError(errCode, ctx.requestId),
      };
    }
    return {
      status: 503,
      body:   errors.buildError('SERVICE_UNAVAILABLE', ctx.requestId),
    };
  }

  return {
    status: 200,
    body:   {
      ok:        true,
      response:  result.response,
      intent:    result.intent,
      tone:      result.tone,
      requestId: ctx.requestId,
    },
  };
}

module.exports = { handleChat: handleChat };
