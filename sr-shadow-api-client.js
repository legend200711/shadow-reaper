/**
 * shadow-reaper-v2/sr-shadow-api-client.js
 * Shadow Reaper — API-First Client
 *
 * Build: SR-API-CLIENT-1
 *
 * Exposes: window.SRShadowAPIClient
 *
 * PURPOSE:
 *   The PRIMARY interface between Shadow clients and Shadow's backend intelligence.
 *   This module replaces the browser independently coordinating multiple backend
 *   systems. Instead: ALL conversation flows through MY Shadow API.
 *
 *   Architecture:
 *     PWA / Phone / Website
 *       ↓
 *     SRShadowAPIClient (this file)
 *       ↓
 *     POST /api/v1/chat (Cloudflare Worker — MY Shadow API)
 *       ↓
 *     ShadowReaper backend:
 *       memory → history → projects → personality → inference
 *       ↓
 *     ONE SHADOW RESPONSE
 *
 * IDENTITY:
 *   - No login. No registration. No Firebase UI.
 *   - On first call: automatically establishes a device identity via
 *     POST /api/v1/identity (invisible to user)
 *   - Stores device token in sessionStorage + localStorage
 *   - Subsequent calls reuse the same identity
 *   - Identity is opaque — the user never sees a UID or token
 *
 * LANGUAGE FOUNDATION INTEGRATION:
 *   - Client-side Language Foundation (SRLanguage) still runs locally
 *   - Enriched linguistic analysis is sent with each chat request
 *   - The 112k+ vocabulary stays on the client — not sent with every request
 *   - The server uses the analysis hints to improve context assembly
 *
 * OFFLINE BEHAVIOR:
 *   - When offline: ShadowReaper falls back to local deterministic responses
 *   - When online but API unavailable: same fallback
 *   - The API is the primary path; local is the reliable fallback
 *
 * BACKWARD COMPATIBILITY:
 *   - ShadowReaper.ask() still works through the existing local pipeline
 *   - This client AUGMENTS the ask() flow by routing through the hosted API
 *   - The UI calls SRShadowAPIClient.ask() which routes to hosted API
 *   - If hosted fails, falls back to ShadowReaper.ask() local pipeline
 *
 * SECURITY:
 *   - Device token stored in sessionStorage (not accessible to other origins)
 *   - Device token persisted to localStorage for continuity (opaque hex)
 *   - No Firebase credentials exposed to user
 *   - No system prompts sent by client — assembled server-side only
 *   - No memory dump sent — server retrieves its own memory
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-API-CLIENT-1';

  // ── State ──────────────────────────────────────────────────────────────────
  var _deviceToken      = null;   // 64-char hex device token
  var _uid              = null;   // derived uid (for display purposes only)
  var _identityReady    = false;
  var _identityPending  = false;
  var _identityCallbacks = [];
  var _currentConvId    = null;   // current conversation ID (from server)
  var _configured       = false;
  var _workerUrl        = '';
  var _onlineListeners  = [];

  // Storage keys
  var DEVICE_TOKEN_KEY  = 'sr_device_token_v1';
  var CONV_ID_KEY       = 'sr_conv_id_v1';

  // ── Configuration ──────────────────────────────────────────────────────────

  function configure(opts) {
    opts = opts || {};
    if (opts.workerUrl) {
      _workerUrl = String(opts.workerUrl).replace(/\/$/, '');
    } else if (global.SRConfig && typeof global.SRConfig.getWorkerUrl === 'function') {
      _workerUrl = global.SRConfig.getWorkerUrl() || '';
    } else if (typeof global.SR_CLOUD_WORKER_URL !== 'undefined' && global.SR_CLOUD_WORKER_URL) {
      _workerUrl = global.SR_CLOUD_WORKER_URL;
    }
    _configured = !!_workerUrl;
    if (_configured) {
      // Load persisted token
      _loadPersistedIdentity();
    }
    return _configured;
  }

  function isConfigured() { return _configured; }
  function getWorkerUrl()  { return _workerUrl; }

  // ── Identity persistence ───────────────────────────────────────────────────

  function _loadPersistedIdentity() {
    try {
      // Check sessionStorage first (current session)
      var sess = global.sessionStorage && global.sessionStorage.getItem(DEVICE_TOKEN_KEY);
      if (sess && sess.length === 64) {
        _deviceToken = sess;
        _uid = _deriveLocalUid(sess);
        // Also restore conversation ID from session
        var convSess = global.sessionStorage && global.sessionStorage.getItem(CONV_ID_KEY);
        if (convSess) _currentConvId = convSess;
        _identityReady = true;
        return;
      }
      // Fall back to localStorage (cross-session persistence)
      var stored = global.localStorage && global.localStorage.getItem(DEVICE_TOKEN_KEY);
      if (stored && stored.length === 64) {
        _deviceToken = stored;
        _uid = _deriveLocalUid(stored);
        // Store in session too for this session
        if (global.sessionStorage) global.sessionStorage.setItem(DEVICE_TOKEN_KEY, stored);
        // Restore conversation ID (new session = new conversation)
        _currentConvId = null;
        _identityReady = true;
      }
    } catch (_) {}
  }

  function _saveIdentity(token, uid) {
    _deviceToken = token;
    _uid = uid;
    _identityReady = true;
    try {
      if (global.sessionStorage) global.sessionStorage.setItem(DEVICE_TOKEN_KEY, token);
      if (global.localStorage) global.localStorage.setItem(DEVICE_TOKEN_KEY, token);
    } catch (_) {}
  }

  function _saveConvId(convId) {
    _currentConvId = convId;
    try {
      if (global.sessionStorage) global.sessionStorage.setItem(CONV_ID_KEY, convId || '');
    } catch (_) {}
  }

  function _deriveLocalUid(token) {
    // Local approximation of the server-side uid derivation
    // Only used for display — the real uid is on the server
    return 'sr_local_' + token.slice(0, 8);
  }

  // ── Identity initialization (automatic, invisible) ─────────────────────────

  /**
   * Ensure a device identity is ready.
   * Calls callback(error, identity) where identity = { token, uid }
   */
  function _ensureIdentity(callback) {
    if (_identityReady && _deviceToken) {
      callback(null, { token: _deviceToken, uid: _uid });
      return;
    }

    if (_identityPending) {
      _identityCallbacks.push(callback);
      return;
    }

    _identityPending = true;
    _identityCallbacks.push(callback);

    var url = _workerUrl + '/api/v1/identity';
    var body = _deviceToken ? JSON.stringify({ deviceId: _deviceToken }) : '{}';

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 5000) : null;
    var fetchOpts = {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    body,
    };
    if (controller) fetchOpts.signal = controller.signal;

    var _fetchFn = global.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!_fetchFn) {
      _resolveIdentityCallbacks(new Error('fetch not available'), null);
      return;
    }

    _fetchFn(url, fetchOpts)
      .then(function (resp) {
        if (timer) clearTimeout(timer);
        if (!resp.ok) throw new Error('Identity endpoint returned ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        if (data && data.ok && data.data && data.data.sessionToken) {
          _saveIdentity(data.data.sessionToken, data.data.uid || _deriveLocalUid(data.data.sessionToken));
          _resolveIdentityCallbacks(null, { token: _deviceToken, uid: _uid });
        } else {
          throw new Error('Invalid identity response');
        }
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        // Graceful degradation: create a temporary session-only identity
        // Shadow works offline — conversation just won't persist
        console.warn('[SRShadowAPIClient] Identity initialization failed:', err && err.message);
        _resolveIdentityCallbacks(null, null);  // null = session-only mode
      });
  }

  function _resolveIdentityCallbacks(err, identity) {
    _identityPending = false;
    var callbacks = _identityCallbacks.slice();
    _identityCallbacks = [];
    callbacks.forEach(function (cb) {
      try { cb(err, identity); } catch (_) {}
    });
  }

  // ── Language Foundation enrichment ─────────────────────────────────────────

  /**
   * Extract Language Foundation analysis hints from the current message.
   * These are LINGUISTIC ANNOTATIONS only — not system prompts.
   * The server uses them to improve context assembly.
   *
   * Returns null if Language Foundation is not loaded.
   */
  function _getLanguageAnalysis(message) {
    var langFdn = global.SRLanguage;
    if (!langFdn || typeof langFdn.analyze !== 'function') return null;

    try {
      var contextSnapshot = (global.SRContext && typeof global.SRContext.getSnapshot === 'function')
        ? global.SRContext.getSnapshot() : {};
      var analysis = langFdn.analyze(message, contextSnapshot);
      if (!analysis) return null;

      // Extract only safe, non-sensitive hints
      return {
        intent:      analysis.intent || null,
        negated:     !!(analysis.negation && analysis.negation.negated),
        resolvedRef: (analysis.referenceResolution && analysis.referenceResolution.resolved)
          ? (analysis.referenceResolution.subject || null)
          : null,
        questionType: (analysis.comprehension && analysis.comprehension.questionType) || null,
        // Concepts: just the first 5 lemma strings (no private data)
        concepts: analysis.concepts
          ? analysis.concepts.slice(0, 5).map(function (c) {
              return typeof c === 'string' ? c : (c.lemma || c.word || null);
            }).filter(Boolean)
          : [],
      };
    } catch (_) {
      return null;
    }
  }

  // ── Primary chat method ────────────────────────────────────────────────────

  /**
   * Send a message to Shadow's hosted API and get a response.
   *
   * This is the API-FIRST conversation path:
   *   message → MY Shadow API → ShadowReaper backend → response
   *
   * @param {string}   message        - User message
   * @param {object}   [opts]         - Options
   * @param {function} callback       - fn(error, result)
   *   result: {
   *     text:            string — Shadow's response
   *     conversationId:  string — server-side conversation ID
   *     runtime:         'hosted'
   *     provider:        string
   *     model:           string
   *     memoryAvailable: boolean
   *     latencyMs:       number
   *   }
   */
  function ask(message, opts, callback) {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    opts = opts || {};
    callback = callback || function () {};

    if (!_configured) {
      callback(new Error('SRShadowAPIClient not configured'), null);
      return;
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      callback(new Error('Message is required'), null);
      return;
    }

    var trimmed = message.trim();

    _ensureIdentity(function (identityErr, identity) {
      // Even if identity failed, we still try the chat request
      // (server allows authOptional — falls back to session-only mode)
      _sendChat(trimmed, identity, opts, callback);
    });
  }

  function _sendChat(message, identity, opts, callback) {
    var url      = _workerUrl + '/api/v1/chat';
    var langHints = _getLanguageAnalysis(message);

    var requestBody = {
      message:          message,
      conversationId:   _currentConvId || null,
      client:           { type: 'pwa', build: BUILD_ID },
    };

    // Include language analysis hints if available
    if (langHints) {
      requestBody.languageAnalysis = langHints;
    }

    var headers = { 'Content-Type': 'application/json' };

    // Attach auth token if available
    if (identity && identity.token) {
      headers['Authorization'] = 'Bearer ' + identity.token;
    } else {
      // Fall back to Firebase ID token if SRAuthUI is available
      var authUI = global.SRAuthUI;
      if (authUI && typeof authUI.getIdToken === 'function') {
        try {
          var firebaseToken = authUI.getIdToken();
          if (firebaseToken) headers['Authorization'] = 'Bearer ' + firebaseToken;
        } catch (_) {}
      } else if (authUI && authUI.getCurrentUser && authUI.getCurrentUser()) {
        // Try to get Firebase token the standard way
        var fbUser = authUI.getCurrentUser();
        if (fbUser && typeof fbUser.getIdToken === 'function') {
          // Async path — do the request after token is ready
          fbUser.getIdToken(false)
            .then(function (tok) {
              if (tok) headers['Authorization'] = 'Bearer ' + tok;
              _doFetch(url, headers, requestBody, callback);
            })
            .catch(function () {
              _doFetch(url, headers, requestBody, callback);
            });
          return;
        }
      }
    }

    _doFetch(url, headers, requestBody, callback);
  }

  function _doFetch(url, headers, requestBody, callback) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 20000) : null;

    var fetchOpts = {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify(requestBody),
    };
    if (controller) fetchOpts.signal = controller.signal;

    var _fetchFn = global.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!_fetchFn) {
      callback(new Error('fetch not available'), null);
      return;
    }

    _fetchFn(url, fetchOpts)
      .then(function (resp) {
        if (timer) clearTimeout(timer);
        if (!resp.ok && resp.status !== 503) {
          return resp.json().then(function (errData) {
            var msg = (errData && errData.error && errData.error.message) || 'API error ' + resp.status;
            throw new Error(msg);
          }).catch(function () {
            throw new Error('API returned HTTP ' + resp.status);
          });
        }
        return resp.json();
      })
      .then(function (data) {
        if (!data) throw new Error('Empty API response');

        if (!data.success) {
          // API returned error JSON — propagate as error for caller to handle
          var apiErr = new Error((data.message || data.error) || 'Shadow API unavailable');
          apiErr.notConfigured = !!data.notConfigured;
          throw apiErr;
        }

        // Update conversation tracking
        if (data.conversationId) {
          _saveConvId(data.conversationId);
        }

        callback(null, {
          text:            data.text,
          conversationId:  data.conversationId || _currentConvId,
          runtime:         data.runtime || 'hosted',
          provider:        data.provider || 'cloudflare',
          model:           data.model || 'unknown',
          memoryAvailable: !!data.memoryAvailable,
          latencyMs:       data.latencyMs || 0,
          requestId:       data.requestId || null,
        });
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        callback(err, null);
      });
  }

  // ── Conversation management ────────────────────────────────────────────────

  /** Start a new conversation (clears current conversationId) */
  function newConversation() {
    _currentConvId = null;
    try {
      if (global.sessionStorage) global.sessionStorage.removeItem(CONV_ID_KEY);
    } catch (_) {}
  }

  /** Get current conversation ID */
  function getConversationId() { return _currentConvId; }

  // ── Status ─────────────────────────────────────────────────────────────────

  function getStatus() {
    return {
      build:         BUILD_ID,
      configured:    _configured,
      workerUrl:     _workerUrl,
      identityReady: _identityReady,
      hasToken:      !!_deviceToken,
      conversationId: _currentConvId,
    };
  }

  function isIdentityReady() { return _identityReady; }
  function isOnline()        { return !!(global.navigator ? global.navigator.onLine : true); }

  // ── Expose ─────────────────────────────────────────────────────────────────

  global.SRShadowAPIClient = {
    build:           BUILD_ID,
    configure:       configure,
    isConfigured:    isConfigured,
    getWorkerUrl:    getWorkerUrl,
    ask:             ask,
    newConversation: newConversation,
    getConversationId: getConversationId,
    isIdentityReady: isIdentityReady,
    isOnline:        isOnline,
    getStatus:       getStatus,
  };

  // ── Auto-configure if SRConfig is available ────────────────────────────────
  // Runs after this script loads; SRConfig must be loaded first.
  (function _autoConfigure() {
    configure();
    if (_configured && !_identityReady) {
      // Pre-warm identity in background (non-blocking)
      // This ensures the first chat message is fast
      _ensureIdentity(function () {
        console.log('[SRShadowAPIClient] Identity ready. Worker:', _workerUrl);
      });
    }
  })();

})(typeof window !== 'undefined' ? window : global);
