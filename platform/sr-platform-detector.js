/**
 * shadow-reaper-standalone/platform/sr-platform-detector.js
 * Shadow Reaper Standalone — Platform Detector
 *
 * Build: SR-STANDALONE-PLATFORM-1
 *
 * Exposes: window.SRPlatformDetector
 *
 * PURPOSE:
 *   Detect the current runtime category using CAPABILITY DETECTION
 *   as the authoritative method, not user-agent string alone.
 *
 * RUNTIME CATEGORIES:
 *   WEB_DESKTOP   — Desktop/laptop browser
 *   WEB_MOBILE    — Mobile browser (not a native app)
 *   ANDROID_NATIVE — Inside a native Android container (Capacitor/Cordova)
 *   IOS_NATIVE    — Inside a native iOS container (Capacitor/Cordova)
 *
 * DESIGN:
 *   - Capability detection is authoritative; UA is secondary signal only.
 *   - Desktop hides mobile-only Device Controls.
 *   - Mobile browser does NOT pretend to have native capabilities.
 *   - Native apps expose only actually-supported capabilities.
 *   - No external calls. Pure synchronous detection.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-PLATFORM-1';

  // ─── Runtime categories ───────────────────────────────────────────────────
  var RUNTIME = {
    WEB_DESKTOP:    'WEB_DESKTOP',
    WEB_MOBILE:     'WEB_MOBILE',
    ANDROID_NATIVE: 'ANDROID_NATIVE',
    IOS_NATIVE:     'IOS_NATIVE',
  };

  // ─── Detection ────────────────────────────────────────────────────────────
  function _detect() {
    var w   = global;
    var nav = (global.navigator) || {};
    var ua  = (nav.userAgent || '').toLowerCase();

    // Capacitor/Cordova native app detection (capability-first)
    var isCapacitor = !!(w.Capacitor && w.Capacitor.isNative);
    var isCordova   = !!(w.cordova || w.PhoneGap);

    if (isCapacitor || isCordova) {
      // Determine Android vs iOS by platform property
      var platform = '';
      if (w.Capacitor && w.Capacitor.getPlatform) {
        platform = (w.Capacitor.getPlatform() || '').toLowerCase();
      } else if (nav.platform) {
        platform = nav.platform.toLowerCase();
      }

      if (platform === 'android' || /android/.test(ua)) {
        return RUNTIME.ANDROID_NATIVE;
      }
      if (platform === 'ios' || /iphone|ipad|ipod/.test(ua)) {
        return RUNTIME.IOS_NATIVE;
      }
      // Unknown native — default to mobile
      return RUNTIME.WEB_MOBILE;
    }

    // Browser — use screen width + pointer coarseness as capability signals
    var isTouchPrimary = nav.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches;
    var isSmallScreen  = typeof global.screen !== 'undefined' && global.screen.width <= 900;
    var isMobileUA     = /android|iphone|ipad|ipod|windows phone|blackberry|bb|mobile|silk/i.test(ua);

    // Capability-first: at least 2 of the 3 signals must agree for mobile
    var mobileSignals = [isTouchPrimary, isSmallScreen, isMobileUA].filter(Boolean).length;

    if (mobileSignals >= 2) {
      return RUNTIME.WEB_MOBILE;
    }

    return RUNTIME.WEB_DESKTOP;
  }

  var _runtime = _detect();

  // ─── Derived helpers ──────────────────────────────────────────────────────
  function getRuntime()    { return _runtime; }
  function isDesktop()     { return _runtime === RUNTIME.WEB_DESKTOP; }
  function isMobile()      { return _runtime === RUNTIME.WEB_MOBILE || _runtime === RUNTIME.ANDROID_NATIVE || _runtime === RUNTIME.IOS_NATIVE; }
  function isNative()      { return _runtime === RUNTIME.ANDROID_NATIVE || _runtime === RUNTIME.IOS_NATIVE; }
  function isAndroid()     { return _runtime === RUNTIME.ANDROID_NATIVE; }
  function isIOS()         { return _runtime === RUNTIME.IOS_NATIVE; }
  function isWebMobile()   { return _runtime === RUNTIME.WEB_MOBILE; }

  // ─── Summary ──────────────────────────────────────────────────────────────
  function getSummary() {
    return {
      runtime:    _runtime,
      isDesktop:  isDesktop(),
      isMobile:   isMobile(),
      isNative:   isNative(),
      isAndroid:  isAndroid(),
      isIOS:      isIOS(),
      isWebMobile: isWebMobile(),
    };
  }

  // ─── Force override (for testing only) ───────────────────────────────────
  function _overrideForTest(rt) {
    if (RUNTIME[rt]) _runtime = RUNTIME[rt];
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRPlatformDetector = {
    build:          BUILD_ID,
    RUNTIME:        RUNTIME,

    getRuntime:     getRuntime,
    isDesktop:      isDesktop,
    isMobile:       isMobile,
    isNative:       isNative,
    isAndroid:      isAndroid,
    isIOS:          isIOS,
    isWebMobile:    isWebMobile,
    getSummary:     getSummary,

    // Test use only — never call in production
    _overrideForTest: _overrideForTest,
  };

})(typeof window !== 'undefined' ? window : global);
