/**
 * shadow-reaper-v2/api/v1/routes/understand.js
 * Shadow Reaper API v1 — POST /api/v1/understand
 *
 * Build: SR-API-V1-1
 *
 * Analyze language WITHOUT executing anything.
 * Returns structured: intent, entities, tone, concepts, confidence.
 */

'use strict';

var schemas = require('../lib/schemas');
var errors  = require('../lib/errors');
var bridge  = require('../lib/intelligence-bridge');

/**
 * Handle POST /api/v1/understand
 *
 * @param {object} body - Parsed JSON request body
 * @param {object} ctx  - { requestId }
 * @returns {{ status: number, body: object }}
 */
function handleUnderstand(body, ctx) {
  var validation = schemas.validateUnderstandRequest(body);
  if (!validation.ok) {
    return {
      status: 400,
      body:   errors.buildError('INVALID_REQUEST', ctx.requestId, validation.reason),
    };
  }

  var result = bridge.understand(body.message.trim());

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

  // Low confidence guard
  if (result.confidence < 0.20) {
    return {
      status: 422,
      body: Object.assign(
        errors.buildError('LOW_CONFIDENCE', ctx.requestId),
        { confidence: result.confidence, intent: result.intent }
      ),
    };
  }

  return {
    status: 200,
    body:   {
      ok:                   true,
      intent:               result.intent,
      entities:             result.entities,
      tone:                 result.tone,
      concepts:             result.concepts,
      confidence:           result.confidence,
      requiresClarification: result.requiresClarification,
      requestId:            ctx.requestId,
    },
  };
}

module.exports = { handleUnderstand: handleUnderstand };
