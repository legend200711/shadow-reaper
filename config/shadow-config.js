/**
 * shadow-reaper-v2/config/shadow-config.js
 * Shadow Reaper — Central Configuration
 *
 * Build: SR-CONFIG-1
 *
 * Exposes: window.SRConfig
 *
 * PURPOSE:
 *   Single canonical source of truth for all endpoint URLs, environment
 *   flags, and configuration values.
 *
 *   This is the ONE place to change when:
 *   - Deploying a new Cloudflare Worker URL
 *   - Adding a new API endpoint
 *   - Switching between development and production
 *
 * SECURITY:
 *   No secrets here. Worker URLs are public infrastructure, not credentials.
 *   All authentication is handled via Firebase ID tokens by SRCloudAPI.
 *
 * ARCHITECTURE RULE:
 *   Production Shadow Reaper must operate without any dependency on localhost,
 *   the developer's ThinkPad, or any developer machine.
 *
 *   Development may use localhost:3000 for convenience.
 *   Production uses the deployed Cloudflare Worker URL.
 *
 * ENVIRONMENT DETECTION:
 *   - localhost / 127.0.0.1 / 192.168.x.x / 10.x.x.x / file: → DEVELOPMENT
 *   - Everything else → PRODUCTION
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-CONFIG-1';

  // ─── Environment detection ────────────────────────────────────────────────
  // This check determines whether we are running in a developer environment
  // or in the real 24/7 production deployment.
  // Production Shadow runs on phones and browsers pointing at GitHub Pages
  // or any non-local domain — never on the developer's ThinkPad.

  var _isLocal = (function () {
    try {
      var h = (global.window && global.window.location && global.window.location.hostname) || '';
      var proto = (global.window && global.window.location && global.window.location.protocol) || '';
      return (
        h === 'localhost'     ||
        h === '127.0.0.1'    ||
        h === ''             ||
        /^192\.168\./.test(h) ||
        /^10\./.test(h)      ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
        proto === 'file:'
      );
    } catch (_) { return false; }
  })();

  // ─── Production endpoints ─────────────────────────────────────────────────
  // Change these values when infrastructure changes.
  // These are the ONLY places where endpoint URLs should be defined.

  var PRODUCTION_WORKER_URL = 'https://sr-cloud-api.nthntjrn.workers.dev';

  // Development endpoint (local wrangler dev)
  // Only used when _isLocal is true.
  var DEVELOPMENT_WORKER_URL = 'http://localhost:8787';

  // ─── Resolved configuration ───────────────────────────────────────────────

  var _workerUrl = _isLocal ? DEVELOPMENT_WORKER_URL : PRODUCTION_WORKER_URL;

  // Allow override via global (for testing and special deployments)
  // This is read-once at load time.
  if (typeof global.SR_CLOUD_WORKER_URL !== 'undefined' && global.SR_CLOUD_WORKER_URL) {
    _workerUrl = global.SR_CLOUD_WORKER_URL;
  }

  var _config = {
    // Environment
    env:            _isLocal ? 'development' : 'production',
    isLocal:        _isLocal,

    // Cloudflare Worker — the Shadow API backend
    // All /api/v1/* routes go through here.
    workerUrl:      _workerUrl,

    // API endpoint paths (never hardcoded elsewhere in the codebase)
    endpoints: {
      health:            '/api/v1/health',
      inference:         '/api/v1/inference',
      weather:           '/api/v1/weather',
      electronics:       '/api/v1/research/electronics',
      memory:            '/api/v1/memory',
      conversations:     '/api/v1/conversations',
      projects:          '/api/v1/projects',
      settings:          '/api/v1/settings',
      adaptiveProfile:   '/api/v1/adaptive-profile',
      sync:              '/api/v1/sync',
    },

    // Inference configuration
    inference: {
      // Timeout for hosted inference requests (ms)
      timeoutMs:       15000,
      // Max tokens for hosted generation
      maxTokens:       256,
      // Default temperature
      temperature:     0.7,
      // Max retries on transient error
      maxRetries:      1,
    },

    // Offline / PWA configuration
    offline: {
      // Shadow works fully offline — inference falls back to emergency templates.
      // This flag gates features that explicitly require network.
      requiredForInference: false,
    },
  };

  // ─── Public API ───────────────────────────────────────────────────────────

  function get()               { return Object.assign({}, _config); }
  function getWorkerUrl()      { return _workerUrl; }
  function getEndpoint(name)   { return _config.endpoints[name] || null; }
  function isLocal()           { return _isLocal; }
  function isProd()            { return !_isLocal; }

  // Called by SRCloudAPI or by index.html to override the worker URL.
  // Safe to call multiple times — last call wins.
  function setWorkerUrl(url) {
    if (url && typeof url === 'string') {
      _workerUrl         = url.replace(/\/$/, '');
      _config.workerUrl  = _workerUrl;
    }
  }

  if (_isLocal) {
    console.log('[SRConfig] Environment: DEVELOPMENT. Worker URL:', _workerUrl);
    console.log('[SRConfig] Production URL (unused in dev):', PRODUCTION_WORKER_URL);
  }

  global.SRConfig = {
    build:          BUILD_ID,
    get:            get,
    getWorkerUrl:   getWorkerUrl,
    getEndpoint:    getEndpoint,
    isLocal:        isLocal,
    isProd:         isProd,
    setWorkerUrl:   setWorkerUrl,
  };

})(typeof window !== 'undefined' ? window : global);
