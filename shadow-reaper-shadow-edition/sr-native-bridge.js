/**
 * shadow-reaper-v2/sr-native-bridge.js
 * Shadow Reaper — Native Bridge Boundary Layer
 *
 * Build: SR-V2-NATIVE-BRIDGE-1
 *
 * Exposes: window.SRNativeBridge
 *
 * PURPOSE:
 *   Single, clearly-defined boundary between the Shadow Reaper web/PWA core
 *   and any native Android (or future iOS) capabilities.
 *
 *   Structured native action intents pass through here.
 *   If the native bridge is not available, every call returns a truthful
 *   BRIDGE_UNAVAILABLE result — never a fake success.
 *
 * NATIVE ACTION INTENTS:
 *   CALL_CONTACT      — initiate a phone call
 *   SEND_MESSAGE      — send an SMS/message
 *   OPEN_APP          — launch a named application
 *   SET_ALARM         — create an alarm
 *   SET_TIMER         — start a countdown timer
 *   SET_VOLUME        — change device volume
 *   MEDIA_ACTION      — media transport controls
 *   DEVICE_ACTION     — route to existing device adapter
 *   GET_CONTACTS      — read contacts list
 *   GET_LOCATION      — get current location
 *   NOTIFICATION      — post a local notification
 *
 * BRIDGE DETECTION:
 *   The native bridge is detected via window.Capacitor.isNativePlatform().
 *   In web/PWA mode the bridge is UNAVAILABLE for native-only actions.
 *   Native-available actions (notifications, media via MediaSession) may be
 *   available in web mode and are handled by platform adapters.
 *
 * ARCHITECTURE:
 *   ShadowReaper.ask() → Device/Platform router → SRNativeBridge.dispatch()
 *   → native plugin call OR capability-unavailable result
 *
 * ZERO FAKE SUCCESSES.
 * ZERO CREDENTIALS IN THIS FILE.
 * ZERO DIRECT DOM MANIPULATION.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-NATIVE-BRIDGE-1';

  // ─── Result codes ─────────────────────────────────────────────────────────
  var RESULT = {
    OK:                  'OK',
    BRIDGE_UNAVAILABLE:  'BRIDGE_UNAVAILABLE',
    PERMISSION_DENIED:   'PERMISSION_DENIED',
    NOT_IMPLEMENTED:     'NOT_IMPLEMENTED',
    ERROR:               'ERROR',
  };

  // ─── Native-only intents (unavailable in web/PWA mode) ────────────────────
  var NATIVE_ONLY_INTENTS = [
    'CALL_CONTACT',
    'SEND_MESSAGE',
    'GET_CONTACTS',
    'SET_ALARM',
    'GET_LOCATION',
  ];

  // ─── Web-available intents (may work without native bridge) ───────────────
  var WEB_AVAILABLE_INTENTS = [
    'SET_TIMER',
    'SET_VOLUME',
    'MEDIA_ACTION',
    'NOTIFICATION',
    'DEVICE_ACTION',
    'OPEN_APP',
  ];

  // ─── State ────────────────────────────────────────────────────────────────
  var _bridgeReady = false;
  var _stateCallbacks = [];

  // ─── Bridge detection ─────────────────────────────────────────────────────
  function _isNativePlatform() {
    var cap = global.Capacitor;
    if (!cap) return false;
    if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
    // Fallback for older Capacitor
    if (cap.platform && cap.platform !== 'web') return true;
    return false;
  }

  function _isNativeAndroid() {
    var plat = global.SRPlatformDetector;
    if (plat && typeof plat.isAndroid === 'function') return plat.isAndroid() && plat.isNative();
    var cap = global.Capacitor;
    if (!cap) return false;
    if (typeof cap.getPlatform === 'function') return cap.getPlatform() === 'android';
    return false;
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    _bridgeReady = _isNativePlatform();
    _stateCallbacks.forEach(function (fn) {
      try { fn(_bridgeReady); } catch (e) {}
    });
  }

  // ─── Bridge availability queries ──────────────────────────────────────────
  function isAvailable() {
    return _bridgeReady;
  }

  function canDispatch(intentType) {
    if (!intentType) return false;
    var t = intentType.toUpperCase();
    if (WEB_AVAILABLE_INTENTS.indexOf(t) !== -1) return true;
    if (NATIVE_ONLY_INTENTS.indexOf(t) !== -1) return _bridgeReady;
    // DEVICE_ACTION always routed to device adapter layer
    if (t === 'DEVICE_ACTION') return true;
    return _bridgeReady;
  }

  function getNativeStatus() {
    return {
      bridgeAvailable:  _bridgeReady,
      isNative:         _isNativePlatform(),
      isAndroid:        _isNativeAndroid(),
      capacitorFound:   !!global.Capacitor,
      nativeOnlyIntents: NATIVE_ONLY_INTENTS.slice(),
      webAvailableIntents: WEB_AVAILABLE_INTENTS.slice(),
    };
  }

  // ─── Dispatch ─────────────────────────────────────────────────────────────
  /**
   * dispatch(intent, callback)
   *
   * intent: {
   *   type:    'CALL_CONTACT' | 'SEND_MESSAGE' | 'OPEN_APP' | 'SET_ALARM' |
   *            'SET_TIMER' | 'SET_VOLUME' | 'MEDIA_ACTION' | 'DEVICE_ACTION' |
   *            'GET_CONTACTS' | 'GET_LOCATION' | 'NOTIFICATION'
   *   payload: { ... }  // type-specific parameters
   * }
   *
   * callback: function(result)
   *   result: {
   *     ok:       boolean
   *     result:   RESULT.*
   *     message:  string (human-readable, safe to show user)
   *     data:     any (action-specific response data)
   *   }
   */
  function dispatch(intent, callback) {
    if (typeof callback !== 'function') callback = function () {};
    if (!intent || !intent.type) {
      return callback({ ok: false, result: RESULT.ERROR, message: 'No intent type specified.' });
    }

    var type = intent.type.toUpperCase();

    // ── Native-only: check bridge availability first ─────────────────────
    if (NATIVE_ONLY_INTENTS.indexOf(type) !== -1) {
      if (!_bridgeReady) {
        return callback({
          ok:      false,
          result:  RESULT.BRIDGE_UNAVAILABLE,
          message: type + ' requires the Android app. This capability is not available in the web version.',
          data:    null,
        });
      }
      return _dispatchNative(type, intent.payload || {}, callback);
    }

    // ── DEVICE_ACTION: route to device adapter layer ─────────────────────
    if (type === 'DEVICE_ACTION') {
      return _dispatchDevice(intent.payload || {}, callback);
    }

    // ── Web-available: attempt web adapter then fall back honestly ────────
    if (WEB_AVAILABLE_INTENTS.indexOf(type) !== -1) {
      return _dispatchWeb(type, intent.payload || {}, callback);
    }

    // Unknown intent type
    callback({
      ok:      false,
      result:  RESULT.NOT_IMPLEMENTED,
      message: 'Intent type "' + type + '" is not recognized.',
      data:    null,
    });
  }

  // ─── Native dispatch (Capacitor plugin layer) ─────────────────────────────
  function _dispatchNative(type, payload, callback) {
    var cap = global.Capacitor;
    var bridge = cap && cap.Plugins && cap.Plugins.ShadowReaperBridge;
    if (!bridge) {
      return callback({
        ok:      false,
        result:  RESULT.BRIDGE_UNAVAILABLE,
        message: 'ShadowReaperBridge plugin not found in Capacitor. Ensure the Android app is built with the native bridge plugin.',
        data:    null,
      });
    }
    var methodMap = {
      CALL_CONTACT:  'callContact',
      SEND_MESSAGE:  'sendMessage',
      GET_CONTACTS:  'getContacts',
      SET_ALARM:     'setAlarm',
      GET_LOCATION:  'getLocation',
    };
    var method = methodMap[type];
    if (!method || typeof bridge[method] !== 'function') {
      return callback({
        ok:      false,
        result:  RESULT.NOT_IMPLEMENTED,
        message: type + ' bridge method not available in current build.',
        data:    null,
      });
    }
    bridge[method](payload)
      .then(function (data) {
        callback({ ok: true, result: RESULT.OK, message: 'OK', data: data });
      })
      .catch(function (err) {
        callback({
          ok:      false,
          result:  RESULT.ERROR,
          message: (err && err.message) ? err.message : 'Native bridge error.',
          data:    null,
        });
      });
  }

  // ─── Device action dispatch (existing device adapter layer) ──────────────
  function _dispatchDevice(payload, callback) {
    var router = global.SRDeviceActionRouter;
    if (!router || typeof router.route !== 'function') {
      return callback({
        ok:      false,
        result:  RESULT.BRIDGE_UNAVAILABLE,
        message: 'Device action router not available.',
        data:    null,
      });
    }
    router.route(payload, function (result) {
      callback({ ok: result && result.result === 'SUCCESS', result: (result && result.result) || RESULT.ERROR, message: (result && result.message) || '', data: result });
    });
  }

  // ─── Web adapter dispatch ─────────────────────────────────────────────────
  function _dispatchWeb(type, payload, callback) {
    // Delegate to the web adapter or return honest unavailable
    var webAdapter = global.SRWebAdapter;
    if (webAdapter && typeof webAdapter.dispatch === 'function') {
      return webAdapter.dispatch(type, payload, callback);
    }
    // Minimal web handling for timer/notification
    if (type === 'SET_TIMER') {
      callback({ ok: false, result: RESULT.BRIDGE_UNAVAILABLE, message: 'Timer creation requires the Android app for native alarm integration. Web timers are not yet implemented.', data: null });
    } else if (type === 'NOTIFICATION') {
      callback({ ok: false, result: RESULT.BRIDGE_UNAVAILABLE, message: 'Persistent notifications require the Android app or browser notification permission.', data: null });
    } else {
      callback({ ok: false, result: RESULT.NOT_IMPLEMENTED, message: type + ' is not available in web mode.', data: null });
    }
  }

  // ─── State change callbacks ────────────────────────────────────────────────
  function onBridgeReady(fn) {
    if (typeof fn === 'function') _stateCallbacks.push(fn);
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  global.SRNativeBridge = {
    BUILD_ID:       BUILD_ID,
    RESULT:         RESULT,
    NATIVE_ONLY:    NATIVE_ONLY_INTENTS,
    WEB_AVAILABLE:  WEB_AVAILABLE_INTENTS,
    init:           init,
    isAvailable:    isAvailable,
    canDispatch:    canDispatch,
    dispatch:       dispatch,
    getNativeStatus:getNativeStatus,
    onBridgeReady:  onBridgeReady,
  };

}(typeof window !== 'undefined' ? window : global));
