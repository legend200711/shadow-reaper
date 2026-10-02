/**
 * shadow-reaper-standalone/platform/sr-native-diagnostics.js
 * Shadow Reaper Standalone — Native Runtime Diagnostics
 *
 * Build: SR-STANDALONE-NATIVE-DIAG-1
 *
 * Exposes: window.SRNativeDiagnostics
 *
 * PURPOSE:
 *   Safe internal diagnostics for verifying the native Android bridge
 *   at runtime. Renders a read-only status panel inside the app for
 *   physical device testing.
 *
 * SECURITY:
 *   - Reports runtime/permission state ONLY. No tokens, passwords,
 *     private keys, Firebase secrets, or user data are ever included.
 *   - This module is safe to ship in production builds.
 *   - The panel is hidden by default; it must be explicitly shown via
 *     SRNativeDiagnostics.show() or the in-settings "Diagnostics" button.
 *   - Panel can be removed by calling SRNativeDiagnostics.hide().
 *
 * PHYSICAL TEST REQUIREMENT:
 *   Automated tests cannot verify the Android device bridge.
 *   Results marked PHYSICAL TEST REQUIRED must be confirmed on-device.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-NATIVE-DIAG-1';

  // ─── Gather diagnostics — safe, no secrets ────────────────────────────────
  function collect() {
    var plat     = global.SRPlatformDetector   || null;
    var caps     = global.SRCapabilityManager  || null;
    var android  = global.SRAndroidAdapter     || null;
    var router   = global.SRDeviceActionRouter || null;
    var pwa      = global.SRPWAState           || null;
    var fa       = global.SRFirebaseAdapter    || null;

    // ── Capacitor raw
    var cap = global.Capacitor || null;
    var capNativePlatformFn = (cap && typeof cap.isNativePlatform === 'function');
    var capIsNative     = capNativePlatformFn ? cap.isNativePlatform() : false;
    var capPlatform     = (cap && typeof cap.getPlatform === 'function')
                            ? cap.getPlatform()
                            : (cap ? '(getPlatform not found)' : '(Capacitor not found)');
    var capPlugins      = (cap && cap.Plugins) ? Object.keys(cap.Plugins) : [];

    // ── Platform detector
    var runtime     = plat ? plat.getRuntime()       : '(SRPlatformDetector not loaded)';
    var isNative    = plat ? plat.isNative()         : false;
    var isAndroid   = plat ? plat.isAndroid()        : false;
    var capNativeHelper = plat && typeof plat.isCapacitorNative === 'function'
                            ? plat.isCapacitorNative()
                            : '(helper not available — update platform detector)';

    // ── Android adapter
    var adapterActive = android ? android.isActiveRuntime() : false;
    var runtimeInfo   = android ? android.getRuntimeInfo()  : null;

    // ── Device Control Mode (in-memory only — no Firebase read here)
    var dcmCurrent = '(check Settings panel)';
    try {
      // Read from localStorage — safe, no secrets
      var uid  = (fa && typeof fa.getUID === 'function') ? fa.getUID() : null;
      var lsKey = uid ? ('srDCMPref_' + uid) : 'srDCMPref_guest';
      var lsVal = localStorage && localStorage.getItem(lsKey);
      if (lsVal) dcmCurrent = lsVal + ' (from localStorage)';
    } catch (_) {}

    // ── Permission states (no request, just probe)
    function _permState(name) {
      var srBridge = cap && cap.Plugins && cap.Plugins.ShadowReaperBridge;
      // We can't check synchronously from here without calling native —
      // report what CapabilityManager knows (already-probed state)
      if (caps) {
        var s = caps.getState(name);
        return s || 'unknown';
      }
      return 'unknown';
    }

    return {
      build:              BUILD_ID,
      timestamp:          new Date().toISOString(),

      // ── Capacitor
      capacitorFound:          !!cap,
      capacitorIsNativePlatform: capIsNative,   // isNativePlatform() result
      capacitorPlatform:       capPlatform,
      capacitorPlugins:        capPlugins,
      capacitorHasBridge:      !!(cap && cap.Plugins && cap.Plugins.ShadowReaperBridge),

      // ── Platform Detector
      srPlatformDetectorLoaded: !!plat,
      isCapacitorNativeHelper: capNativeHelper, // from SRPlatformDetector.isCapacitorNative()
      runtime:                 runtime,
      isNative:                isNative,
      isAndroid:               isAndroid,

      // ── Android Adapter
      srAndroidAdapterLoaded:  !!android,
      adapterActive:           adapterActive,
      runtimeInfo:             runtimeInfo,

      // ── Device Control Mode (from localStorage only — no DB call)
      deviceControlMode:       dcmCurrent,

      // ── Router
      srDeviceRouterLoaded:    !!router,

      // ── Capability states (probed by SRCapabilityManager on page load)
      capCamera:               _permState('camera'),
      capMicrophone:           _permState('microphone'),
      capLocation:             _permState('location'),
      capNotifications:        _permState('notifications'),
      capHaptics:              _permState('haptics'),
      capNetworkStatus:        _permState('networkStatus'),
      capOpenApp:              _permState('openApp'),
    };
  }

  // ─── Render panel DOM ─────────────────────────────────────────────────────
  function _renderPanel(data) {
    var panel = document.createElement('div');
    panel.id = 'srNativeDiagPanel';
    panel.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0',
      'z-index:99999', 'background:#080c14',
      'border-top:2px solid #1e90ff',
      'color:#e8edf5', 'font-family:monospace', 'font-size:11px',
      'padding:10px 12px 14px', 'max-height:50vh',
      'overflow-y:auto', '-webkit-overflow-scrolling:touch',
    ].join(';');

    function row(label, value, ok) {
      var color = ok === true  ? '#22c55e'
                : ok === false ? '#ef4444'
                : ok === 'warn' ? '#f59e0b'
                : '#94a3b8';
      var div = document.createElement('div');
      div.style.cssText = 'margin:2px 0;display:flex;gap:8px;align-items:baseline;';
      var l = document.createElement('span');
      l.style.cssText = 'color:#5a6880;min-width:220px;flex-shrink:0;';
      l.textContent   = label + ':';
      var v = document.createElement('span');
      v.style.color   = color;
      v.textContent   = String(value);
      div.appendChild(l);
      div.appendChild(v);
      return div;
    }

    var title = document.createElement('div');
    title.style.cssText = 'font-size:12px;font-weight:700;color:#1e90ff;margin-bottom:6px;letter-spacing:.05em;';
    title.textContent   = '— SHADOW REAPER NATIVE DIAGNOSTICS — ' + data.timestamp;
    panel.appendChild(title);

    panel.appendChild(row('Capacitor found',          data.capacitorFound,              data.capacitorFound));
    panel.appendChild(row('Capacitor.isNativePlatform()', data.capacitorIsNativePlatform, data.capacitorIsNativePlatform));
    panel.appendChild(row('Capacitor.getPlatform()',   data.capacitorPlatform,           data.capacitorPlatform === 'android'));
    panel.appendChild(row('Capacitor plugins',         data.capacitorPlugins.join(', ') || '(none)', data.capacitorPlugins.length > 0));
    panel.appendChild(row('ShadowReaperBridge plugin', data.capacitorHasBridge,          data.capacitorHasBridge));

    var sep = document.createElement('div');
    sep.style.cssText = 'border-top:1px solid #1e3a5f;margin:5px 0;';
    panel.appendChild(sep);

    panel.appendChild(row('SRPlatformDetector loaded', data.srPlatformDetectorLoaded,    data.srPlatformDetectorLoaded));
    panel.appendChild(row('isCapacitorNative()',        data.isCapacitorNativeHelper,     data.isCapacitorNativeHelper === true));
    panel.appendChild(row('SRPlatformDetector.getRuntime()', data.runtime,               data.runtime === 'ANDROID_NATIVE'));
    panel.appendChild(row('SRPlatformDetector.isNative()',   data.isNative,              data.isNative));
    panel.appendChild(row('SRPlatformDetector.isAndroid()',  data.isAndroid,             data.isAndroid));

    var sep2 = document.createElement('div');
    sep2.style.cssText = 'border-top:1px solid #1e3a5f;margin:5px 0;';
    panel.appendChild(sep2);

    panel.appendChild(row('SRAndroidAdapter loaded',    data.srAndroidAdapterLoaded,     data.srAndroidAdapterLoaded));
    panel.appendChild(row('SRAndroidAdapter.isActiveRuntime()', data.adapterActive,      data.adapterActive));
    if (data.runtimeInfo) {
      panel.appendChild(row('  runtimeInfo.hasCapacitor',   data.runtimeInfo.hasCapacitor,  data.runtimeInfo.hasCapacitor));
      panel.appendChild(row('  runtimeInfo.hasBridge',      data.runtimeInfo.hasBridge,     data.runtimeInfo.hasBridge));
      panel.appendChild(row('  runtimeInfo.capacitorPlatform', data.runtimeInfo.capacitorPlatform || '?', data.runtimeInfo.capacitorPlatform === 'android'));
    }
    panel.appendChild(row('Device Control Mode',        data.deviceControlMode,          data.deviceControlMode.includes('FULL_DEVICE_CONTROL') ? true : 'warn'));
    panel.appendChild(row('SRDeviceActionRouter loaded', data.srDeviceRouterLoaded,      data.srDeviceRouterLoaded));

    var sep3 = document.createElement('div');
    sep3.style.cssText = 'border-top:1px solid #1e3a5f;margin:5px 0;';
    panel.appendChild(sep3);

    panel.appendChild(row('camera capability',       data.capCamera,       data.capCamera === 'PERMISSION_REQUIRED' || data.capCamera === 'ALLOWED'));
    panel.appendChild(row('microphone capability',   data.capMicrophone,   data.capMicrophone === 'PERMISSION_REQUIRED' || data.capMicrophone === 'ALLOWED'));
    panel.appendChild(row('location capability',     data.capLocation,     data.capLocation === 'PERMISSION_REQUIRED' || data.capLocation === 'ALLOWED'));
    panel.appendChild(row('notifications capability', data.capNotifications, data.capNotifications !== 'NOT_SUPPORTED'));
    panel.appendChild(row('haptics capability',      data.capHaptics,      data.capHaptics === 'WEB_AVAILABLE' || data.capHaptics === 'ALLOWED'));
    panel.appendChild(row('networkStatus capability', data.capNetworkStatus, data.capNetworkStatus === 'WEB_AVAILABLE'));
    panel.appendChild(row('openApp capability',      data.capOpenApp,      data.capOpenApp === 'WEB_AVAILABLE'));

    var note = document.createElement('div');
    note.style.cssText = 'margin-top:6px;color:#f59e0b;font-size:10px;';
    note.textContent = '⚠ PHYSICAL TEST REQUIRED — bridge calls must be verified on an actual Android device. Close: tap ✕ above.';
    panel.appendChild(note);

    var close = document.createElement('button');
    close.textContent = '✕  CLOSE DIAGNOSTICS';
    close.style.cssText = 'margin-top:8px;background:#1e3a5f;border:1px solid #1e90ff;color:#e8edf5;font-size:11px;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:monospace;';
    close.addEventListener('click', hide);
    panel.appendChild(close);

    return panel;
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  function show() {
    hide(); // remove any existing panel
    var data = collect();
    var panel = _renderPanel(data);
    document.body.appendChild(panel);
    console.info('[SRNativeDiagnostics]', data);
    return data;
  }

  function hide() {
    var el = document.getElementById('srNativeDiagPanel');
    if (el) el.remove();
  }

  function getReport() {
    return collect();
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRNativeDiagnostics = {
    build:     BUILD_ID,
    show:      show,
    hide:      hide,
    collect:   collect,
    getReport: getReport,
  };

})(typeof window !== 'undefined' ? window : global);
