/**
 * shadow-reaper-v2/api/v1/routes/capabilities.js
 * Shadow Reaper API v1 — GET /api/v1/capabilities
 *
 * Build: SR-API-V1-1
 *
 * Reports REAL implemented capabilities.
 * Does NOT advertise functionality that does not exist.
 *
 * Capability availability modes:
 *   LOCAL_ONLY       — works without network
 *   ONLINE_AVAILABLE — requires the online API
 *   HYBRID           — works locally but enhanced online
 *   NOT_IMPLEMENTED  — defined but not yet built
 */

'use strict';

var bridge = require('../lib/intelligence-bridge');
var cmd    = require('../lib/command-schema');

/**
 * Handle GET /api/v1/capabilities
 *
 * @param {object} ctx - { requestId }
 * @returns {{ status: number, body: object }}
 */
function handleCapabilities(ctx) {
  var realCaps = bridge.getCapabilities();

  // Map each capability to its availability status honestly
  var capDetail = [
    {
      id:           'chat',
      description:  'Conversational intelligence through the Shadow Reaper pipeline.',
      availability: realCaps.indexOf('chat') !== -1 ? 'HYBRID' : 'NOT_IMPLEMENTED',
      endpoint:     'POST /api/v1/chat',
    },
    {
      id:           'understand',
      description:  'Analyze language: intent, entities, tone, concepts. No execution.',
      availability: realCaps.indexOf('understand') !== -1 ? 'HYBRID' : 'NOT_IMPLEMENTED',
      endpoint:     'POST /api/v1/understand',
    },
    {
      id:           'knowledge-query',
      description:  'Query public preloaded knowledge (Shadow Nexus, creator, general).',
      availability: realCaps.indexOf('knowledge-query') !== -1 ? 'LOCAL_ONLY' : 'NOT_IMPLEMENTED',
      endpoint:     'POST /api/v1/knowledge/query',
    },
    {
      id:           'engine-command-interpretation',
      description:  'Interpret natural language into structured engine commands. No execution.',
      availability: realCaps.indexOf('engine-command-interpretation') !== -1 ? 'HYBRID' : 'NOT_IMPLEMENTED',
      endpoint:     'POST /api/v1/engine/command',
    },
    {
      id:           'engine-context',
      description:  'Accept bounded engine state context from the 24-Hour Engine.',
      availability: realCaps.indexOf('engine-context') !== -1 ? 'ONLINE_AVAILABLE' : 'NOT_IMPLEMENTED',
      endpoint:     'POST /api/v1/engine/context',
    },
  ];

  return {
    status: 200,
    body:   {
      ok:              true,
      apiVersion:      'v1',
      commandSchema:   cmd.SCHEMA_VERSION,
      capabilities:    capDetail,
      requestId:       ctx.requestId,
    },
  };
}

module.exports = { handleCapabilities: handleCapabilities };
