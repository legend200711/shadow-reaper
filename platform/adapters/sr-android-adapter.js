/**
 * shadow-reaper-standalone/platform/adapters/sr-android-adapter.js
 * Shadow Reaper Standalone — Android Native Adapter
 *
 * Build: SR-STANDALONE-ANDROID-ADAPTER-3
 *
 * Exposes: window.SRAndroidAdapter
 *
 * PURPOSE:
 *   Android-specific capability wrappers using Capacitor plugins.
 *   Only active in ANDROID_NATIVE runtime.
 *   Delegates all actions through SRDeviceActionRouter (permission pipeline
 *   is always enforced — bypasses are not possible).
 *
 * CAPACITOR PLUGINS USED:
 *   @capacitor/local-notifications  — scheduled reminders
 *   @capacitor/haptics              — haptic feedback
 *   @capacitor/geolocation          — location
 *   @capacitor/share                — native share sheet
 *   @capacitor/clipboard            — clipboard read/write
 *   @capacitor/camera               — photo picker
 *   ShadowReaperBridge (custom)     — openApp, openUrl, vibrate, permissions
 *
 * SECURITY:
 *   - All capabilities go through SRDeviceActionRouter.
 *   - Permissions are requested via SRPermissionManager or ShadowReaperBridgePlugin.
 *   - No capability is activated without user initiation.
 *   - Android system permissions are never bypassed.
 *   - The ShadowReaperBridgePlugin does NOT expose arbitrary code execution.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-ANDROID-ADAPTER-3';

  function _platform() { return global.SRPlatformDetector   || null; }
  function _router()   { return global.SRDeviceActionRouter || null; }
  function _caps()     { return global.SRCapabilityManager  || null; }
  function _perms()    { return global.SRPermissionManager  || null; }

  function _isActiveRuntime() {
    var p = _platform();
    return p && p.isAndroid();
  }

  // ─── Capacitor plugin accessor ────────────────────────────────────────────
  function _cap(pluginName) {
    return (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins[pluginName])
      ? global.Capacitor.Plugins[pluginName]
      : null;
  }

  // ─── Get supported capabilities for this Android runtime ─────────────────
  function getSupportedCapabilities() {
    var caps = _caps();
    if (!caps) return [];
    return caps.getVisibleCapabilities().filter(function (k) {
      var s = caps.getState(k);
      return s !== 'NOT_SUPPORTED';
    });
  }

  // ─── Request notification permission ──────────────────────────────────────
  function requestNotificationPermission(callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var srBridge = _cap('ShadowReaperBridge');
    if (srBridge) {
      srBridge.requestPermission({ permission: 'notifications' })
        .then(function (r) { if (callback) callback({ ok: r.ok, state: r.state }); })
        .catch(function (e) { if (callback) callback({ ok: false, reason: e.message }); });
      return;
    }
    // Fallback to SRPermissionManager (web Notification API)
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

  // ─── Open another app (by package name or URL) ────────────────────────────
  function openApp(packageNameOrUrl, callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var router = _router();
    if (!router) { if (callback) callback({ ok: false, reason: 'router_unavailable' }); return; }

    var params;
    if (/^https?:\/\//i.test(packageNameOrUrl)) {
      params = { url: packageNameOrUrl };
    } else {
      params = { packageName: packageNameOrUrl };
    }

    router.dispatch({ type: router.ALLOWED_ACTIONS.OPEN_APP, params: params }, callback);
  }

  // ─── Share content ────────────────────────────────────────────────────────
  function shareContent(text, title, callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var router = _router();
    if (!router) { if (callback) callback({ ok: false, reason: 'router_unavailable' }); return; }
    router.dispatch({
      type: router.ALLOWED_ACTIONS.SHARE_TEXT,
      params: { text: text, title: title || '' },
    }, callback);
  }

  // ─── Copy to clipboard ────────────────────────────────────────────────────
  function copyToClipboard(text, callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var router = _router();
    if (!router) { if (callback) callback({ ok: false, reason: 'router_unavailable' }); return; }
    router.dispatch({
      type: router.ALLOWED_ACTIONS.COPY_TO_CLIPBOARD,
      params: { text: text },
    }, callback);
  }

  // ─── Get network status ───────────────────────────────────────────────────
  function getNetworkStatus(callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var router = _router();
    if (!router) { if (callback) callback({ ok: false, reason: 'router_unavailable' }); return; }
    router.dispatch({ type: router.ALLOWED_ACTIONS.GET_NETWORK_STATUS, params: {} }, callback);
  }

  // ─── Request camera permission ────────────────────────────────────────────
  function requestCameraPermission(callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var srBridge = _cap('ShadowReaperBridge');
    if (srBridge) {
      srBridge.requestPermission({ permission: 'camera' })
        .then(function (r) { if (callback) callback({ ok: r.ok, state: r.state }); })
        .catch(function (e) { if (callback) callback({ ok: false, reason: e.message }); });
      return;
    }
    var pm = _perms();
    if (!pm) { if (callback) callback({ ok: false, reason: 'permission_manager_unavailable' }); return; }
    pm.request('camera', function (r) { if (callback) callback(r); });
  }

  // ─── Request microphone permission ────────────────────────────────────────
  function requestMicrophonePermission(callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var srBridge = _cap('ShadowReaperBridge');
    if (srBridge) {
      srBridge.requestPermission({ permission: 'microphone' })
        .then(function (r) { if (callback) callback({ ok: r.ok, state: r.state }); })
        .catch(function (e) { if (callback) callback({ ok: false, reason: e.message }); });
      return;
    }
    var pm = _perms();
    if (!pm) { if (callback) callback({ ok: false, reason: 'permission_manager_unavailable' }); return; }
    pm.request('microphone', function (r) { if (callback) callback(r); });
  }

  // ─── Request location permission ──────────────────────────────────────────
  function requestLocationPermission(callback) {
    if (!_isActiveRuntime()) { if (callback) callback({ ok: false, reason: 'not_android' }); return; }
    var srBridge = _cap('ShadowReaperBridge');
    if (srBridge) {
      srBridge.requestPermission({ permission: 'location' })
        .then(function (r) { if (callback) callback({ ok: r.ok, state: r.state }); })
        .catch(function (e) { if (callback) callback({ ok: false, reason: e.message }); });
      return;
    }
    var pm = _perms();
    if (!pm) { if (callback) callback({ ok: false, reason: 'permission_manager_unavailable' }); return; }
    pm.request('location', function (r) { if (callback) callback(r); });
  }

  // ─── Check native runtime and Capacitor availability ─────────────────────
  // hasCapacitor uses isNativePlatform() — the authoritative Capacitor 8.x API.
  // Do NOT use Capacitor.isNative (property) — it may be unset during early
  // WebView initialization and is a legacy alias.
  function getRuntimeInfo() {
    var plat = _platform();
    return {
      isAndroid:         _isActiveRuntime(),
      hasCapacitor:      !!(plat && typeof plat.isCapacitorNative === 'function'
                            ? plat.isCapacitorNative()
                            : (global.Capacitor &&
                               typeof global.Capacitor.isNativePlatform === 'function' &&
                               global.Capacitor.isNativePlatform())),
      capacitorPlatform: (global.Capacitor && typeof global.Capacitor.getPlatform === 'function')
                            ? global.Capacitor.getPlatform()
                            : 'unknown',
      hasBridge:         !!_cap('ShadowReaperBridge'),
      hasLocalNotif:     !!_cap('LocalNotifications'),
      hasHaptics:        !!_cap('Haptics'),
      hasGeolocation:    !!_cap('Geolocation'),
      hasShare:          !!_cap('Share'),
      hasClipboard:      !!_cap('Clipboard'),
      hasCamera:         !!_cap('Camera'),
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRAndroidAdapter = {
    build:                         BUILD_ID,
    isActiveRuntime:               _isActiveRuntime,
    getSupportedCapabilities:      getSupportedCapabilities,
    requestNotificationPermission: requestNotificationPermission,
    scheduleReminder:              scheduleReminder,
    vibrate:                       vibrate,
    openApp:                       openApp,
    shareContent:                  shareContent,
    copyToClipboard:               copyToClipboard,
    getNetworkStatus:              getNetworkStatus,
    requestCameraPermission:       requestCameraPermission,
    requestMicrophonePermission:   requestMicrophonePermission,
    requestLocationPermission:     requestLocationPermission,
    getRuntimeInfo:                getRuntimeInfo,
  };

})(typeof window !== 'undefined' ? window : global);
