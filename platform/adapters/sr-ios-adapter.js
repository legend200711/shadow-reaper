/**
 * shadow-reaper-standalone/platform/adapters/sr-ios-adapter.js
 * Shadow Reaper Standalone — iOS Native Adapter
 *
 * Build: SR-STANDALONE-IOS-ADAPTER-1
 *
 * Exposes: window.SRIOSAdapter
 *
 * PURPOSE:
 *   iOS-specific capability wrappers using Capacitor plugins.
 *   Only active in IOS_NATIVE runtime.
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
 *
 * SECURITY:
 *   - All capabilities go through SRDeviceActionRouter.
 *   - iOS system permissions (NSMicrophoneUsageDescription etc.) are always
 *     required and must be declared in Info.plist before packaging.
 *   - Permissions are requested via SRPermissionManager.
 *   - No capability is activated without user initiation.
 *   - iOS App Store review requirements must be met for all used permissions.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-IOS-ADAPTER-1';

  function _platform() { return global.SRPlatformDetector   || null; }
  function _router()   { return global.SRDeviceActionRouter || null; }
  function _caps()     { return global.SRCapabilityManager  || null; }
  function _perms()    { return global.SRPermissionManager  || null; }

  function _isActiveRuntime() {
    var p = _platform();
    return p && p.isIOS();
  }

  // ─── Get supported capabilities for this iOS runtime ──────────────────────
  function getSupportedCapabilities() {
    var caps = _caps();
    if (!caps) return [];
    return caps.getVisibleCapabilities().filter(function (k) {
      return caps.getState(k) !== (caps.STATE ? caps.STATE.NOT_SUPPORTED : 'NOT_SUPPORTED');
    });
  }

  // ─── Request notification permission ──────────────────────────────────────
  function requestNotificationPermission(callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_ios' }); return; }
    var pm = _perms();
    if (!pm) { if (callback) callback({ ok: false, reason: 'permission_manager_unavailable' }); return; }
    pm.request('notifications', function (r) { if (callback) callback(r); });
  }

  // ─── Schedule reminder ────────────────────────────────────────────────────
  function scheduleReminder(title, body, atISO, callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_ios' }); return; }
    var router = _router();
    if (!router) { if (callback) callback({ ok: false, reason: 'router_unavailable' }); return; }
    router.dispatch({
      type: router.ALLOWED_ACTIONS.SCHEDULE_REMINDER,
      params: { title: title, body: body, at: atISO },
    }, callback);
  }

  // ─── Haptic feedback ──────────────────────────────────────────────────────
  function vibrate(style, callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_ios' }); return; }
    // iOS: Capacitor Haptics supports ImpactStyle, NotificationStyle
    var haptics = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Haptics;
    if (haptics && haptics.impact) {
      haptics.impact({ style: style || 'MEDIUM' })
        .then(function () { if (callback) callback({ ok: true }); })
        .catch(function (e) { if (callback) callback({ ok: false, reason: e.message }); });
      return;
    }
    if (callback) callback({ ok: false, reason: 'haptics_not_available' });
  }

  // ─── iOS Info.plist required keys (documentation) ─────────────────────────
  var INFO_PLIST_KEYS = [
    'NSMicrophoneUsageDescription — required if voice input is used',
    'NSCameraUsageDescription — required if camera is used',
    'NSLocationWhenInUseUsageDescription — required if location is used',
    'NSPhotoLibraryUsageDescription — required if photo picker is used',
  ];

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRIOSAdapter = {
    build:                    BUILD_ID,
    isActiveRuntime:          _isActiveRuntime,
    getSupportedCapabilities: getSupportedCapabilities,
    requestNotificationPermission: requestNotificationPermission,
    scheduleReminder:         scheduleReminder,
    vibrate:                  vibrate,
    INFO_PLIST_KEYS:          INFO_PLIST_KEYS,
  };

})(typeof window !== 'undefined' ? window : global);
