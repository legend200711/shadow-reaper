/**
 * shadow-reaper-v2/api/v1/routes/engine.js
 * Shadow Reaper API v1 — Engine Command & Context Routes
 *
 * Build: SR-API-V1-1
 *
 * POST /api/v1/engine/command  — INTERPRETATION ONLY
 * POST /api/v1/engine/context  — Accept bounded engine state
 *
 * CRITICAL:
 *   These handlers interpret language and accept context.
 *   Shadow Reaper NEVER executes broadcasts, schedules, streams, or FFmpeg.
 *   The 24-Hour Engine is the sole executor.
 *   No RTMP. No YouTube. No Twitch. No Facebook. No FFmpeg strings.
 */

'use strict';

var schemas = require('../lib/schemas');
var errors  = require('../lib/errors');
var bridge  = require('../lib/intelligence-bridge');
var cmdSchema = require('../lib/command-schema');

// ── Engine Command Interpretation ─────────────────────────────────────────────

/**
 * Handle POST /api/v1/engine/command
 *
 * Interprets natural language into a structured engine command.
 * Returns strict JSON. Never returns shell commands or executable strings.
 *
 * @param {object} body - { message: string }
 * @param {object} ctx  - { requestId }
 * @returns {{ status: number, body: object }}
 */
function handleEngineCommand(body, ctx) {
  var validation = schemas.validateEngineCommandRequest(body);
  if (!validation.ok) {
    return {
      status: 400,
      body:   errors.buildError('INVALID_REQUEST', ctx.requestId, validation.reason),
    };
  }

  var result = bridge.interpretEngineCommand(body.message.trim());

  if (!result) {
    return {
      status: 503,
      body:   errors.buildError('INTERNAL_ERROR', ctx.requestId),
    };
  }

  // Service unavailable
  if (!result.ok && result.error === 'SERVICE_UNAVAILABLE') {
    return {
      status: 503,
      body:   errors.buildError('SERVICE_UNAVAILABLE', ctx.requestId),
    };
  }

  // Unknown intent
  if (!result.ok && result.error === 'UNKNOWN_INTENT') {
    return {
      status: 422,
      body: {
        ok:                    false,
        error:                 { code: 'UNKNOWN_INTENT', message: errors.ERROR_CODES.UNKNOWN_INTENT.message },
        intent:                result.intent || 'UNKNOWN_INTENT',
        confidence:            result.confidence || 0,
        requiresClarification: true,
        requestId:             ctx.requestId,
      },
    };
  }

  // Low confidence path
  if (result.confidence < cmdSchema.CONFIDENCE.REQUIRES_CLARIFICATION) {
    return {
      status: 422,
      body: {
        ok:                    false,
        error:                 { code: 'LOW_CONFIDENCE', message: errors.ERROR_CODES.LOW_CONFIDENCE.message },
        intent:                result.intent,
        parameters:            result.parameters || {},
        confidence:            result.confidence,
        requiresClarification: true,
        requestId:             ctx.requestId,
      },
    };
  }

  // Validate the result against the command schema before returning
  var schemaCheck = cmdSchema.validateCommandResult({
    intent:     result.intent,
    parameters: result.parameters,
    confidence: result.confidence,
  });
  if (!schemaCheck.ok) {
    return {
      status: 500,
      body:   errors.buildError('INTERNAL_ERROR', ctx.requestId),
    };
  }

  return {
    status: 200,
    body: {
      ok:                    true,
      intent:                result.intent,
      parameters:            result.parameters || {},
      confidence:            result.confidence,
      requiresClarification: result.requiresClarification,
      schemaVersion:         cmdSchema.SCHEMA_VERSION,
      requestId:             ctx.requestId,
    },
  };
}

// ── Engine Context ─────────────────────────────────────────────────────────────

/**
 * Handle POST /api/v1/engine/context
 *
 * Accepts bounded current state from the 24-Hour Engine.
 * Shadow Reaper is NOT the authoritative database for engine state.
 * Context is informational only.
 *
 * @param {object} body - Engine context payload
 * @param {object} ctx  - { requestId }
 * @returns {{ status: number, body: object }}
 */
function handleEngineContext(body, ctx) {
  var validation = schemas.validateEngineContextRequest(body);
  if (!validation.ok) {
    return {
      status: 400,
      body:   errors.buildError('INVALID_REQUEST', ctx.requestId, validation.reason),
    };
  }

  var result = bridge.acceptEngineContext(body);

  if (!result || !result.ok) {
    return {
      status: 503,
      body:   errors.buildError('INTERNAL_ERROR', ctx.requestId),
    };
  }

  return {
    status: 200,
    body: {
      ok:        true,
      accepted:  true,
      engineId:  result.engineId,
      status:    result.status,
      requestId: ctx.requestId,
    },
  };
}

module.exports = {
  handleEngineCommand: handleEngineCommand,
  handleEngineContext: handleEngineContext,
};
