/**
 * shadow-reaper-v2/api/v1/routes/knowledge.js
 * Shadow Reaper API v1 — POST /api/v1/knowledge/query
 *
 * Build: SR-API-V1-1
 *
 * Exposes bounded read-only access to PUBLIC preloaded knowledge only.
 *
 * PRIVACY BOUNDARY (enforced here):
 *   PUBLIC/PRELOADED KNOWLEDGE  → accessible via this endpoint
 *   CREATOR KNOWLEDGE           → accessible via this endpoint
 *   PRIVATE USER MEMORY         → NEVER accessible via this endpoint
 *   PERSONAL LEARNED CONTEXT    → NEVER accessible via this endpoint
 *
 * Does NOT expose Firebase data. Does NOT call Firestore.
 */

'use strict';

var schemas = require('../lib/schemas');
var errors  = require('../lib/errors');
var bridge  = require('../lib/intelligence-bridge');

/**
 * Handle POST /api/v1/knowledge/query
 *
 * @param {object} body - Parsed JSON request body
 * @param {object} ctx  - { requestId }
 * @returns {{ status: number, body: object }}
 */
function handleKnowledgeQuery(body, ctx) {
  var validation = schemas.validateKnowledgeQueryRequest(body);
  if (!validation.ok) {
    return {
      status: 400,
      body:   errors.buildError('INVALID_REQUEST', ctx.requestId, validation.reason),
    };
  }

  var result = bridge.queryKnowledge(body.query.trim());

  if (!result) {
    return {
      status: 503,
      body:   errors.buildError('INTERNAL_ERROR', ctx.requestId),
    };
  }

  if (!result.knowledgeAvailable) {
    return {
      status: 503,
      body:   errors.buildError('SERVICE_UNAVAILABLE', ctx.requestId, 'Knowledge engine is not available.'),
    };
  }

  if (!result.ok && result.error === 'KNOWLEDGE_NOT_FOUND') {
    return {
      status: 404,
      body:   errors.buildError('KNOWLEDGE_NOT_FOUND', ctx.requestId),
    };
  }

  if (!result.ok) {
    return {
      status: 500,
      body:   errors.buildError('INTERNAL_ERROR', ctx.requestId),
    };
  }

  return {
    status: 200,
    body:   {
      ok:        true,
      results:   result.results,
      source:    result.source,
      count:     result.results.length,
      requestId: ctx.requestId,
    },
  };
}

module.exports = { handleKnowledgeQuery: handleKnowledgeQuery };
