/**
 * shadow-reaper-standalone/platform/adapters/sr-android-adapter.js
 * Shadow Reaper Standalone — Android Native Adapter
 *
 * Build: SR-STANDALONE-ANDROID-ADAPTER-1
 *
 * Exposes: window.SRAndroidAdapter
 *
 * PURPOSE:
 *   Android-specific capability wrappers using Capacitor plugins.
 *   Only active in ANDROID_NATIVE runtime.
 *   Delegates all actions through SRDeviceActionRouter (permission pipeline
 *   is always enforced — bypasses are not possible).
 *
 * REQUIRED CAPACITOR PLUGINS (install if building native):
 *   @capacitor/local-notifications
 *   @capacitor/haptics
 *   @capacitor/geolocation
 *   @capacitor/share
 *   @capacitor/clipboard
 *   @capacitor/camera
 *   @capacitor/filesystem   (user-selected files only)
 *
 * SECURITY:
 *   - All capabilities go through SRDeviceActionRouter.
 *   - Permissions are requested via SRPermissionManager.
 *   - No capability is activated without user initiation.
 *   - Android system permissions are never bypassed.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-ANDROID-ADAPTER-1';

  function _platform() { return global.SRPlatformDetector   || null; }
  function _router()   { return global.SRDeviceActionRouter || null; }
  function _caps()     { return global.SRCapabilityManager  || null; }
  function _perms()    { return global.SRPermissionManager  || null; }

  function _isActiveRuntime() {
    var p = _platform();
    return p && p.isAndroid();
  }

  // ─── Check if Capacitor is available ──────────────────────────────────────
  function _cap(pluginName) {
    return global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins[pluginName]
      ? global.Capacitor.Plugins[pluginName]
      : null;
  }

  // ─── Get supported capabilities for this Android runtime ─────────────────
  function getSupportedCapabilities() {
    var caps = _caps();
    if (!caps) return [];
    return caps.getVisibleCapabilities().filter(function (k) {
      return caps.getState(k) !== (caps.STATE ? caps.STATE.NOT_SUPPORTED : 'NOT_SUPPORTED');
    });
  }

  // ─── Request notification permission ──────────────────────────────────────
  function requestNotificationPermission(callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var pm = _perms();
    if (!pm) { if (callback) callback({ ok: false, reason: 'permission_manager_unavailable' }); return; }
    pm.request('notifications', function (r) { if (callback) callback(r); });
  }

  // ─── Schedule reminder ────────────────────────────────────────────────────
  function scheduleReminder(title, body, atISO, callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var router = _router();
    if (!router) { if (callback) callback({ ok: false, reason: 'router_unavailable' }); return; }
    router.dispatch({
      type: router.ALLOWED_ACTIONS.SCHEDULE_REMINDER,
      params: { title: title, body: body, at: atISO },
    }, callback);
  }

  // ─── Haptic feedback ──────────────────────────────────────────────────────
  function vibrate(pattern, callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var router = _router();
    if (!router) { if (callback) callback({ ok: false, reason: 'router_unavailable' }); return; }
    router.dispatch({
      type: router.ALLOWED_ACTIONS.VIBRATE,
      params: { pattern: pattern || [200] },
    }, callback);
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRAndroidAdapter = {
    build:                    BUILD_ID,
    isActiveRuntime:          _isActiveRuntime,
    getSupportedCapabilities: getSupportedCapabilities,
    requestNotificationPermission: requestNotificationPermission,
    scheduleReminder:         scheduleReminder,
    vibrate:                  vibrate,
  };

})(typeof window !== 'undefined' ? window : global);
