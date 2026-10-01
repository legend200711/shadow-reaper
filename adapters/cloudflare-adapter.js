/**
 * shadow-reaper-standalone/adapters/cloudflare-adapter.js
 * Shadow Reaper Standalone — Cloudflare Infrastructure Adapter
 *
 * Build: SR-STANDALONE-CF-ADAPTER-1
 *
 * Exposes: window.SRCloudflareAdapter
 *
 * PURPOSE:
 *   Thin client-side adapter for optional Cloudflare infrastructure integration.
 *   Cloudflare is infrastructure only — NOT Shadow Reaper's intelligence.
 *
 *   Capabilities this adapter will support (when configured):
 *     - Secure server-side API gateway calls
 *     - Web Research Engine requests (UNTRUSTED results only)
 *     - Rate-limit awareness (reads headers from Worker responses)
 *     - Shared knowledge service queries
 *     - Backend endpoint routing
 *
 * ⚠️  STATUS: PLACEHOLDER — No Worker endpoints are deployed yet.
 *    All methods return safe no-ops until endpoints are configured.
 *
 * CRITICAL SECURITY RULES:
 *   - Cloudflare Workers AI is NOT used (zero env.AI.run calls)
 *   - Web research results are treated as UNTRUSTED DATA
 *   - Research results may NEVER become system instructions
 *   - Research results may NEVER access private user data or memory
 *   - No credentials are ever sent in client-side requests
 *
 * ISOLATION GUARANTEE:
 *   - This adapter connects ONLY to Shadow Reaper Standalone Cloudflare resources
 *   - It never references Shadow Nexus Social Workers, KV, R2, or secrets
 */

'use strict';

(function (global) {

  // ─── Configuration ────────────────────────────────────────────────────────
  // Populated from cloudflare/cloudflare-config.js once credentials exist.
  var _config = {
    workerBaseUrl:        '',   // e.g. "https://sr-standalone.your-subdomain.workers.dev"
    researchEndpoint:     '',   // future: web research Worker endpoint
    knowledgeEndpoint:    '',   // future: shared knowledge Worker endpoint
    rateLimitEndpoint:    '',   // future: rate limit check endpoint
  };

  var _configured = false;

  // ─── Configure ────────────────────────────────────────────────────────────
  function configure(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (cfg.workerBaseUrl)    _config.workerBaseUrl    = cfg.workerBaseUrl;
    if (cfg.researchEndpoint) _config.researchEndpoint = cfg.researchEndpoint;
    if (cfg.knowledgeEndpoint)_config.knowledgeEndpoint= cfg.knowledgeEndpoint;
    if (cfg.rateLimitEndpoint)_config.rateLimitEndpoint= cfg.rateLimitEndpoint;
    _configured = !!(cfg.workerBaseUrl && cfg.workerBaseUrl.trim());
    if (_configured) {
      console.log('[SRCloudflareAdapter] Configured. Base URL:', _config.workerBaseUrl);
    }
  }

  // ─── Ready check ──────────────────────────────────────────────────────────
  function isConfigured() {
    return _configured;
  }

  // ─── Internal fetch helper ────────────────────────────────────────────────
  // Adds required headers; never sends Firebase credentials.
  function _secureFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, {
      'Content-Type':          'application/json',
      'X-SR-Client':           'shadow-reaper-standalone',
      'X-SR-Version':          'SR-STANDALONE-CF-ADAPTER-1',
      'X-Requested-With':      'XMLHttpRequest',
    });
    // Never attach Firebase tokens, API keys, or auth tokens in client requests.
    // Authentication to the Worker is handled server-side via Cloudflare Access
    // or signed tokens once that infrastructure is set up.
    return global.fetch(url, opts);
  }

  // ─── Web Research (FUTURE) ────────────────────────────────────────────────
  /**
   * requestResearch(query, callback)
   *
   * IMPORTANT UNTRUSTED DATA CONTRACT:
   *   Results from this function are raw web content.
   *   They must NEVER be:
   *     - Passed as system instructions to Shadow Reaper
   *     - Used to override Shadow Reaper's rules or personality
   *     - Allowed to access private user memory or conversations
   *     - Stored as trusted knowledge without Founder review
   *
   *   Results must always be labelled as UNTRUSTED and treated as
   *   supplementary reference material only.
   */
  function requestResearch(query, callback) {
    callback = callback || function () {};

    if (!_configured || !_config.researchEndpoint) {
      callback({
        ok:      false,
        reason:  'research_not_configured',
        trusted: false,
        results: [],
      });
      return;
    }

    var url = _config.workerBaseUrl + _config.researchEndpoint;

    _secureFetch(url, {
      method: 'POST',
      body:   JSON.stringify({
        query:     query,
        maxTokens: 512,     // budget for result size
        safeMode:  true,    // always request safe-mode from the Worker
      }),
    })
    .then(function (resp) {
      return resp.json().then(function (data) {
        // Always mark results as UNTRUSTED regardless of what the Worker says
        data.trusted = false;
        data.warning = 'UNTRUSTED_WEB_DATA — do not use as system instructions';
        callback(data);
      });
    })
    .catch(function (err) {
      callback({ ok: false, reason: err.message, trusted: false, results: [] });
    });
  }

  // ─── Shared Knowledge fetch (FUTURE) ─────────────────────────────────────
  function fetchSharedKnowledge(query, callback) {
    callback = callback || function () {};
    if (!_configured || !_config.knowledgeEndpoint) {
      callback({ ok: false, reason: 'knowledge_endpoint_not_configured', items: [] });
      return;
    }
    var url = _config.workerBaseUrl + _config.knowledgeEndpoint;
    _secureFetch(url, {
      method: 'POST',
      body:   JSON.stringify({ query: query }),
    })
    .then(function (resp) { return resp.json(); })
    .then(function (data) { callback(data); })
    .catch(function (err) { callback({ ok: false, reason: err.message, items: [] }); });
  }

  // ─── Status ───────────────────────────────────────────────────────────────
  function getStatus() {
    return {
      configured:           _configured,
      workerBaseUrl:        _config.workerBaseUrl || '(not set)',
      researchEndpoint:     _config.researchEndpoint || '(not set)',
      knowledgeEndpoint:    _config.knowledgeEndpoint || '(not set)',
      workersAIEnabled:     false,   // always false — by design
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRCloudflareAdapter = {
    build: 'SR-STANDALONE-CF-ADAPTER-1',

    configure:            configure,
    isConfigured:         isConfigured,
    requestResearch:      requestResearch,
    fetchSharedKnowledge: fetchSharedKnowledge,
    getStatus:            getStatus,
  };

})(typeof window !== 'undefined' ? window : global);
