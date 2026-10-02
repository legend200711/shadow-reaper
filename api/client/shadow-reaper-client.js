/**
 * shadow-reaper-v2/api/client/shadow-reaper-client.js
 * Shadow Reaper API v1 — Reference Client Adapter
 *
 * Build: SR-API-V1-1
 *
 * PURPOSE:
 *   A reusable reference client that proves the API contract works.
 *   This is NOT the 24-Hour Engine integration.
 *   This is NOT deployed anywhere.
 *   This is a generic adapter that any authorized application can use.
 *
 * USAGE (Node.js):
 *   const ShadowReaperClient = require('./api/client/shadow-reaper-client');
 *   const client = new ShadowReaperClient({
 *     baseUrl: 'https://your-worker.workers.dev',
 *     token:   'your-service-token',
 *   });
 *   const health = await client.health();
 *
 * USAGE (local dev):
 *   const client = new ShadowReaperClient({
 *     baseUrl: 'http://localhost:4200',
 *     token:   'sr-test-full-token-v1',
 *   });
 *
 * SECURITY:
 *   - Token must be kept secret by the calling application.
 *   - Never hardcode tokens in source files.
 *   - Use environment variables or secrets managers.
 *   - Token is sent as Authorization: Bearer <token> — HTTPS only in production.
 */

'use strict';

var http  = require('http');
var https = require('https');
var url   = require('url');

var API_VERSION = 'v1';
var TIMEOUT_MS  = 10000;

/**
 * ShadowReaperClient
 *
 * @param {object} opts
 * @param {string} opts.baseUrl  - Base URL of the Shadow Reaper API (no trailing slash)
 * @param {string} opts.token    - Service bearer token
 * @param {number} [opts.timeout] - Request timeout in ms (default: 10000)
 */
function ShadowReaperClient(opts) {
  if (!opts || !opts.baseUrl) throw new Error('ShadowReaperClient: baseUrl is required.');
  if (!opts.token)            throw new Error('ShadowReaperClient: token is required.');

  this._baseUrl = opts.baseUrl.replace(/\/$/, '');
  this._token   = opts.token;
  this._timeout = opts.timeout || TIMEOUT_MS;
  this._version = API_VERSION;
}

/**
 * Build the full API URL for a path.
 */
ShadowReaperClient.prototype._url = function (path) {
  return this._baseUrl + '/api/' + this._version + path;
};

/**
 * Make an HTTP request to the Shadow Reaper API.
 *
 * @param {string} method    - GET or POST
 * @param {string} path      - e.g. '/health'
 * @param {object} [body]    - Request body (POST only)
 * @returns {Promise<{ status: number, body: object }>}
 */
ShadowReaperClient.prototype._request = function (method, path, body) {
  var self     = this;
  var fullUrl  = this._url(path);
  var parsed   = url.parse(fullUrl);
  var useHttps = parsed.protocol === 'https:';
  var transport = useHttps ? https : http;

  var bodyStr = body ? JSON.stringify(body) : null;

  var options = {
    hostname: parsed.hostname,
    port:     parsed.port || (useHttps ? 443 : 80),
    path:     parsed.path,
    method:   method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + self._token,
    },
    timeout: self._timeout,
  };
  if (bodyStr) {
    options.headers['Content-Length'] = Buffer.byteLength(bodyStr, 'utf8');
  }

  return new Promise(function (resolve, reject) {
    var req = transport.request(options, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString('utf8');
        var parsed2;
        try {
          parsed2 = JSON.parse(raw);
        } catch (_) {
          parsed2 = { raw: raw };
        }
        resolve({ status: res.statusCode, body: parsed2 });
      });
    });

    req.on('timeout', function () {
      req.destroy();
      reject(new Error('Request timed out: ' + fullUrl));
    });

    req.on('error', function (e) {
      reject(new Error('Request failed: ' + e.message));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
};

// ── Public Methods ────────────────────────────────────────────────────────────

/**
 * GET /api/v1/health
 * @returns {Promise<object>}
 */
ShadowReaperClient.prototype.health = function () {
  return this._request('GET', '/health');
};

/**
 * GET /api/v1/capabilities
 * @returns {Promise<object>}
 */
ShadowReaperClient.prototype.capabilities = function () {
  return this._request('GET', '/capabilities');
};

/**
 * POST /api/v1/chat
 * @param {string} message
 * @returns {Promise<object>}
 */
ShadowReaperClient.prototype.chat = function (message) {
  if (!message || typeof message !== 'string') {
    return Promise.reject(new Error('chat(): message must be a non-empty string.'));
  }
  return this._request('POST', '/chat', { message: message });
};

/**
 * POST /api/v1/understand
 * @param {string} message
 * @returns {Promise<object>}
 */
ShadowReaperClient.prototype.understand = function (message) {
  if (!message || typeof message !== 'string') {
    return Promise.reject(new Error('understand(): message must be a non-empty string.'));
  }
  return this._request('POST', '/understand', { message: message });
};

/**
 * POST /api/v1/knowledge/query
 * @param {string} query
 * @returns {Promise<object>}
 */
ShadowReaperClient.prototype.queryKnowledge = function (query) {
  if (!query || typeof query !== 'string') {
    return Promise.reject(new Error('queryKnowledge(): query must be a non-empty string.'));
  }
  return this._request('POST', '/knowledge/query', { query: query });
};

/**
 * POST /api/v1/engine/command
 * Interprets a natural language command. DOES NOT execute anything.
 * @param {string} message
 * @returns {Promise<object>}
 */
ShadowReaperClient.prototype.interpretEngineCommand = function (message) {
  if (!message || typeof message !== 'string') {
    return Promise.reject(new Error('interpretEngineCommand(): message must be a non-empty string.'));
  }
  return this._request('POST', '/engine/command', { message: message });
};

/**
 * POST /api/v1/engine/context
 * Sends bounded engine state to Shadow Reaper.
 * @param {object} contextPayload
 * @returns {Promise<object>}
 */
ShadowReaperClient.prototype.sendEngineContext = function (contextPayload) {
  if (!contextPayload || typeof contextPayload !== 'object') {
    return Promise.reject(new Error('sendEngineContext(): contextPayload must be an object.'));
  }
  return this._request('POST', '/engine/context', contextPayload);
};

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = ShadowReaperClient;
