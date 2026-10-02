/**
 * shadow-reaper-shadow-edition/sr-offline-state.js
 * Shadow Reaper — Offline / Capability State Manager
 *
 * Build: SR-OFFLINE-STATE-1
 *
 * Exposes: window.SROfflineState
 *
 * PURPOSE:
 *   Maintains a truthful, observable picture of Shadow's ACTUAL capability
 *   state, completely separate from internet connectivity.
 *
 *   Shadow can be:
 *     MODEL_READY + NETWORK_UNAVAILABLE  → intelligent local conversation ✓
 *     MODEL_FAILED + NETWORK_AVAILABLE   → only deterministic fallback
 *     MODEL_LOADING + NETWORK_UNAVAILABLE→ loading from cache, conversation
 *                                          falls back to deterministic meanwhile
 *
 *   Internet connectivity is NEVER used as a proxy for intelligence readiness.
 *
 * CAPABILITY STATES:
 *   LOCAL_READY     — Language Foundation + deterministic pipeline fully loaded
 *   LOCAL_DEGRADED  — Core loaded but Language Foundation missing or partial
 *   MODEL_LOADING   — Local generative model is initializing
 *   MODEL_READY     — Local model loaded and verified — generative responses
 *   MODEL_FAILED    — Local model could not load — deterministic fallback active
 *   NETWORK_AVAILABLE   — Internet reachable
 *   NETWORK_UNAVAILABLE — Internet not reachable
 *
 * ZERO polling. ZERO setInterval. Event-driven.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-OFFLINE-STATE-1';

  // ─── Capability states ───────────────────────────────────────────────────────

  var CAP = {
    LOCAL_READY:          'LOCAL_READY',
    LOCAL_DEGRADED:       'LOCAL_DEGRADED',
    MODEL_LOADING:        'MODEL_LOADING',
    MODEL_READY:          'MODEL_READY',
    MODEL_FAILED:         'MODEL_FAILED',
    NETWORK_AVAILABLE:    'NETWORK_AVAILABLE',
    NETWORK_UNAVAILABLE:  'NETWORK_UNAVAILABLE',
  };

  // ─── Internal state ──────────────────────────────────────────────────────────

  var _localState    = CAP.LOCAL_DEGRADED;   // starts degraded until verified
  var _modelState    = CAP.MODEL_LOADING;    // starts loading
  var _networkState  = CAP.NETWORK_AVAILABLE;// assume online until proven otherwise
  var _modelFailReason  = null;
  var _fallbackActive   = false;
  var _fallbackReason   = null;
  var _langFdnLoaded    = false;
  var _personalityLoaded = false;
  var _memoryAvailable  = false;
  var _projectsAvailable = false;

  var _listeners = [];  // fn(event, payload)

  // ─── Notify ──────────────────────────────────────────────────────────────────

  function _notify(event, payload) {
    _listeners.forEach(function (fn) {
      try { fn(event, payload); } catch (_) {}
    });
  }

  // ─── Public: set states (called by other modules) ────────────────────────────

  /**
   * Called by sr-language.js / shadow-reaper.js when Language Foundation loads.
   */
  function setLanguageFoundationLoaded(ok) {
    _langFdnLoaded = !!ok;
    _localState = (_langFdnLoaded) ? CAP.LOCAL_READY : CAP.LOCAL_DEGRADED;
    _notify('localStateChanged', { localState: _localState, langFdnLoaded: _langFdnLoaded });
  }

  /**
   * Called by core/personality-engine.js when profile is loaded.
   */
  function setPersonalityLoaded(ok) {
    _personalityLoaded = !!ok;
    _notify('personalityStateChanged', { loaded: _personalityLoaded });
  }

  /**
   * Called by snx-shadow-memory.js / snx-shadow-adaptive.js when cache is available.
   */
  function setMemoryAvailable(ok) {
    _memoryAvailable = !!ok;
    _notify('memoryStateChanged', { available: _memoryAvailable });
  }

  /**
   * Called when project context is available locally.
   */
  function setProjectsAvailable(ok) {
    _projectsAvailable = !!ok;
    _notify('projectsStateChanged', { available: _projectsAvailable });
  }

  /**
   * Called by core/local-model.js to report model state changes.
   * modelState: 'LOADING' | 'READY' | 'FAILED' | 'UNINITIALIZED' | 'VERIFYING'
   * reason: optional failure reason string
   */
  function setModelState(modelState, reason) {
    var prev = _modelState;

    if (modelState === 'READY') {
      _modelState = CAP.MODEL_READY;
      _fallbackActive = false;
      _fallbackReason = null;
      _modelFailReason = null;
    } else if (modelState === 'FAILED') {
      _modelState = CAP.MODEL_FAILED;
      _fallbackActive = true;
      _fallbackReason = reason || 'model_failed';
      _modelFailReason = reason || 'UNKNOWN';
    } else if (modelState === 'LOADING' || modelState === 'VERIFYING') {
      _modelState = CAP.MODEL_LOADING;
      // Deterministic fallback active during loading
      if (!_fallbackActive) {
        _fallbackActive = true;
        _fallbackReason = 'model_loading';
      }
    } else if (modelState === 'UNINITIALIZED') {
      _modelState = CAP.MODEL_LOADING;
      _fallbackActive = true;
      _fallbackReason = 'model_not_started';
    }

    if (_modelState !== prev) {
      _notify('modelStateChanged', {
        modelState:   _modelState,
        fallbackActive: _fallbackActive,
        fallbackReason: _fallbackReason,
        failReason:   _modelFailReason,
      });
    }
  }

  /**
   * Called by sr-connection-monitor.js when connectivity changes.
   */
  function setNetworkState(isOnline) {
    var prev = _networkState;
    _networkState = isOnline ? CAP.NETWORK_AVAILABLE : CAP.NETWORK_UNAVAILABLE;
    if (_networkState !== prev) {
      _notify('networkStateChanged', { networkState: _networkState });
    }
  }

  // ─── Public: query ───────────────────────────────────────────────────────────

  /**
   * Returns the full current capability snapshot.
   * UI and diagnostics panels call this.
   */
  function getSnapshot() {
    var intelligentOffline =
      (_localState === CAP.LOCAL_READY) ||
      (_modelState === CAP.MODEL_READY);

    return {
      // Granular states
      localState:   _localState,
      modelState:   _modelState,
      networkState: _networkState,

      // Aggregate intelligence readiness
      intelligentLocalAvailable: intelligentOffline,
      fullIntelligenceAvailable: intelligentOffline && (_modelState === CAP.MODEL_READY),

      // Component flags
      langFdnLoaded:       _langFdnLoaded,
      personalityLoaded:   _personalityLoaded,
      memoryAvailable:     _memoryAvailable,
      projectsAvailable:   _projectsAvailable,

      // Fallback
      fallbackActive:  _fallbackActive,
      fallbackReason:  _fallbackReason,
      modelFailReason: _modelFailReason,

      // Convenience booleans
      isOnline:  _networkState === CAP.NETWORK_AVAILABLE,
      isOffline: _networkState === CAP.NETWORK_UNAVAILABLE,
      modelReady: _modelState === CAP.MODEL_READY,
      modelLoading: _modelState === CAP.MODEL_LOADING,
      modelFailed: _modelState === CAP.MODEL_FAILED,
    };
  }

  /** True when Shadow can have intelligent local conversation. */
  function isLocalIntelligenceReady() {
    return (_localState === CAP.LOCAL_READY) || (_modelState === CAP.MODEL_READY);
  }

  /** True when the full generative local model is operational. */
  function isModelReady() {
    return _modelState === CAP.MODEL_READY;
  }

  /** True when internet is reachable. */
  function isOnline() {
    return _networkState === CAP.NETWORK_AVAILABLE;
  }

  /** True when fallback (deterministic only) is the active response path. */
  function isFallbackActive() {
    return _fallbackActive;
  }

  // ─── Listen for changes ───────────────────────────────────────────────────────

  /**
   * Register a listener for any capability state change.
   * fn(event, payload) — event is one of: localStateChanged, modelStateChanged,
   *                       networkStateChanged, memoryStateChanged, personalityStateChanged
   * Returns an unsubscribe function.
   */
  function onChange(fn) {
    if (typeof fn === 'function') _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (f) { return f !== fn; });
    };
  }

  // ─── Wire into existing monitors (auto-init) ─────────────────────────────────

  function init() {
    // Wire into connection monitor if already loaded
    var cm = global.SRConnectionMonitor;
    if (cm && typeof cm.onChange === 'function') {
      cm.onChange(function (newState) {
        setNetworkState(newState === 'ONLINE');
      });
      // Sync current state immediately
      setNetworkState(cm.isOnline ? cm.isOnline() : true);
    }

    // Wire into local model state changes if already loaded
    var lm = global.SRLocalModel;
    if (lm && typeof lm.onStateChange === 'function') {
      lm.onStateChange(function (modelState) {
        setModelState(modelState);
      });
      // Sync current state immediately
      var status = lm.getStatus();
      if (status) setModelState(status.state);
    }

    // Check Language Foundation immediately
    if (global.SRLanguage) {
      setLanguageFoundationLoaded(true);
    }

    console.log('[SROfflineState] Initialized. Snapshot:', JSON.stringify(getSnapshot(), null, 2));
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  global.SROfflineState = {
    build: BUILD_ID,
    CAP:   CAP,

    // Lifecycle
    init: init,

    // State setters (called by subsystems)
    setLanguageFoundationLoaded: setLanguageFoundationLoaded,
    setPersonalityLoaded:        setPersonalityLoaded,
    setMemoryAvailable:          setMemoryAvailable,
    setProjectsAvailable:        setProjectsAvailable,
    setModelState:               setModelState,
    setNetworkState:             setNetworkState,

    // State queries
    getSnapshot:                 getSnapshot,
    isLocalIntelligenceReady:    isLocalIntelligenceReady,
    isModelReady:                isModelReady,
    isOnline:                    isOnline,
    isFallbackActive:            isFallbackActive,

    // Events
    onChange: onChange,
  };

})(typeof window !== 'undefined' ? window : global);
