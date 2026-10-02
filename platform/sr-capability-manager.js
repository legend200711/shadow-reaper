/**
 * shadow-reaper-standalone/platform/sr-capability-manager.js
 * Shadow Reaper Standalone — Device Capability Manager
 *
 * Build: SR-STANDALONE-CAPABILITY-3
 *
 * Exposes: window.SRCapabilityManager
 *
 * PURPOSE:
 *   Probes the actual capabilities available in the current runtime.
 *   Capability detection is the authoritative source — never fake native
 *   capabilities in a web browser.
 *
 * CAPABILITY STATES:
 *   WEB_AVAILABLE       — Works in any browser (no native app needed)
 *   NATIVE_APP_REQUIRED — Requires the native Android/iOS app (not available in browser/PWA)
 *   PERMISSION_REQUIRED — API exists but needs OS permission grant
 *   ALLOWED             — API available and permission granted
 *   DENIED              — User/OS denied permission
 *   NOT_SUPPORTED       — API not available in this runtime at all
 *   NOT_IMPLEMENTED     — Feature exists conceptually but is not yet built
 *
 * CAPABILITIES:
 *   notifications, scheduledReminders, microphone, voiceInput,
 *   audioOutput, camera, photoPicker, userFiles, nativeSharing,
 *   clipboard, haptics, location, geofencing, urlSchemes,
 *   networkStatus, backgroundTasks, openApp
 *
 * SECURITY:
 *   - Desktop hides mobile-only controls.
 *   - Permissions are never requested silently.
 *   - No capability is activated without explicit user action.
 *   - DO NOT report AVAILABLE for native-only capabilities when running in a browser.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-CAPABILITY-3';

  // ─── States ───────────────────────────────────────────────────────────────
  var STATE = {
    WEB_AVAILABLE:        'WEB_AVAILABLE',
    NATIVE_APP_REQUIRED:  'NATIVE_APP_REQUIRED',
    PERMISSION_REQUIRED:  'PERMISSION_REQUIRED',
    ALLOWED:              'ALLOWED',
    DENIED:               'DENIED',
    NOT_SUPPORTED:        'NOT_SUPPORTED',
    NOT_IMPLEMENTED:      'NOT_IMPLEMENTED',
    // Legacy alias — kept for code compatibility
    AVAILABLE:            'WEB_AVAILABLE',
  };

  // ─── Cached capability map ────────────────────────────────────────────────
  var _caps = {};

  // ─── Platform helper ──────────────────────────────────────────────────────
  function _platform()  { return global.SRPlatformDetector || null; }
  function _isNative()    { return _platform() ? _platform().isNative()    : false; }
  function _isWebOrPWA()  { return _platform() ? _platform().isWebOrPWA()  : true; }
  function _isDesktop()   { return _platform() ? _platform().isDesktop()   : true; }

  // ─── Individual capability probes ─────────────────────────────────────────

  function _probeNotifications() {
    if (_isNative()) {
      // Native: Capacitor LocalNotifications
      if (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.LocalNotifications) {
        if (global.Notification && global.Notification.permission === 'granted') return STATE.ALLOWED;
        if (global.Notification && global.Notification.permission === 'denied')  return STATE.DENIED;
        return STATE.PERMISSION_REQUIRED;
      }
      return STATE.PERMISSION_REQUIRED;
    }
    // Web/PWA browser
    if (!('Notification' in global)) return STATE.NOT_SUPPORTED;
    if (global.Notification.permission === 'granted') return STATE.ALLOWED;
    if (global.Notification.permission === 'denied')  return STATE.DENIED;
    return STATE.PERMISSION_REQUIRED;
  }

  function _probeScheduledReminders() {
    if (_isNative()) {
      // Native: Capacitor LocalNotifications — fires even when app is closed
      return STATE.PERMISSION_REQUIRED;
    }
    // Web/PWA: setTimeout-based only (requires tab/app open). Partial but usable.
    if ('Notification' in global && global.Notification.permission !== 'denied') {
      return STATE.PERMISSION_REQUIRED;
    }
    return STATE.NOT_SUPPORTED;
  }

  function _probeMicrophone() {
    if (!global.navigator || !global.navigator.mediaDevices || !global.navigator.mediaDevices.getUserMedia) {
      return STATE.NOT_SUPPORTED;
    }
    return STATE.PERMISSION_REQUIRED;
  }

  function _probeVoiceInput() {
    if (global.SpeechRecognition || global.webkitSpeechRecognition) return STATE.WEB_AVAILABLE;
    // Some Android WebViews do not have SpeechRecognition
    return STATE.NOT_SUPPORTED;
  }

  function _probeAudioOutput() {
    if (global.speechSynthesis) return STATE.WEB_AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeCamera() {
    if (_isNative()) {
      // Native: @capacitor/camera
      return STATE.PERMISSION_REQUIRED;
    }
    // Browser: getUserMedia with video
    if (global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia) {
      return STATE.PERMISSION_REQUIRED;
    }
    return STATE.NOT_SUPPORTED;
  }

  function _probePhotoPicker() {
    if (typeof document !== 'undefined') return STATE.WEB_AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeUserFiles() {
    if (typeof document !== 'undefined') return STATE.WEB_AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeNativeSharing() {
    if (global.navigator && global.navigator.share) return STATE.WEB_AVAILABLE;
    // Web Share API not supported
    return STATE.NOT_SUPPORTED;
  }

  function _probeClipboard() {
    if (global.navigator && global.navigator.clipboard) return STATE.WEB_AVAILABLE;
    if (typeof document !== 'undefined' && document.queryCommandSupported && document.queryCommandSupported('copy')) {
      return STATE.WEB_AVAILABLE;
    }
    return STATE.NOT_SUPPORTED;
  }

  function _probeHaptics() {
    if (_isNative()) {
      // Native: @capacitor/haptics or ShadowReaperBridgePlugin.vibrate
      return STATE.WEB_AVAILABLE;
    }
    // Browser: navigator.vibrate (Android Chrome supports this)
    if (global.navigator && global.navigator.vibrate) return STATE.WEB_AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeLocation() {
    if (global.navigator && global.navigator.geolocation) return STATE.PERMISSION_REQUIRED;
    return STATE.NOT_SUPPORTED;
  }

  function _probeGeofencing() {
    // Geofencing = native only AND not yet implemented
    if (_isNative()) return STATE.NOT_IMPLEMENTED;
    return STATE.NATIVE_APP_REQUIRED;
  }

  function _probeUrlSchemes() {
    if (typeof global.open === 'function') return STATE.WEB_AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeNetworkStatus() {
    if (global.navigator && 'onLine' in global.navigator) return STATE.WEB_AVAILABLE;
    return STATE.NOT_SUPPORTED;
  }

  function _probeBackgroundTasks() {
    if (_isNative()) return STATE.NOT_IMPLEMENTED; // Future stage
    if (global.navigator && global.navigator.serviceWorker) return STATE.PERMISSION_REQUIRED;
    return STATE.NOT_SUPPORTED;
  }

  function _probeOpenApp() {
    // Opening other apps by package name = native Android only
    if (_isNative()) return STATE.WEB_AVAILABLE;
    return STATE.NATIVE_APP_REQUIRED;
  }

  function _probePairedDeviceControl() {
    // Controlling paired computers/TVs/smart home = future backend integration
    // Works from any runtime once the secure integration exists (not native-only)
    return STATE.NOT_IMPLEMENTED;
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
    openApp:             _probeOpenApp,
    pairedDeviceControl: _probePairedDeviceControl,
  };

  // Mobile-only capabilities — hidden on desktop
  var _MOBILE_ONLY = ['haptics', 'geofencing', 'scheduledReminders', 'camera', 'photoPicker', 'openApp'];

  // Native-only capabilities — hidden from web/PWA runtimes in "Control This Phone" UI
  // These represent phone-control features. NOT_IMPLEMENTED and paired-device are separate.
  var _NATIVE_PHONE_ONLY = ['haptics', 'geofencing', 'openApp', 'backgroundTasks'];

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
    return s === STATE.WEB_AVAILABLE || s === STATE.ALLOWED;
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
    if (_PROBES.hasOwnProperty(capability)) {
      // Accept both old and new state names for compatibility
      var mappedState = newState;
      if (newState === 'AVAILABLE') mappedState = STATE.WEB_AVAILABLE;
      _caps[capability] = mappedState;
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
    isNativePhoneOnly:     function (k) { return _NATIVE_PHONE_ONLY.indexOf(k) !== -1; },
  };

})(typeof window !== 'undefined' ? window : global);
