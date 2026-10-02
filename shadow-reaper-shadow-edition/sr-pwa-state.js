/**
 * shadow-reaper-standalone/sr-pwa-state.js
 * Shadow Reaper Standalone — Centralized PWA Install-State Manager
 *
 * Build: SR-PWA-STATE-1
 *
 * Exposes: window.SRPWAState
 *
 * STATES:
 *   UNKNOWN           — detection not yet complete
 *   INSTALLABLE       — beforeinstallprompt received; browser says we can install
 *   IOS_MANUAL_INSTALL— iOS Safari; user must use Share > Add to Home Screen
 *   INSTALLED         — running in standalone mode (confirmed by display-mode)
 *   NOT_INSTALLABLE   — browser has not offered installation (browser tab, already installed, etc.)
 *
 * RULES:
 *   - INSTALLED is ONLY reported when display-mode: standalone OR navigator.standalone === true.
 *   - A registered service worker is NOT evidence of installation.
 *   - Cached files are NOT evidence of installation.
 *   - beforeinstallprompt firing means INSTALLABLE, not INSTALLED.
 *   - appinstalled event updates state but does NOT set INSTALLED alone —
 *     the next page load in standalone mode confirms it.
 *   - getInstalledRelatedApps() is NOT used (requires related_applications in manifest
 *     and a native Android app; absent here it returns [] and tells us nothing).
 *   - Running in a normal Chrome browser tab = NOT_INSTALLABLE until
 *     beforeinstallprompt fires.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-PWA-STATE-1';

  // ── Install state constants ──────────────────────────────────────────────
  var STATE = {
    UNKNOWN:            'UNKNOWN',
    INSTALLABLE:        'INSTALLABLE',
    IOS_MANUAL_INSTALL: 'IOS_MANUAL_INSTALL',
    INSTALLED:          'INSTALLED',
    NOT_INSTALLABLE:    'NOT_INSTALLABLE',
  };

  // ── Internal state ───────────────────────────────────────────────────────
  var _state          = STATE.UNKNOWN;
  var _deferredPrompt = null;
  var _listeners      = [];

  // ── Platform helpers ─────────────────────────────────────────────────────
  function _isRunningStandalone() {
    // The ONLY reliable proof this PWA is running as an installed app:
    //   display-mode: standalone (Android/Chrome/Edge installed PWA)
    //   navigator.standalone === true (iOS Safari "Add to Home Screen")
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function _isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function _isIOSSafari() {
    return _isIOS() &&
      /safari/i.test(navigator.userAgent) &&
      !/crios|fxios|opios/i.test(navigator.userAgent);
  }

  // ── State transition ─────────────────────────────────────────────────────
  function _setState(newState) {
    if (_state === newState) return;
    var prev = _state;
    _state = newState;
    console.log('[SR-PWA] State: ' + prev + ' → ' + newState);
    _listeners.forEach(function (fn) {
      try { fn(newState, prev); } catch (e) { /* ignore listener errors */ }
    });
  }

  // ── Initialization ───────────────────────────────────────────────────────
  function init() {
    // STEP 1: Check if already running in standalone (installed) mode.
    // This is the definitive INSTALLED signal — no other check is needed.
    if (_isRunningStandalone()) {
      _setState(STATE.INSTALLED);
      return;
    }

    // STEP 2: iOS Safari — real browser install prompt is unavailable.
    // Show manual install guide. Only do this when NOT already standalone.
    if (_isIOSSafari()) {
      _setState(STATE.IOS_MANUAL_INSTALL);
      return;
    }

    // STEP 3: All other browsers — wait for beforeinstallprompt.
    // Until that event fires, we do NOT know if the app is installable.
    // Default to NOT_INSTALLABLE so no install UI is shown prematurely.
    _setState(STATE.NOT_INSTALLABLE);

    // beforeinstallprompt — browser is ready to install this specific PWA.
    // Chrome/Edge/Samsung Internet fires this when:
    //   • manifest is valid with a unique `id`
    //   • service worker is registered
    //   • user has NOT already installed this PWA
    //   • engagement heuristics are met (or immediately on Android for trusted origins)
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); // suppress mini-infobar
      _deferredPrompt = e;
      _setState(STATE.INSTALLABLE);
    });

    // appinstalled — browser confirmed the PWA was installed.
    // This does NOT mean we are running standalone yet; that happens on next launch.
    // Simply clear the prompt and move to NOT_INSTALLABLE (install button goes away).
    window.addEventListener('appinstalled', function () {
      _deferredPrompt = null;
      _setState(STATE.NOT_INSTALLABLE);
      console.log('[SR-PWA] Shadow Reaper installed. Next launch will be standalone.');
    });
  }

  // ── Public: trigger browser install prompt ───────────────────────────────
  function triggerInstallPrompt(onResult) {
    if (_state !== STATE.INSTALLABLE || !_deferredPrompt) return false;
    _deferredPrompt.prompt();
    _deferredPrompt.userChoice.then(function (choice) {
      _deferredPrompt = null;
      // Regardless of accepted/dismissed, move back to NOT_INSTALLABLE.
      // If accepted, appinstalled will fire shortly after.
      _setState(STATE.NOT_INSTALLABLE);
      if (typeof onResult === 'function') onResult(choice.outcome);
    });
    return true;
  }

  // ── Public API ───────────────────────────────────────────────────────────
  function getState()       { return _state; }
  function isInstalled()    { return _state === STATE.INSTALLED; }
  function isInstallable()  { return _state === STATE.INSTALLABLE; }
  function isIOSManual()    { return _state === STATE.IOS_MANUAL_INSTALL; }

  function onChange(fn) {
    if (typeof fn === 'function') _listeners.push(fn);
  }

  global.SRPWAState = {
    build:               BUILD_ID,
    STATE:               STATE,
    init:                init,
    getState:            getState,
    isInstalled:         isInstalled,
    isInstallable:       isInstallable,
    isIOSManual:         isIOSManual,
    triggerInstallPrompt: triggerInstallPrompt,
    onChange:            onChange,
  };

})(typeof window !== 'undefined' ? window : global);
