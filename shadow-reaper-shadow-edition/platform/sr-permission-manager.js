/**
 * shadow-reaper-standalone/platform/sr-permission-manager.js
 * Shadow Reaper Standalone — Permission Manager
 *
 * Build: SR-STANDALONE-PERMISSION-1
 *
 * Exposes: window.SRPermissionManager
 *
 * PURPOSE:
 *   Manages OS/browser permission requests for sensitive capabilities.
 *   Every sensitive action must pass through this manager before execution.
 *
 * SECURITY RULES:
 *   - Permissions are NEVER requested silently or in the background.
 *   - Microphone is NEVER activated without explicit user action.
 *   - Camera is NEVER activated without explicit user action.
 *   - Location is NEVER accessed without explicit user action.
 *   - Shadow Reaper AI text can NEVER trigger a permission request directly.
 *   - All requests are user-initiated only.
 *
 * SENSITIVE CAPABILITIES (require permission request):
 *   microphone, camera, location, notifications, backgroundTasks
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-PERMISSION-1';

  // ─── Capabilities requiring explicit permission ───────────────────────────
  var _PERMISSION_CAPABILITIES = {
    microphone:    { name: 'Microphone', api: 'microphone' },
    camera:        { name: 'Camera', api: 'camera' },
    location:      { name: 'Location', api: 'geolocation' },
    notifications: { name: 'Notifications', api: 'notifications' },
    backgroundTasks: { name: 'Background Tasks', api: null },
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _caps() { return global.SRCapabilityManager || null; }
  var S = { AVAILABLE: 'AVAILABLE', ALLOWED: 'ALLOWED', DENIED: 'DENIED', PERMISSION_REQUIRED: 'PERMISSION_REQUIRED', NOT_SUPPORTED: 'NOT_SUPPORTED' };

  // ─── Request permission for a capability ──────────────────────────────────
  /**
   * request(capability, callback)
   *
   * Requests OS/browser permission for a sensitive capability.
   * Must only be called as a direct result of a user action (click/tap).
   * NEVER call this from AI-generated content or background processes.
   *
   * callback(result):
   *   result.granted: boolean
   *   result.state:   ALLOWED | DENIED | NOT_SUPPORTED
   *   result.reason:  string
   */
  function request(capability, callback) {
    callback = callback || function () {};

    if (!_PERMISSION_CAPABILITIES.hasOwnProperty(capability)) {
      callback({ granted: false, state: S.NOT_SUPPORTED, reason: 'unknown_capability' });
      return;
    }

    var capsMgr = _caps();

    switch (capability) {

      case 'notifications':
        if (!('Notification' in global) || !global.Notification) {
          if (capsMgr) capsMgr.updateState('notifications', S.NOT_SUPPORTED);
          callback({ granted: false, state: S.NOT_SUPPORTED, reason: 'api_unavailable' });
          return;
        }
        if (global.Notification.permission === 'granted') {
          if (capsMgr) capsMgr.updateState('notifications', S.ALLOWED);
          callback({ granted: true, state: S.ALLOWED, reason: 'already_granted' });
          return;
        }
        if (global.Notification.permission === 'denied') {
          if (capsMgr) capsMgr.updateState('notifications', S.DENIED);
          callback({ granted: false, state: S.DENIED, reason: 'previously_denied' });
          return;
        }
        Notification.requestPermission().then(function (result) {
          var state = result === 'granted' ? S.ALLOWED : S.DENIED;
          if (capsMgr) capsMgr.updateState('notifications', state);
          callback({ granted: result === 'granted', state: state, reason: result });
        }).catch(function (err) {
          if (capsMgr) capsMgr.updateState('notifications', S.DENIED);
          callback({ granted: false, state: S.DENIED, reason: err.message || 'request_failed' });
        });
        return;

      case 'microphone':
        if (!global.navigator || !global.navigator.mediaDevices || !global.navigator.mediaDevices.getUserMedia) {
          if (capsMgr) capsMgr.updateState('microphone', S.NOT_SUPPORTED);
          callback({ granted: false, state: S.NOT_SUPPORTED, reason: 'api_unavailable' });
          return;
        }
        global.navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          .then(function (stream) {
            // Immediately stop the stream — we only needed the permission
            stream.getTracks().forEach(function (t) { t.stop(); });
            if (capsMgr) capsMgr.updateState('microphone', S.ALLOWED);
            callback({ granted: true, state: S.ALLOWED, reason: 'granted' });
          })
          .catch(function (err) {
            var state = (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') ? S.DENIED : S.NOT_SUPPORTED;
            if (capsMgr) capsMgr.updateState('microphone', state);
            callback({ granted: false, state: state, reason: err.name || err.message || 'denied' });
          });
        return;

      case 'camera':
        if (!global.navigator || !global.navigator.mediaDevices || !global.navigator.mediaDevices.getUserMedia) {
          if (capsMgr) capsMgr.updateState('camera', S.NOT_SUPPORTED);
          callback({ granted: false, state: S.NOT_SUPPORTED, reason: 'api_unavailable' });
          return;
        }
        global.navigator.mediaDevices.getUserMedia({ audio: false, video: true })
          .then(function (stream) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            if (capsMgr) capsMgr.updateState('camera', S.ALLOWED);
            callback({ granted: true, state: S.ALLOWED, reason: 'granted' });
          })
          .catch(function (err) {
            var state = (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') ? S.DENIED : S.NOT_SUPPORTED;
            if (capsMgr) capsMgr.updateState('camera', state);
            callback({ granted: false, state: state, reason: err.name || err.message || 'denied' });
          });
        return;

      case 'location':
        if (!global.navigator || !global.navigator.geolocation) {
          if (capsMgr) capsMgr.updateState('location', S.NOT_SUPPORTED);
          callback({ granted: false, state: S.NOT_SUPPORTED, reason: 'api_unavailable' });
          return;
        }
        global.navigator.geolocation.getCurrentPosition(
          function () {
            if (capsMgr) capsMgr.updateState('location', S.ALLOWED);
            callback({ granted: true, state: S.ALLOWED, reason: 'granted' });
          },
          function (err) {
            var state = err.code === 1 ? S.DENIED : S.NOT_SUPPORTED;
            if (capsMgr) capsMgr.updateState('location', state);
            callback({ granted: false, state: state, reason: err.message || 'denied' });
          },
          { timeout: 5000 }
        );
        return;

      case 'backgroundTasks':
        if (!global.navigator || !global.navigator.serviceWorker) {
          if (capsMgr) capsMgr.updateState('backgroundTasks', S.NOT_SUPPORTED);
          callback({ granted: false, state: S.NOT_SUPPORTED, reason: 'service_worker_unavailable' });
          return;
        }
        // Service worker registration is the permission mechanism
        callback({ granted: true, state: S.AVAILABLE, reason: 'service_worker_available' });
        return;

      default:
        callback({ granted: false, state: S.NOT_SUPPORTED, reason: 'not_implemented' });
    }
  }

  // ─── Check current permission state (async, uses Permissions API) ─────────
  function checkPermission(capability, callback) {
    callback = callback || function () {};

    if (!global.navigator || !global.navigator.permissions) {
      // Fall back to capability manager state
      var capsMgr = _caps();
      if (capsMgr) {
        callback({ state: capsMgr.getState(capability) });
      } else {
        callback({ state: S.NOT_SUPPORTED });
      }
      return;
    }

    var permName = capability === 'microphone' ? 'microphone'
                 : capability === 'camera'     ? 'camera'
                 : capability === 'location'   ? 'geolocation'
                 : capability === 'notifications' ? 'notifications'
                 : null;

    if (!permName) {
      var capsMgr2 = _caps();
      callback({ state: capsMgr2 ? capsMgr2.getState(capability) : S.NOT_SUPPORTED });
      return;
    }

    global.navigator.permissions.query({ name: permName }).then(function (result) {
      var state = result.state === 'granted'  ? S.ALLOWED
               : result.state === 'denied'   ? S.DENIED
               : S.PERMISSION_REQUIRED;
      var capsMgr3 = _caps();
      if (capsMgr3) capsMgr3.updateState(capability, state);
      callback({ state: state, permissionState: result.state });
    }).catch(function () {
      callback({ state: S.NOT_SUPPORTED });
    });
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRPermissionManager = {
    build:           BUILD_ID,

    request:         request,
    checkPermission: checkPermission,

    // The list of capabilities that require explicit permission
    PERMISSION_CAPABILITIES: Object.keys(_PERMISSION_CAPABILITIES),
  };

})(typeof window !== 'undefined' ? window : global);
