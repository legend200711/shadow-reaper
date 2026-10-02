/**
 * shadow-reaper-v2/api/v1/routes/health.js
 * Shadow Reaper API v1 — GET /api/v1/health
 *
 * Build: SR-API-V1-1
 *
 * Returns safe status information about Shadow Reaper components.
 *
 * NEVER exposes:
 *   - secrets or tokens
 *   - Firebase credentials
 *   - private user information
 *   - internal security configuration
 *   - stack traces
 */

'use strict';

var pkg    = require('../../../package.json');
var bridge = require('../lib/intelligence-bridge');

/**
 * Handle GET /api/v1/health
 *
 * @param {object} ctx - { requestId, env }
 * @returns {{ status: number, body: object }}
 */
function handleHealth(ctx) {
  var componentStatus = bridge.getComponentStatus();

  // Determine overall status
  var coreReady = componentStatus.understanding &&
                  componentStatus.contextEngine &&
                  componentStatus.conversationEngine &&
                  componentStatus.responseEngine;

  var overallStatus = coreReady ? 'ready' : 'degraded';
  if (!componentStatus.understanding && !componentStatus.knowledgeEngine) {
    overallStatus = 'unavailable';
  }

  var body = {
    ok:           overallStatus !== 'unavailable',
    service:      'shadow-reaper',
    apiVersion:   'v1',
    status:       overallStatus,
    requestId:    ctx.requestId,
    components: {
      languageFoundation: componentStatus.languageFoundation ? 'ready' : 'unavailable',
      knowledgeEngine:    componentStatus.knowledgeEngine    ? 'ready' : 'unavailable',
      conversationEngine: (componentStatus.contextEngine && componentStatus.conversationEngine && componentStatus.responseEngine)
                            ? 'ready' : 'unavailable',
      understanding:      componentStatus.understanding     ? 'ready' : 'unavailable',
    },
  };

  return {
    status: overallStatus !== 'unavailable' ? 200 : 503,
    body:   body,
  };
}

module.exports = { handleHealth: handleHealth };
