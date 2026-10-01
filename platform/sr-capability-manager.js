/**
 * shadow-reaper-standalone/platform/sr-capability-manager.js
 * Shadow Reaper Standalone — Device Capability Manager
 *
 * Build: SR-STANDALONE-CAPABILITY-1
 *
 * Exposes: window.SRCapabilityManager
 *
 * PURPOSE:
 *   Probes the actual capabilities available in the current runtime.
 *   Capability detection is the authoritative source — never fake native
 *   capabilities in a web browser.
 *
 * CAPABILITY STATES:
 *   AVAILABLE       — API exists and is callable
 *   PERMISSION_REQUIRED — API exists but needs OS permission grant
 *   ALLOWED         — API available and permission granted
 *   DENIED          — User/OS denied permission
 *   NOT_SUPPORTED   — API not available in this runtime
 *
 * CAPABILITIES:
 *   notifications, scheduledReminders, microphone, voiceInput,
 *   audioOutput, camera, photoPicker, userFiles, nativeSharing,
 *   clipboard, haptics, location, geofencing, urlSchemes,
 *   networkStatus, backgroundTasks
 *
 * SECURITY:
 *   - Desktop hides mobile-only controls.
 *   - Permissions are never requested silently.
 *   - No capability is activated without explicit user action.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-CAPABILITY-1';

  // ─── States ───────────────────────────────────────────────────────────────
  var STATE = {
    AVAILABLE:          'AVAILABLE',
    PERMISSION_REQUIRED:'PERMISSION_REQUIRED',
    ALLOWED:            'ALLOWED',
    DENIED:             'DENIED',
    NOT_SUPPORTED:      'NOT_SUPPORTED',
  };

  // ─── Cached capability map ────────────────────────────────────────────────
  var _caps = {};

  // ─── Platform helper ──────────────────────────────────────────────────────
  function _platform() { return global.SRPlatformDetector || null; }
  function _isNative() { return _platform() ? _platform().isNative() : false; }
  function _isDesktop(){ return _platform() ? _platform().isDesktop() : true; }

  // ─── Individual capability probes ─────────────────────────────────────────

  function _probeNotifications() {
    if (!('Notification' in global)) return STATE.NOT_SUPPORTED;
    if (Notification.permission === 'granted') return STATE.ALLOWED;
    if (Notification.permission === 'denied')  return STATE.DENIED;
    return STATE.PERMISSION_REQUIRED;
  }

  function _probeMicrophone() {
    if (!global.navigator || !global.navigator.mediaDevices || !global.navigator.mediaDevices.getUserMedia) {
      return STATE.NOT_SUPPORTED;
    }
    // Check if permission was previously granted using Permissions API
    if (global.navigator.permissions) {
      // Async probe handled separately; synchronous state is PERMISSION_REQUIRED
      return STATE.PERMISSION_REQUIRED;
    }
    return STATE.PERMISSION_REQUIRED;
  }

  function _probeVoiceInput() {
    if (global.SpeechRecognition || global.webkitSpeechRecognition) return STATE.AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeAudioOutput() {
    if (global.speechSynthesis) return STATE.AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeCamera() {
    if (!global.navigator || !global.navigator.mediaDevices || !global.navigator.mediaDevices.getUserMedia) {
      return STATE.NOT_SUPPORTED;
    }
    return STATE.PERMISSION_REQUIRED;
  }

  function _probePhotoPicker() {
    // In-browser: file input with accept="image/*"
    if (typeof document !== 'undefined') return STATE.AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeUserFiles() {
    // User-selected files via <input type="file"> — available everywhere with a DOM
    if (typeof document !== 'undefined') return STATE.AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeNativeSharing() {
    if (global.navigator && global.navigator.share) return STATE.AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeClipboard() {
    if (global.navigator && global.navigator.clipboard) return STATE.AVAILABLE;
    // Fallback: document.execCommand('copy') — legacy
    if (typeof document !== 'undefined' && document.queryCommandSupported && document.queryCommandSupported('copy')) {
      return STATE.AVAILABLE;
    }
    return STATE.NOT_SUPPORTED;
  }

  function _probeHaptics() {
    if (global.navigator && global.navigator.vibrate) return STATE.AVAILABLE;
    // Capacitor Haptics plugin
    if (_isNative() && global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Haptics) {
      return STATE.AVAILABLE;
    }
    return STATE.NOT_SUPPORTED;
  }

  function _probeLocation() {
    if (global.navigator && global.navigator.geolocation) return STATE.PERMISSION_REQUIRED;
    return STATE.NOT_SUPPORTED;
  }

  function _probeGeofencing() {
    // Geofencing requires native; not available in web browsers
    if (_isNative() && global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Geolocation) {
      return STATE.PERMISSION_REQUIRED;
    }
    return STATE.NOT_SUPPORTED;
  }

  function _probeScheduledReminders() {
    // Scheduled reminders require local notifications — web: Notification API + manual scheduling
    // Native: Capacitor LocalNotifications plugin
    if (_isNative() && global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.LocalNotifications) {
      return STATE.PERMISSION_REQUIRED;
    }
    if ('Notification' in global && Notification.permission !== 'denied') {
      return STATE.PERMISSION_REQUIRED; // Web: best-effort via Notification API
    }
    return STATE.NOT_SUPPORTED;
  }

  function _probeUrlSchemes() {
    // URL/app opening — available everywhere
    if (typeof global.open === 'function') return STATE.AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeNetworkStatus() {
    if (global.navigator && 'onLine' in global.navigator) return STATE.AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeBackgroundTasks() {
    // Web: Service Worker background sync
    if (global.navigator && global.navigator.serviceWorker) return STATE.PERMISSION_REQUIRED;
    return STATE.NOT_SUPPORTED;
  }

  // ─── Build the capability map ─────────────────────────────────────────────
  var _PROBES = {
    notifications:       _probeNotifications,
    scheduledReminders:  _probeScheduledReminders,
    microphone:          _probeMicrophone,
    voiceInput:          _probeVoiceInput,
    audioOutput:         _probeAudioOutput,
    camera:              _probeCamera,
    photoPicker:         _probePhotoPicker,
    userFiles:           _probeUserFiles,
    nativeSharing:       _probeNativeSharing,
    clipboard:           _probeClipboard,
    haptics:             _probeHaptics,
    location:            _probeLocation,
    geofencing:          _probeGeofencing,
    urlSchemes:          _probeUrlSchemes,
    networkStatus:       _probeNetworkStatus,
    backgroundTasks:     _probeBackgroundTasks,
  };

  // Mobile-only capabilities — hidden on desktop
  var _MOBILE_ONLY = ['haptics', 'geofencing', 'scheduledReminders', 'camera', 'photoPicker'];

  function probe() {
    var keys = Object.keys(_PROBES);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      try {
        _caps[key] = _PROBES[key]();
      } catch (_) {
        _caps[key] = STATE.NOT_SUPPORTED;
      }
    }
    return Object.assign({}, _caps);
  }

  // ─── Get capability state ─────────────────────────────────────────────────
  function getState(capability) {
    if (!_caps[capability]) {
      // Probe on first access if not yet probed
      try {
        _caps[capability] = _PROBES[capability] ? _PROBES[capability]() : STATE.NOT_SUPPORTED;
      } catch (_) {
        _caps[capability] = STATE.NOT_SUPPORTED;
      }
    }
    return _caps[capability];
  }

  function isAvailable(capability) {
    var s = getState(capability);
    return s === STATE.AVAILABLE || s === STATE.ALLOWED;
  }

  // ─── Desktop-visible capabilities ─────────────────────────────────────────
  function getVisibleCapabilities() {
    var all = Object.keys(_PROBES);
    if (_isDesktop()) {
      return all.filter(function (k) { return _MOBILE_ONLY.indexOf(k) === -1; });
    }
    return all;
  }

  // ─── Update state after permission grant/deny ─────────────────────────────
  function updateState(capability, newState) {
    if (STATE[newState] && _PROBES.hasOwnProperty(capability)) {
      _caps[capability] = newState;
    }
  }

  // ─── Initial probe ────────────────────────────────────────────────────────
  probe();

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRCapabilityManager = {
    build:                 BUILD_ID,
    STATE:                 STATE,

    probe:                 probe,
    getState:              getState,
    isAvailable:           isAvailable,
    getVisibleCapabilities: getVisibleCapabilities,
    updateState:           updateState,
    getAll:                function () { return Object.assign({}, _caps); },
    isMobileOnly:          function (k) { return _MOBILE_ONLY.indexOf(k) !== -1; },
  };

})(typeof window !== 'undefined' ? window : global);
