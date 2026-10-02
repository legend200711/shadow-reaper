/**
 * shadow-reaper-standalone/platform/adapters/sr-web-adapter.js
 * Shadow Reaper Standalone — Web Platform Adapter
 *
 * Build: SR-STANDALONE-WEB-ADAPTER-1
 *
 * Exposes: window.SRWebAdapter
 *
 * PURPOSE:
 *   Provides web-specific implementations for device capabilities.
 *   Used for both WEB_DESKTOP and WEB_MOBILE runtimes.
 *
 * DESIGN:
 *   - Does NOT pretend the web has native-app capabilities.
 *   - Reports capabilities honestly: only what the browser actually supports.
 *   - Desktop suppresses mobile-only controls.
 *   - Web Speech API used for voice (no separate brain).
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-WEB-ADAPTER-1';

  function _platform()  { return global.SRPlatformDetector   || null; }
  function _caps()      { return global.SRCapabilityManager  || null; }
  function _router()    { return global.SRDeviceActionRouter || null; }

  function isDesktop() {
    var p = _platform();
    return p ? p.isDesktop() : true;
  }

  // ─── Get the set of capabilities actually usable on this web runtime ──────
  function getSupportedCapabilities() {
    var caps = _caps();
    if (!caps) return [];
    var visible = caps.getVisibleCapabilities();
    var S = caps.STATE;
    return visible.filter(function (k) {
      var s = caps.getState(k);
      return s !== S.NOT_SUPPORTED;
    });
  }

  // ─── Get capability display info for Device Controls UI ───────────────────
  function getDeviceControlsInfo() {
    var caps = _caps();
    if (!caps) return [];
    var visible = caps.getVisibleCapabilities();

    return visible.map(function (key) {
      var state = caps.getState(key);
      return {
        key:     key,
        state:   state,
        label:   _labelFor(key),
        hidden:  isDesktop() && caps.isMobileOnly(key),
      };
    }).filter(function (item) { return !item.hidden; });
  }

  function _labelFor(key) {
    var labels = {
      notifications:      'Notifications',
      scheduledReminders: 'Reminders',
      microphone:         'Microphone',
      voiceInput:         'Voice Input',
      audioOutput:        'Audio Output',
      camera:             'Camera',
      photoPicker:        'Photo Picker',
      userFiles:          'File Access',
      nativeSharing:      'Share',
      clipboard:          'Clipboard',
      haptics:            'Haptics',
      location:           'Location',
      geofencing:         'Geofencing',
      urlSchemes:         'Open URLs',
      networkStatus:      'Network Status',
      backgroundTasks:    'Background Tasks',
    };
    return labels[key] || key;
  }

  // ─── Handle web share (with clipboard fallback) ───────────────────────────
  function share(text, title, callback) {
    var router = _router();
    if (!router) { if (callback) callback({ ok: false, reason: 'router_unavailable' }); return; }
    router.dispatch({ type: router.ALLOWED_ACTIONS.SHARE_TEXT, params: { text: text, title: title } }, callback);
  }

  // ─── Copy to clipboard ────────────────────────────────────────────────────
  function copyToClipboard(text, callback) {
    var router = _router();
    if (!router) { if (callback) callback({ ok: false, reason: 'router_unavailable' }); return; }
    router.dispatch({ type: router.ALLOWED_ACTIONS.COPY_TO_CLIPBOARD, params: { text: text } }, callback);
  }

  // ─── Get network status ───────────────────────────────────────────────────
  function getNetworkStatus() {
    return {
      online: global.navigator ? global.navigator.onLine : true,
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRWebAdapter = {
    build:                  BUILD_ID,
    isDesktop:              isDesktop,
    getSupportedCapabilities: getSupportedCapabilities,
    getDeviceControlsInfo:  getDeviceControlsInfo,
    share:                  share,
    copyToClipboard:        copyToClipboard,
    getNetworkStatus:       getNetworkStatus,
  };

})(typeof window !== 'undefined' ? window : global);
