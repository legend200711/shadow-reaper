/**
 * shadow-reaper-v2/sr-connection-monitor.js
 * Shadow Reaper V2 — Connection State Monitor
 *
 * Build: SR-V2-CONN-1
 *
 * Exposes: window.SRConnectionMonitor
 *
 * PURPOSE:
 *   Detects when the device/browser goes online or offline.
 *   Notifies SRVoiceAssistant so voice can stop cleanly when offline and
 *   resume when the connection returns.
 *   Provides a connection status the UI can display.
 *
 * STATES:
 *   ONLINE    — network is available
 *   OFFLINE   — network is unavailable
 *   UNKNOWN   — initial state before first check
 *
 * DESIGN RULES:
 *   - Does NOT disable the entire Shadow Reaper brain.  Typed conversation,
 *     memory, and local deterministic responses keep working offline.
 *   - Does NOT automatically resend failed requests when connectivity returns
 *     (to avoid duplicate responses).
 *   - Does NOT assume navigator.onLine alone proves internet access; it is
 *     used only as a starting signal.  The browser's online/offline events
 *     are the primary mechanism.
 *   - The OFFLINE message is shown at most once per transition (no spam).
 *   - Connection restoration is announced to the UI and to SRVoiceAssistant.
 *
 * ZERO POLLING. ZERO setInterval. Event-driven only.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-CONN-1';

  // ── Connection states ────────────────────────────────────────────────────
  var CONN_STATE = {
    ONLINE:  'ONLINE',
    OFFLINE: 'OFFLINE',
    UNKNOWN: 'UNKNOWN',
  };

  // ── Internal state ───────────────────────────────────────────────────────
  var _state     = CONN_STATE.UNKNOWN;
  var _listeners = [];          // fn(newState, prevState)

  // ─── State transition ────────────────────────────────────────────────────
  function _setState(newState) {
    if (_state === newState) return;
    var prev = _state;
    _state = newState;

    // Notify SRVoiceAssistant if loaded
    var va = global.SRVoiceAssistant;
    if (va) {
      if (newState === CONN_STATE.OFFLINE && typeof va.notifyOffline === 'function') {
        va.notifyOffline();
      } else if (newState === CONN_STATE.ONLINE && typeof va.notifyOnline === 'function') {
        va.notifyOnline();
      }
    }

    // Notify SROfflineState — separates network from intelligence readiness
    var offState = global.SROfflineState;
    if (offState && typeof offState.setNetworkState === 'function') {
      try { offState.setNetworkState(newState === CONN_STATE.ONLINE); } catch (_) {}
    }

    // Notify registered UI/app callbacks
    _listeners.forEach(function (fn) {
      try { fn(newState, prev); } catch (_) {}
    });
  }

  // ─── Initialization ──────────────────────────────────────────────────────
  function init() {
    if (typeof global.addEventListener !== 'function') {
      // Non-browser environment (Node tests) — assume online
      _setState(CONN_STATE.ONLINE);
      return;
    }

    // Set initial state from navigator.onLine (best available signal at start)
    var nav = global.navigator;
    if (nav && typeof nav.onLine === 'boolean') {
      _setState(nav.onLine ? CONN_STATE.ONLINE : CONN_STATE.OFFLINE);
    } else {
      _setState(CONN_STATE.ONLINE);  // assume online if API unavailable
    }

    // Browser online/offline events are the definitive connection signals
    global.addEventListener('online', function () {
      _setState(CONN_STATE.ONLINE);
    });

    global.addEventListener('offline', function () {
      _setState(CONN_STATE.OFFLINE);
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /** Returns current connection state: ONLINE | OFFLINE | UNKNOWN */
  function getState() { return _state; }

  /** Returns true when definitely offline */
  function isOffline() { return _state === CONN_STATE.OFFLINE; }

  /** Returns true when online (or unknown — assume online unless proven otherwise) */
  function isOnline() { return _state !== CONN_STATE.OFFLINE; }

  /**
   * Register a listener for connection state changes.
   * fn(newState, prevState) — called on each ONLINE→OFFLINE or OFFLINE→ONLINE transition.
   * Returns an unsubscribe function.
   */
  function onChange(fn) {
    if (typeof fn === 'function') _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (x) { return x !== fn; });
    };
  }

  /**
   * getUserMessage(forAction)
   * Returns a clear user-facing message when offline.
   * forAction: optional string describing what was attempted (e.g. 'voice').
   */
  function getUserMessage(forAction) {
    if (_state !== CONN_STATE.OFFLINE) return null;
    if (forAction === 'voice') {
      return 'Shadow is offline. voice recognition requires an internet connection.';
    }
    return 'Shadow is offline. Internet-dependent features will resume when the connection returns.';
  }

  /**
   * getRestoredMessage()
   * Returns a message to show when connection is restored.
   */
  function getRestoredMessage() {
    return 'Connection restored. Shadow is back online.';
  }

  global.SRConnectionMonitor = {
    build:       BUILD_ID,
    CONN_STATE:  CONN_STATE,

    // Lifecycle
    init:        init,

    // State queries
    getState:    getState,
    isOffline:   isOffline,
    isOnline:    isOnline,

    // Events
    onChange:    onChange,

    // Messages
    getUserMessage:    getUserMessage,
    getRestoredMessage: getRestoredMessage,
  };

})(typeof window !== 'undefined' ? window : global);
