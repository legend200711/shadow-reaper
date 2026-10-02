/**
 * shadow-reaper-v2/sr-cloud-api.js
 * Shadow Reaper — Cloud API Client
 *
 * Build: SR-CLOUD-API-1
 *
 * Exposes: window.SRCloudAPI
 *
 * PURPOSE:
 *   Client-side adapter that connects Shadow Reaper to the Cloudflare Cloud
 *   Data API Worker. Handles:
 *     - Automatic Firebase ID token auth (uses SRAuthUI)
 *     - Memory, conversations, projects, settings, adaptive profile sync
 *     - Offline queue: operations are queued locally when offline
 *     - Retry with bounded backoff when connectivity is restored
 *     - Local-first: Shadow works fully without this adapter
 *
 * LOCAL-FIRST RULE:
 *   This adapter is OPTIONAL. Shadow Reaper's intelligence, conversation
 *   ability, and local memory work without it. Cloud sync is supplemental.
 *   If this adapter fails or the network is unavailable, Shadow still works.
 *
 * SECURITY:
 *   - The Firebase ID token is sent as: Authorization: Bearer <token>
 *   - Tokens are fetched fresh from Firebase Auth (short-lived, auto-rotated)
 *   - No service account credentials are used client-side
 *   - The Worker URL is read from config — never from localStorage
 *   - Sensitive fields are never placed in the request body
 *
 * CONFIGURATION:
 *   SRCloudAPI.configure({
 *     workerUrl: 'https://sr-cloud-api.your-subdomain.workers.dev'
 *   });
 *   — or —
 *   Set: window.SR_CLOUD_WORKER_URL = 'https://...' before loading this file
 *   — or —
 *   Use cloudflare/cloudflare-config.js which will call configure() on load
 *
 * USAGE:
 *   // Memory
 *   SRCloudAPI.memory.list(callback)
 *   SRCloudAPI.memory.create({ content: '...', category: 'general' }, callback)
 *   SRCloudAPI.memory.patch(id, { content: '...' }, callback)
 *   SRCloudAPI.memory.delete(id, callback)
 *
 *   // Conversations
 *   SRCloudAPI.conversations.list(callback)
 *   SRCloudAPI.conversations.create({ title: '...', turns: [] }, callback)
 *   SRCloudAPI.conversations.get(id, callback)
 *   SRCloudAPI.conversations.patch(id, { turns: [...] }, callback)
 *   SRCloudAPI.conversations.delete(id, callback)
 *
 *   // Projects
 *   SRCloudAPI.projects.list(callback)
 *   SRCloudAPI.projects.create({ name: '...' }, callback)
 *   SRCloudAPI.projects.get(id, callback)
 *   SRCloudAPI.projects.patch(id, { ... }, callback)
 *   SRCloudAPI.projects.delete(id, callback)
 *
 *   // Settings
 *   SRCloudAPI.settings.get(callback)
 *   SRCloudAPI.settings.put({ assistantName: '...', theme: '...' }, callback)
 *
 *   // Adaptive Profile
 *   SRCloudAPI.adaptiveProfile.get(callback)
 *   SRCloudAPI.adaptiveProfile.put({ casualness: 0.7, directness: 0.8 }, callback)
 *
 *   // Sync
 *   SRCloudAPI.sync({ type: 'memory', direction: 'push', items: [...] }, callback)
 *
 *   // Health
 *   SRCloudAPI.health(callback)
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-CLOUD-API-1';

  // ─── Configuration ──────────────────────────────────────────────────────────
  var _workerUrl    = (typeof SR_CLOUD_WORKER_URL !== 'undefined' ? SR_CLOUD_WORKER_URL : '') || '';
  var _configured   = false;
  var _online       = navigator ? navigator.onLine : true;

  // ─── Offline queue ──────────────────────────────────────────────────────────
  // Bounded queue: max 200 operations. Stored in sessionStorage (not localStorage)
  // to avoid accumulating unbounded entries across sessions.
  // Persisted to localStorage for cross-session retry (queue items only, no content).
  var QUEUE_KEY     = 'sr_cloud_queue_v1';
  var QUEUE_MAX     = 200;
  var _queue        = [];           // [ { id, method, path, body, retries, createdAt } ]
  var _retryTimer   = null;
  var _retrying     = false;

  // ─── State ──────────────────────────────────────────────────────────────────
  var _onQueueChange  = null;   // optional callback when queue changes

  // ─── Init ───────────────────────────────────────────────────────────────────

  function configure(opts) {
    if (!opts || !opts.workerUrl) return;
    _workerUrl  = opts.workerUrl.replace(/\/$/, '');
    _configured = !!_workerUrl;
    if (_configured) {
      console.log('[SRCloudAPI] Configured. Worker URL:', _workerUrl);
      _loadQueue();
      _monitorConnectivity();
    }
  }

  function isConfigured() { return _configured; }
  function isOnline()     { return _online; }

  // ─── Connectivity monitoring ────────────────────────────────────────────────

  function _monitorConnectivity() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online',  function () {
      _online = true;
      console.log('[SRCloudAPI] Network restored — processing offline queue.');
      _scheduleRetry(1000);
    });
    window.addEventListener('offline', function () {
      _online = false;
      console.log('[SRCloudAPI] Network offline — queuing operations.');
    });
  }

  // ─── Token acquisition ──────────────────────────────────────────────────────

  /**
   * Get a fresh Firebase ID token from SRAuthUI.
   * Returns a Promise<string|null>.
   */
  function _getToken() {
    return new Promise(function (resolve) {
      if (typeof global.firebase === 'undefined' || !global.firebase.auth) {
        resolve(null);
        return;
      }
      var user = global.firebase.auth().currentUser;
      if (!user) { resolve(null); return; }
      user.getIdToken(/* forceRefresh */ false)
        .then(function (token) { resolve(token); })
        .catch(function ()     { resolve(null); });
    });
  }

  // ─── HTTP helper ────────────────────────────────────────────────────────────

  /**
   * Make an authenticated request to the cloud API Worker.
   *
   * @param {string}   method
   * @param {string}   path         - e.g. '/api/v1/memory'
   * @param {object}   [body]       - Request body
   * @param {function} callback     - callback(result) where result = { ok, data?, error? }
   * @param {boolean}  [allowQueue] - If true, queue on network failure
   */
  function _request(method, path, body, callback, allowQueue) {
    callback = callback || function () {};

    if (!_configured) {
      callback({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'Cloud API not configured.' } });
      return;
    }

    if (!_online && allowQueue) {
      _enqueue(method, path, body);
      callback({ ok: false, error: { code: 'QUEUED', message: 'Operation queued for when online.' }, queued: true });
      return;
    }

    if (!_online) {
      callback({ ok: false, error: { code: 'OFFLINE', message: 'Network unavailable.' } });
      return;
    }

    _getToken().then(function (token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      var fetchOpts = {
        method:  method,
        headers: headers,
      };
      if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
        fetchOpts.body = JSON.stringify(body);
      }

      var url = _workerUrl + path;
      var timeoutId;
      var didAbort = false;
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (controller) {
        fetchOpts.signal = controller.signal;
        timeoutId = setTimeout(function () {
          didAbort = true;
          controller.abort();
        }, 12000);
      }

      fetch(url, fetchOpts)
        .then(function (resp) {
          if (timeoutId) clearTimeout(timeoutId);
          return resp.json().then(function (data) {
            callback(data);
          });
        })
        .catch(function (err) {
          if (timeoutId) clearTimeout(timeoutId);
          if (allowQueue && !didAbort) {
            _enqueue(method, path, body);
            callback({ ok: false, error: { code: 'QUEUED', message: 'Request failed, queued for retry.' }, queued: true });
          } else {
            callback({ ok: false, error: { code: 'NETWORK_ERROR', message: err.message || 'Network error.' } });
          }
        });
    });
  }

  // ─── Offline queue ──────────────────────────────────────────────────────────

  function _loadQueue() {
    try {
      var raw = localStorage.getItem(QUEUE_KEY);
      if (raw) _queue = JSON.parse(raw);
    } catch (e) {
      _queue = [];
    }
    if (!Array.isArray(_queue)) _queue = [];
  }

  function _saveQueue() {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(_queue.slice(0, QUEUE_MAX)));
    } catch (e) {}
  }

  function _enqueue(method, path, body) {
    if (_queue.length >= QUEUE_MAX) {
      console.warn('[SRCloudAPI] Offline queue full. Dropping oldest entry.');
      _queue.shift();
    }
    _queue.push({
      id:        'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      method:    method,
      path:      path,
      body:      body,
      retries:   0,
      createdAt: new Date().toISOString(),
    });
    _saveQueue();
    if (_onQueueChange) _onQueueChange(_queue.length);
    console.log('[SRCloudAPI] Queued operation: ' + method + ' ' + path + ' (' + _queue.length + ' in queue)');
  }

  function _scheduleRetry(delayMs) {
    if (_retryTimer) return;
    _retryTimer = setTimeout(function () {
      _retryTimer = null;
      _drainQueue();
    }, delayMs || 5000);
  }

  var MAX_RETRIES = 5;
  var BACKOFF = [5000, 15000, 30000, 60000, 120000];  // bounded backoff

  function _drainQueue() {
    if (_retrying || !_online || _queue.length === 0 || !_configured) return;
    _retrying = true;

    var item = _queue[0];
    if (!item) { _retrying = false; return; }

    if (item.retries >= MAX_RETRIES) {
      console.warn('[SRCloudAPI] Max retries reached for queued op. Dropping:', item.path);
      _queue.shift();
      _saveQueue();
      _retrying = false;
      if (_queue.length > 0) _scheduleRetry(1000);
      return;
    }

    _getToken().then(function (token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      var fetchOpts = { method: item.method, headers: headers };
      if (item.body && (item.method === 'POST' || item.method === 'PATCH' || item.method === 'PUT')) {
        fetchOpts.body = JSON.stringify(item.body);
      }

      fetch(_workerUrl + item.path, fetchOpts)
        .then(function (resp) { return resp.json(); })
        .then(function (data) {
          if (data.ok) {
            console.log('[SRCloudAPI] Queue drain: success for ' + item.path);
            _queue.shift();
            _saveQueue();
            _retrying = false;
            if (_queue.length > 0) _scheduleRetry(500);
          } else {
            // API rejected — don't retry indefinitely, increment retries
            item.retries++;
            _saveQueue();
            _retrying = false;
            var delay = BACKOFF[Math.min(item.retries - 1, BACKOFF.length - 1)];
            _scheduleRetry(delay);
          }
        })
        .catch(function () {
          item.retries++;
          _saveQueue();
          _retrying = false;
          var delay = BACKOFF[Math.min(item.retries - 1, BACKOFF.length - 1)];
          _scheduleRetry(delay);
        });
    });
  }

  function getQueueLength()  { return _queue.length; }
  function clearQueue()      { _queue = []; _saveQueue(); }

  function onQueueChange(fn) {
    if (typeof fn === 'function') _onQueueChange = fn;
  }

  // ─── Memory API ─────────────────────────────────────────────────────────────

  var memory = {
    list: function (cb) {
      _request('GET', '/api/v1/memory', null, cb, false);
    },
    create: function (data, cb) {
      _request('POST', '/api/v1/memory', data, cb, /* allowQueue */ true);
    },
    get: function (id, cb) {
      _request('GET', '/api/v1/memory/' + id, null, cb, false);
    },
    patch: function (id, data, cb) {
      _request('PATCH', '/api/v1/memory/' + id, data, cb, true);
    },
    delete: function (id, cb) {
      _request('DELETE', '/api/v1/memory/' + id, null, cb, true);
    },
  };

  // ─── Conversations API ──────────────────────────────────────────────────────

  var conversations = {
    list: function (cb) {
      _request('GET', '/api/v1/conversations', null, cb, false);
    },
    create: function (data, cb) {
      _request('POST', '/api/v1/conversations', data, cb, true);
    },
    get: function (id, cb) {
      _request('GET', '/api/v1/conversations/' + id, null, cb, false);
    },
    patch: function (id, data, cb) {
      _request('PATCH', '/api/v1/conversations/' + id, data, cb, true);
    },
    delete: function (id, cb) {
      _request('DELETE', '/api/v1/conversations/' + id, null, cb, true);
    },
  };

  // ─── Projects API ───────────────────────────────────────────────────────────

  var projects = {
    list: function (cb) {
      _request('GET', '/api/v1/projects', null, cb, false);
    },
    create: function (data, cb) {
      _request('POST', '/api/v1/projects', data, cb, true);
    },
    get: function (id, cb) {
      _request('GET', '/api/v1/projects/' + id, null, cb, false);
    },
    patch: function (id, data, cb) {
      _request('PATCH', '/api/v1/projects/' + id, data, cb, true);
    },
    delete: function (id, cb) {
      _request('DELETE', '/api/v1/projects/' + id, null, cb, true);
    },
  };

  // ─── Settings API ───────────────────────────────────────────────────────────

  var settings = {
    get: function (cb) {
      _request('GET', '/api/v1/settings', null, cb, false);
    },
    put: function (data, cb) {
      _request('PUT', '/api/v1/settings', data, cb, true);
    },
  };

  // ─── Adaptive Profile API ───────────────────────────────────────────────────

  var adaptiveProfile = {
    get: function (cb) {
      _request('GET', '/api/v1/adaptive-profile', null, cb, false);
    },
    put: function (data, cb) {
      _request('PUT', '/api/v1/adaptive-profile', data, cb, true);
    },
  };

  // ─── Sync API ───────────────────────────────────────────────────────────────

  function sync(opts, cb) {
    _request('POST', '/api/v1/sync', opts, cb, false);
  }

  // ─── Health check ────────────────────────────────────────────────────────────

  function health(cb) {
    _request('GET', '/api/v1/health', null, cb, false);
  }

  // ─── Status ─────────────────────────────────────────────────────────────────

  function getStatus() {
    return {
      configured:  _configured,
      online:      _online,
      queueLength: _queue.length,
      workerUrl:   _configured ? _workerUrl.replace(/^https?:\/\//, '').split('/')[0] : '(not set)',
    };
  }

  // ─── Expose ─────────────────────────────────────────────────────────────────

  global.SRCloudAPI = {
    build:          BUILD_ID,

    // Configuration
    configure:      configure,
    isConfigured:   isConfigured,
    isOnline:       isOnline,
    getStatus:      getStatus,

    // Data APIs
    memory:         memory,
    conversations:  conversations,
    projects:       projects,
    settings:       settings,
    adaptiveProfile:adaptiveProfile,
    sync:           sync,
    health:         health,

    // Offline queue management
    getQueueLength: getQueueLength,
    clearQueue:     clearQueue,
    onQueueChange:  onQueueChange,

    // Manual retry trigger (e.g. after app regains focus)
    retryQueue:     function () { _scheduleRetry(0); },

    // Internal — not for general use
    _drainQueue:    _drainQueue,
  };

})(typeof window !== 'undefined' ? window : global);
