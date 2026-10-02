/**
 * shadow-reaper-v2/api/v1/router.js
 * Shadow Reaper API v1 — Core Request Router
 *
 * Build: SR-API-V1-1
 *
 * Framework-agnostic router that works in:
 *   1. Node.js (local dev server / tests)
 *   2. Cloudflare Worker (via the worker adapter)
 *
 * All request/response handling flows through this router.
 * The router enforces:
 *   - Authentication (for protected endpoints)
 *   - Authorization (scope checking)
 *   - Rate limiting
 *   - Request ID assignment
 *   - Input validation (delegated to route handlers)
 *   - Standardized error formatting
 *
 * TIMEOUTS:
 *   Chat route: 8 seconds
 *   All others: synchronous (no timeout needed — deterministic)
 */

'use strict';

var { generateRequestId }    = require('./lib/request-id');
var { buildError, statusFor } = require('./lib/errors');
var { extractBearer, verifyToken, scopeForEndpoint } = require('./lib/auth');
var rateLimiter              = require('./lib/rate-limiter');
var bridge                   = require('./lib/intelligence-bridge');

var healthRoute      = require('./routes/health');
var capabilitiesRoute = require('./routes/capabilities');
var chatRoute        = require('./routes/chat');
var understandRoute  = require('./routes/understand');
var knowledgeRoute   = require('./routes/knowledge');
var engineRoute      = require('./routes/engine');
var researchRoute    = require('./routes/research');
var weatherRoute     = require('./routes/weather');

// ── One-time bridge initialization ──────────────────────────────────────────

var _bridgeLoaded = false;

function _ensureBridge() {
  if (!_bridgeLoaded) {
    var projectRoot = require('path').resolve(__dirname, '../..');
    bridge.load(projectRoot);
    _bridgeLoaded = true;
  }
}

// ── Public endpoint definitions (no auth required) ──────────────────────────

var PUBLIC_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/capabilities',
]);

// ── Route table ──────────────────────────────────────────────────────────────

var ROUTES = [
  { method: 'GET',  path: '/api/v1/health',           handler: _handleHealth },
  { method: 'GET',  path: '/api/v1/capabilities',     handler: _handleCapabilities },
  { method: 'POST', path: '/api/v1/chat',              handler: _handleChat },
  { method: 'POST', path: '/api/v1/understand',        handler: _handleUnderstand },
  { method: 'POST', path: '/api/v1/knowledge/query',   handler: _handleKnowledge },
  { method: 'POST', path: '/api/v1/engine/command',    handler: _handleEngineCommand },
  { method: 'POST', path: '/api/v1/engine/context',    handler: _handleEngineContext },
  { method: 'POST', path: '/api/v1/research',          handler: _handleResearch },
  { method: 'POST', path: '/api/v1/weather',           handler: _handleWeather },
];

// ── Handler wrappers ──────────────────────────────────────────────────────────

function _handleHealth(_body, ctx)       { return healthRoute.handleHealth(ctx); }
function _handleCapabilities(_body, ctx) { return capabilitiesRoute.handleCapabilities(ctx); }
async function _handleChat(body, ctx)    { return chatRoute.handleChat(body, ctx); }
function _handleUnderstand(body, ctx)    { return understandRoute.handleUnderstand(body, ctx); }
function _handleKnowledge(body, ctx)     { return knowledgeRoute.handleKnowledgeQuery(body, ctx); }
function _handleEngineCommand(body, ctx) { return engineRoute.handleEngineCommand(body, ctx); }
function _handleEngineContext(body, ctx) { return engineRoute.handleEngineContext(body, ctx); }
async function _handleResearch(body, ctx){ return researchRoute.handleResearch(body, ctx); }
async function _handleWeather(body, ctx) { return weatherRoute.handleWeather(body, ctx); }

// ── Main dispatch ─────────────────────────────────────────────────────────────

/**
 * Dispatch an API request.
 *
 * @param {object} req
 * @param {string} req.method      - HTTP method
 * @param {string} req.path        - URL path
 * @param {object} req.headers     - Header key-value map (lowercase keys)
 * @param {object|null} req.body   - Parsed JSON body (null for GET)
 * @param {object} [req.env]       - Environment secrets (Cloudflare env or process.env)
 *
 * @returns {Promise<{ status: number, body: object, requestId: string }>}
 */
async function dispatch(req) {
  _ensureBridge();

  var requestId = generateRequestId();
  var method    = (req.method || 'GET').toUpperCase();
  var apiPath   = req.path;
  var env       = req.env || {};

  // ── CORS preflight ───────────────────────────────────────────────────────
  if (method === 'OPTIONS') {
    return { status: 204, body: null, requestId: requestId };
  }

  // ── Route matching ───────────────────────────────────────────────────────
  var route = null;
  for (var i = 0; i < ROUTES.length; i++) {
    if (ROUTES[i].method === method && ROUTES[i].path === apiPath) {
      route = ROUTES[i];
      break;
    }
  }

  if (!route) {
    return {
      status:    404,
      body:      buildError('NOT_FOUND', requestId),
      requestId: requestId,
    };
  }

  // ── Authentication & Authorization (for protected endpoints) ────────────
  var isPublic = PUBLIC_PATHS.has(apiPath);
  var identity = 'anonymous';

  if (!isPublic) {
    var authHeader = (req.headers && req.headers['authorization']) || null;
    var token      = extractBearer(authHeader);

    if (!token) {
      return {
        status:    401,
        body:      buildError('UNAUTHORIZED', requestId),
        requestId: requestId,
      };
    }

    var requiredScope = scopeForEndpoint(method, apiPath);
    var authResult    = verifyToken(token, env, requiredScope);

    if (!authResult.ok) {
      // Distinguish UNAUTHORIZED (no valid token) from FORBIDDEN (wrong scope)
      var errCode = authResult.reason && authResult.reason.indexOf('scope') !== -1
        ? 'FORBIDDEN' : 'UNAUTHORIZED';
      return {
        status:    statusFor(errCode),
        body:      buildError(errCode, requestId),
        requestId: requestId,
      };
    }

    identity = authResult.serviceId || 'unknown-service';
  }

  // ── Rate limiting ────────────────────────────────────────────────────────
  var rateResult = rateLimiter.check(identity, apiPath);
  if (!rateResult.allowed) {
    var resp = buildError('RATE_LIMITED', requestId);
    resp.retryAfterMs = rateResult.retryAfterMs;
    return { status: 429, body: resp, requestId: requestId };
  }

  // ── Dispatch to route handler ────────────────────────────────────────────
  try {
    var ctx    = { requestId: requestId, identity: identity, env: env };
    var result = await route.handler(req.body, ctx);
    result.body.requestId = result.body.requestId || requestId;
    return { status: result.status, body: result.body, requestId: requestId };
  } catch (e) {
    // Never leak stack traces
    return {
      status:    500,
      body:      buildError('INTERNAL_ERROR', requestId),
      requestId: requestId,
    };
  }
}

module.exports = {
  dispatch:      dispatch,
  _ensureBridge: _ensureBridge,
  ROUTES:        ROUTES,
};
