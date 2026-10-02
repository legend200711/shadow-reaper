/**
 * shadow-reaper-standalone/platform/adapters/sr-phone-adapter.js
 * Shadow Reaper — Phone Adapter (Android/Phone Control)
 *
 * Build: SR-V2-PHONE-ADAPTER-1
 *
 * Exposes: window.SRPhoneAdapter
 *
 * PURPOSE:
 *   Interface boundary between ShadowReaper's DeviceActionRouter
 *   and future Android-native phone capabilities.
 *
 *   ARCHITECTURE:
 *   ShadowReaper → intent/action decision
 *   → DeviceActionRouter
 *   → SRPhoneAdapter (this file)
 *   → Android native capability (future native layer)
 *
 * CURRENT STATUS (PWA/Web):
 *   Running as a PWA or web app. Native phone capabilities are NOT available.
 *   This adapter correctly reports each capability as WEB_ONLY or NATIVE_REQUIRED.
 *   It NEVER falsely reports success for capabilities that require Android native.
 *
 * FUTURE STATUS (Android Native):
 *   When the native Android layer is integrated via Capacitor/ShadowReaperBridge,
 *   this adapter will bridge to real Android APIs.
 *
 * CAPABILITY CLASSIFICATION:
 *   WEB_PWA       — Available now in web/PWA context
 *   NATIVE_REQUIRED — Requires Android native integration (future)
 *   PERMISSION_REQUIRED — Available but requires explicit Android permission grant
 *   UNSUPPORTED   — Not supported on this platform/device
 *
 * SECURITY:
 *   - All phone actions route through DeviceActionRouter (permission pipeline)
 *   - No phone action is taken without explicit owner initiation
 *   - Accessibility Service is NOT used as a generic control workaround
 *   - Only supported Android APIs appropriate to each capability are used
 *   - External callers cannot initiate phone actions (CallerContext enforced)
 *
 * ZERO EXTERNAL AI CALLS. ZERO POLLING. ZERO setInterval.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-PHONE-ADAPTER-1';

  // ─── Capability status codes ─────────────────────────────────────────────

  var STATUS = {
    WEB_PWA:            'WEB_PWA',            // available in current PWA context
    NATIVE_REQUIRED:    'NATIVE_REQUIRED',    // needs Android native layer
    PERMISSION_REQUIRED:'PERMISSION_REQUIRED',// available but needs permission
    UNSUPPORTED:        'UNSUPPORTED',        // not supported on this platform
    COMING_LATER:       'COMING_LATER',       // planned for future stage
  };

  // ─── Platform detector ───────────────────────────────────────────────────

  function _isAndroidNative() {
    var p = global.SRPlatformDetector;
    return p && typeof p.isAndroid === 'function' && p.isAndroid() &&
           global.Capacitor && global.Capacitor.isNativePlatform &&
           global.Capacitor.isNativePlatform();
  }

  function _isWeb() {
    return !_isAndroidNative();
  }

  // ─── Capability map ───────────────────────────────────────────────────────
  //
  // Each entry: { label, status, androidApi, description }
  //
  // This is the single source of truth for the "This Phone" settings panel.
  // Every entry must be truthful about its current state.

  var PHONE_CAPABILITIES = {

    // ── Phone status ────────────────────────────────────────────────────────
    phone_status: {
      label:       'Phone Status',
      description: 'Battery, signal, network, storage.',
      androidApi:  'DeviceInfo (Capacitor)',
      webStatus:   STATUS.WEB_PWA,          // navigator.battery, navigator.connection
      nativeStatus: STATUS.WEB_PWA,
    },

    // ── Permissions ─────────────────────────────────────────────────────────
    permissions: {
      label:       'Permission Management',
      description: 'Request and check Android permissions.',
      androidApi:  'ShadowReaperBridgePlugin / @capacitor/core Permissions',
      webStatus:   STATUS.NATIVE_REQUIRED,
      nativeStatus: STATUS.PERMISSION_REQUIRED,
    },

    // ── Contacts ────────────────────────────────────────────────────────────
    contacts: {
      label:       'Contacts',
      description: 'Read contact names for calling and messaging.',
      androidApi:  '@capacitor-community/contacts (READ_CONTACTS)',
      webStatus:   STATUS.NATIVE_REQUIRED,
      nativeStatus: STATUS.PERMISSION_REQUIRED,
    },

    // ── Calling ─────────────────────────────────────────────────────────────
    calling: {
      label:       'Phone Calls',
      description: 'Initiate, manage, and monitor calls.',
      androidApi:  'Android Telecom API via ShadowReaperBridgePlugin (CALL_PHONE)',
      webStatus:   STATUS.NATIVE_REQUIRED,
      nativeStatus: STATUS.PERMISSION_REQUIRED,
    },

    // ── Messaging ───────────────────────────────────────────────────────────
    messaging: {
      label:       'Messages / SMS',
      description: 'Read and send SMS messages.',
      androidApi:  'Android SMS API via ShadowReaperBridgePlugin (SEND_SMS, READ_SMS)',
      webStatus:   STATUS.NATIVE_REQUIRED,
      nativeStatus: STATUS.PERMISSION_REQUIRED,
    },

    // ── Volume & media ──────────────────────────────────────────────────────
    volume: {
      label:       'Volume Control',
      description: 'Adjust media, ringtone, and call volumes.',
      androidApi:  'ShadowReaperBridgePlugin AudioManager',
      webStatus:   STATUS.NATIVE_REQUIRED,
      nativeStatus: STATUS.PERMISSION_REQUIRED,
    },

    media_controls: {
      label:       'Media Controls',
      description: 'Play, pause, skip media playback.',
      androidApi:  'MediaSession / ShadowReaperBridgePlugin MediaButtonReceiver',
      webStatus:   STATUS.WEB_PWA,          // MediaSession API available in web
      nativeStatus: STATUS.WEB_PWA,
    },

    // ── Alarms & timers ─────────────────────────────────────────────────────
    alarms: {
      label:       'Alarms',
      description: 'Set and manage alarms.',
      androidApi:  'AlarmManager via ShadowReaperBridgePlugin (SET_ALARM)',
      webStatus:   STATUS.NATIVE_REQUIRED,
      nativeStatus: STATUS.PERMISSION_REQUIRED,
    },

    timers: {
      label:       'Timers',
      description: 'Set countdown timers.',
      androidApi:  'AlarmManager via ShadowReaperBridgePlugin (SET_TIMER)',
      webStatus:   STATUS.NATIVE_REQUIRED,
      nativeStatus: STATUS.PERMISSION_REQUIRED,
    },

    // ── App launching ────────────────────────────────────────────────────────
    app_launch: {
      label:       'App Launching',
      description: 'Open other apps by name or package.',
      androidApi:  'ShadowReaperBridgePlugin Intent.ACTION_VIEW',
      webStatus:   STATUS.NATIVE_REQUIRED,
      nativeStatus: STATUS.PERMISSION_REQUIRED,
    },

    // ── Notifications ────────────────────────────────────────────────────────
    notifications: {
      label:       'Notifications',
      description: 'Send local notifications from Shadow.',
      androidApi:  '@capacitor/local-notifications (POST_NOTIFICATIONS)',
      webStatus:   STATUS.PERMISSION_REQUIRED,  // Web Notification API
      nativeStatus: STATUS.PERMISSION_REQUIRED,
    },

    // ── Background / wake ────────────────────────────────────────────────────
    background_wake: {
      label:       'Background Availability',
      description: 'Keep Shadow available in the background.',
      androidApi:  'ForegroundService / WorkManager via ShadowReaperBridgePlugin',
      webStatus:   STATUS.NATIVE_REQUIRED,
      nativeStatus: STATUS.PERMISSION_REQUIRED,
    },

  };

  // ─── Get capability status for current runtime ────────────────────────────

  function getCapabilityStatus(key) {
    var cap = PHONE_CAPABILITIES[key];
    if (!cap) return STATUS.UNSUPPORTED;
    return _isAndroidNative() ? cap.nativeStatus : cap.webStatus;
  }

  function getAllCapabilities() {
    var result = {};
    Object.keys(PHONE_CAPABILITIES).forEach(function (key) {
      var cap = PHONE_CAPABILITIES[key];
      result[key] = {
        label:        cap.label,
        description:  cap.description,
        androidApi:   cap.androidApi,
        status:       getCapabilityStatus(key),
        isNative:     _isAndroidNative(),
      };
    });
    return result;
  }

  // ─── Check if running in native context ──────────────────────────────────

  function isNativeAndroid() { return _isAndroidNative(); }
  function isWebPWA()        { return _isWeb(); }

  // ─── Calling mode support ─────────────────────────────────────────────────
  //
  // These methods represent the future calling architecture.
  // None of these perform actual calling — they prepare the interface
  // that will be activated when the native layer is integrated.

  function getCallingModeSupport() {
    return {
      modeA_normalCall:         { supported: false, requirement: 'NATIVE_REQUIRED', description: 'User calls normally — Shadow observes if call audio permission granted' },
      modeB_shadowAssisted:     { supported: false, requirement: 'NATIVE_REQUIRED', description: 'Shadow assists on request during active call' },
      modeC_handToShadow:       { supported: false, requirement: 'NATIVE_REQUIRED', description: 'Shadow takes over call conversation (identifies as AI)' },
      modeD_returnToOwner:      { supported: false, requirement: 'NATIVE_REQUIRED', description: 'Owner reclaims call from Shadow' },
      modeE_shadowHandlesCall:  { supported: false, requirement: 'NATIVE_REQUIRED', description: 'Shadow conducts authorized limited call (e.g. "Tell John I\'m late")' },
      modeF_externalCallerDirect:{ supported: true,  requirement: 'WEB_PWA',         description: 'Authorized contact talks directly with Shadow via conversation UI' },
    };
  }

  // ─── Execute a phone action ───────────────────────────────────────────────
  //
  // All phone actions route through DeviceActionRouter.
  // This method is the final adapter — it bridges to native APIs.

  function execute(device, action, params, callback) {
    var capStatus = getCapabilityStatus(action);

    if (capStatus === STATUS.NATIVE_REQUIRED) {
      if (callback) callback({
        ok:     false,
        result: 'NOT_SUPPORTED',
        reason: 'NATIVE_ANDROID_REQUIRED',
        message: 'This capability requires the Android native layer. ' +
                 'It will be available after Android integration in a future stage.',
      });
      return;
    }

    if (capStatus === STATUS.UNSUPPORTED) {
      if (callback) callback({
        ok:     false,
        result: 'NOT_SUPPORTED',
        reason: 'UNSUPPORTED_ON_PLATFORM',
      });
      return;
    }

    // Route to native bridge if available
    var bridge = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.ShadowReaperBridge;
    if (bridge && typeof bridge.executePhoneAction === 'function') {
      bridge.executePhoneAction({ action: action, params: params || {} })
        .then(function (r) { if (callback) callback({ ok: r.ok, result: r.result, data: r.data }); })
        .catch(function (e) { if (callback) callback({ ok: false, result: 'FAILED', reason: e.message }); });
      return;
    }

    // Web fallback for web-available capabilities
    _executeWebFallback(action, params, callback);
  }

  function _executeWebFallback(action, params, callback) {
    switch (action) {
      case 'media_controls':
        // MediaSession API is web-available
        if (global.navigator && global.navigator.mediaSession) {
          if (callback) callback({ ok: true, result: 'SUCCESS', note: 'MediaSession API' });
        } else {
          if (callback) callback({ ok: false, result: 'NOT_SUPPORTED', reason: 'MediaSession unavailable' });
        }
        break;
      case 'notifications':
        if (global.Notification) {
          Notification.requestPermission().then(function (perm) {
            if (callback) callback({ ok: perm === 'granted', result: perm === 'granted' ? 'SUCCESS' : 'NOT_AUTHORIZED', permission: perm });
          });
        } else {
          if (callback) callback({ ok: false, result: 'NOT_SUPPORTED', reason: 'Notifications API unavailable' });
        }
        break;
      case 'phone_status':
        var info = {
          userAgent: global.navigator ? global.navigator.userAgent : 'unknown',
          online: global.navigator ? global.navigator.onLine : null,
          language: global.navigator ? global.navigator.language : null,
        };
        if (callback) callback({ ok: true, result: 'SUCCESS', data: info });
        break;
      default:
        if (callback) callback({ ok: false, result: 'NOT_SUPPORTED', reason: 'No web fallback for: ' + action });
    }
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  function getStatus() {
    return {
      build:          BUILD_ID,
      runtime:        _isAndroidNative() ? 'ANDROID_NATIVE' : 'WEB_PWA',
      capabilities:   getAllCapabilities(),
      callingModes:   getCallingModeSupport(),
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRPhoneAdapter = {
    build:                BUILD_ID,
    STATUS:               STATUS,

    // Runtime
    isNativeAndroid:      isNativeAndroid,
    isWebPWA:             isWebPWA,

    // Capabilities
    PHONE_CAPABILITIES:   PHONE_CAPABILITIES,
    getCapabilityStatus:  getCapabilityStatus,
    getAllCapabilities:    getAllCapabilities,
    getCallingModeSupport: getCallingModeSupport,

    // Execution (via DeviceActionRouter)
    execute:              execute,

    // Status
    getStatus:            getStatus,
  };

}(typeof window !== 'undefined' ? window : global));
