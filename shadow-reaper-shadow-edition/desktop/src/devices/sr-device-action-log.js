/**
 * shadow-reaper-v2/devices/sr-device-action-log.js
 * Shadow Reaper V2 — Device Action Log
 *
 * Build: SR-V2-DEVICES-2
 *
 * Exposes: window.SRDeviceActionLog
 *
 * PURPOSE:
 *   Privacy-conscious action history for device commands executed through
 *   Shadow Reaper.  Stored in localStorage under a namespaced key.
 *
 * LOGGED:
 *   - timestamp (ISO)
 *   - device friendly name (NOT the internal ID)
 *   - action name
 *   - result code
 *   - command ID for idempotency tracking
 *
 * NEVER LOGGED:
 *   - plaintext passwords
 *   - authentication tokens
 *   - raw credential strings
 *   - file contents
 *
 * IDEMPOTENCY:
 *   Each action is tagged with a commandId on entry.
 *   isRecentDuplicate(commandId) returns true if the same commandId
 *   was executed within the last DUPLICATE_WINDOW_MS.
 *   Callers use this to prevent accidental double-execution.
 *
 * MAXIMUM SIZE:
 *   MAX_ENTRIES entries are kept (FIFO).  Oldest is evicted when full.
 */

'use strict';

(function (global) {

  var BUILD_ID     = 'SR-V2-DEVICES-2';
  var STORAGE_KEY  = 'srDeviceActionLog';
  var MAX_ENTRIES  = 200;
  var DUPLICATE_WINDOW_MS = 5000;  // 5 seconds replay-protection window

  // ── In-memory log ─────────────────────────────────────────────────────────
  var _log = [];   // Array of log entry objects

  // ── Persistence ───────────────────────────────────────────────────────────

  function _load() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          _log = parsed;
        }
      }
    } catch (_) {
      _log = [];
    }
  }

  function _save() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(_log));
      }
    } catch (_) {}
  }

  // ── Command ID generator ──────────────────────────────────────────────────

  function generateCommandId() {
    return 'cmd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ── Sanitize params — remove any credential-like keys ─────────────────────

  var _SENSITIVE_KEYS = ['password', 'token', 'secret', 'apikey', 'api_key', 'auth', 'credential'];

  function _sanitizeParams(params) {
    if (!params || typeof params !== 'object') return {};
    var safe = {};
    Object.keys(params).forEach(function (k) {
      var lk = k.toLowerCase();
      var isSensitive = _SENSITIVE_KEYS.some(function (s) { return lk.indexOf(s) !== -1; });
      if (!isSensitive) {
        safe[k] = params[k];
      }
      // Sensitive keys are silently dropped
    });
    return safe;
  }

  // ── Log an action ─────────────────────────────────────────────────────────

  /**
   * record(entry)
   *
   * entry = {
   *   commandId:    string  (required) — unique ID for idempotency
   *   deviceName:   string  (required) — friendly name only
   *   action:       string  (required) — action identifier
   *   result:       string  (required) — result code (SUCCESS, FAILED, etc.)
   *   params:       object  (optional) — sanitized parameters
   * }
   */
  function record(entry) {
    if (!entry || !entry.commandId || !entry.deviceName || !entry.action || !entry.result) {
      return;
    }

    var logEntry = {
      commandId:  entry.commandId,
      timestamp:  new Date().toISOString(),
      deviceName: String(entry.deviceName),
      action:     String(entry.action),
      result:     String(entry.result),
      params:     _sanitizeParams(entry.params || {}),
    };

    _log.push(logEntry);

    // Enforce max size (FIFO)
    if (_log.length > MAX_ENTRIES) {
      _log = _log.slice(-MAX_ENTRIES);
    }

    _save();
  }

  // ── Idempotency / replay protection ───────────────────────────────────────

  /**
   * isRecentDuplicate(commandId)
   * Returns true if commandId appears in the log within the last DUPLICATE_WINDOW_MS.
   * Callers should check this before executing to prevent double-execution.
   */
  function isRecentDuplicate(commandId) {
    if (!commandId) return false;
    var cutoff = Date.now() - DUPLICATE_WINDOW_MS;
    for (var i = _log.length - 1; i >= 0; i--) {
      var entry = _log[i];
      if (entry.commandId === commandId) {
        var entryTime = new Date(entry.timestamp).getTime();
        if (entryTime >= cutoff) return true;
      }
    }
    return false;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /**
   * getAll()
   * Returns a copy of the full log (newest last).
   */
  function getAll() {
    return _log.slice();
  }

  /**
   * getRecent(n)
   * Returns the most recent n entries.
   */
  function getRecent(n) {
    n = Math.max(1, Math.min(n || 20, MAX_ENTRIES));
    return _log.slice(-n);
  }

  /**
   * getByDevice(deviceName)
   * Returns all entries for a specific device friendly name.
   */
  function getByDevice(deviceName) {
    var lower = (deviceName || '').toLowerCase();
    return _log.filter(function (e) {
      return e.deviceName.toLowerCase() === lower;
    });
  }

  // ── Clear ─────────────────────────────────────────────────────────────────

  /**
   * clear()
   * Removes all local action history.
   * Does NOT affect device registry or pairing data.
   */
  function clear() {
    _log = [];
    try {
      if (global.localStorage) {
        global.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (_) {}
  }

  // ── Statistics ────────────────────────────────────────────────────────────

  function getStats() {
    var total   = _log.length;
    var success = _log.filter(function (e) { return e.result === 'SUCCESS'; }).length;
    var failed  = _log.filter(function (e) { return e.result === 'FAILED'; }).length;
    var offline = _log.filter(function (e) { return e.result === 'OFFLINE'; }).length;
    return { total: total, success: success, failed: failed, offline: offline };
  }

  // ── Initialize ────────────────────────────────────────────────────────────

  function init() {
    _load();
  }

  // ── Expose ────────────────────────────────────────────────────────────────

  global.SRDeviceActionLog = {
    build:              BUILD_ID,
    MAX_ENTRIES:        MAX_ENTRIES,
    DUPLICATE_WINDOW_MS: DUPLICATE_WINDOW_MS,

    init:               init,
    generateCommandId:  generateCommandId,
    record:             record,
    isRecentDuplicate:  isRecentDuplicate,
    getAll:             getAll,
    getRecent:          getRecent,
    getByDevice:        getByDevice,
    clear:              clear,
    getStats:           getStats,
  };

})(typeof window !== 'undefined' ? window : global);
