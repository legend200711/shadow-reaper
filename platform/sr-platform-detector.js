/**
 * shadow-reaper-standalone/platform/sr-platform-detector.js
 * Shadow Reaper Standalone — Platform Detector
 *
 * Build: SR-STANDALONE-PLATFORM-2
 *
 * Exposes: window.SRPlatformDetector
 *
 * PURPOSE:
 *   Detect the current runtime category using CAPABILITY DETECTION
 *   as the authoritative method, not user-agent string alone.
 *
 * RUNTIME CATEGORIES:
 *   WEB_DESKTOP    — Desktop/laptop browser
 *   WEB_MOBILE     — Mobile browser (not installed, not a native app)
 *   PWA_DESKTOP    — Installed PWA on desktop (standalone display mode)
 *   PWA_MOBILE     — Installed PWA on mobile (standalone display mode)
 *   ANDROID_NATIVE — Inside a real native Android container (Capacitor)
 *   IOS_NATIVE     — Inside a real native iOS container (Capacitor)
 *
 * CRITICAL RULES:
 *   - ANDROID_NATIVE requires window.Capacitor.isNative === true.
 *     Android Chrome is NOT ANDROID_NATIVE.
 *     An installed Android PWA is NOT ANDROID_NATIVE.
 *   - IOS_NATIVE requires window.Capacitor.isNative === true.
 *     iPhone Safari is NOT IOS_NATIVE.
 *     An installed iPhone PWA is NOT IOS_NATIVE.
 *   - PWA detection uses matchMedia('(display-mode: standalone)') or
 *     navigator.standalone (iOS Safari). User-agent alone is NOT sufficient.
 *   - Capability detection overrides UA for all classification decisions.
 *
 * DESIGN:
 *   - Desktop hides mobile-only Device Controls.
 *   - Web/PWA runtimes do NOT show native "Control This Phone" UI.
 *   - Native apps expose only actually-supported capabilities.
 *   - No external calls. Pure synchronous detection.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-PLATFORM-2';

  // ─── Runtime categories ───────────────────────────────────────────────────
  var RUNTIME = {
    WEB_DESKTOP:    'WEB_DESKTOP',
    WEB_MOBILE:     'WEB_MOBILE',
    PWA_DESKTOP:    'PWA_DESKTOP',
    PWA_MOBILE:     'PWA_MOBILE',
    ANDROID_NATIVE: 'ANDROID_NATIVE',
    IOS_NATIVE:     'IOS_NATIVE',
  };

  // ─── Detection ────────────────────────────────────────────────────────────
  function _detect() {
    var w   = global;
    var nav = (global.navigator) || {};
    var ua  = (nav.userAgent || '').toLowerCase();

    // ── Step 1: Native Capacitor app detection (capability-first, MUST BE FIRST) ──
    // Only trust window.Capacitor.isNative — never infer from UA alone.
    // Android Chrome / iOS Safari / installed PWA must NOT match here.
    var isCapacitorNative = !!(w.Capacitor && w.Capacitor.isNative);

    if (isCapacitorNative) {
      var platform = '';
      if (w.Capacitor && w.Capacitor.getPlatform) {
        platform = (w.Capacitor.getPlatform() || '').toLowerCase();
      }
      if (platform === 'android') return RUNTIME.ANDROID_NATIVE;
      if (platform === 'ios')     return RUNTIME.IOS_NATIVE;
      // Unknown native — use UA as secondary tiebreaker only when Capacitor.isNative confirmed
      if (/android/.test(ua))              return RUNTIME.ANDROID_NATIVE;
      if (/iphone|ipad|ipod/.test(ua))     return RUNTIME.IOS_NATIVE;
      return RUNTIME.WEB_MOBILE; // Unknown native platform
    }

    // ── Step 2: Is this a mobile UA? ─────────────────────────────────────────
    var isTouchPrimary = nav.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches;
    var isSmallScreen  = typeof global.screen !== 'undefined' && global.screen.width <= 900;
    var isMobileUA     = /android|iphone|ipad|ipod|windows phone|blackberry|bb|mobile|silk/i.test(ua);
    // Require 2-of-3 signals to classify as mobile (reduces false positives on tablets/hybrids)
    var mobileSignals  = [isTouchPrimary, isSmallScreen, isMobileUA].filter(Boolean).length;
    var isMobileForm   = mobileSignals >= 2;

    // ── Step 3: PWA detection ─────────────────────────────────────────────────
    // Standalone display mode = PWA or home-screen shortcut.
    // navigator.standalone is iOS Safari PWA indicator.
    var isStandalone = false;
    try {
      isStandalone = (
        (typeof global.matchMedia === 'function' && global.matchMedia('(display-mode: standalone)').matches) ||
        (nav.standalone === true)
      );
    } catch (_) {}

    if (isStandalone) {
      return isMobileForm ? RUNTIME.PWA_MOBILE : RUNTIME.PWA_DESKTOP;
    }

    // ── Step 4: Plain browser ─────────────────────────────────────────────────
    if (isMobileForm) return RUNTIME.WEB_MOBILE;
    return RUNTIME.WEB_DESKTOP;
  }

  var _runtime = _detect();

  // ─── Derived helpers ──────────────────────────────────────────────────────
  function getRuntime()    { return _runtime; }
  function isDesktop()     { return _runtime === RUNTIME.WEB_DESKTOP || _runtime === RUNTIME.PWA_DESKTOP; }
  function isMobile()      { return !isDesktop(); }
  function isNative()      { return _runtime === RUNTIME.ANDROID_NATIVE || _runtime === RUNTIME.IOS_NATIVE; }
  function isAndroid()     { return _runtime === RUNTIME.ANDROID_NATIVE; }
  function isIOS()         { return _runtime === RUNTIME.IOS_NATIVE; }
  function isWebMobile()   { return _runtime === RUNTIME.WEB_MOBILE; }
  function isPWA()         { return _runtime === RUNTIME.PWA_MOBILE || _runtime === RUNTIME.PWA_DESKTOP; }
  function isPWAMobile()   { return _runtime === RUNTIME.PWA_MOBILE; }
  function isPWADesktop()  { return _runtime === RUNTIME.PWA_DESKTOP; }

  // Convenience: returns true for any runtime where native phone controls are NOT available.
  // Use this to gate "Control This Phone" UI — only false for ANDROID_NATIVE / IOS_NATIVE.
  function isWebOrPWA() { return !isNative(); }

  // ─── Summary ──────────────────────────────────────────────────────────────
  function getSummary() {
    return {
      runtime:     _runtime,
      isDesktop:   isDesktop(),
      isMobile:    isMobile(),
      isNative:    isNative(),
      isAndroid:   isAndroid(),
      isIOS:       isIOS(),
      isWebMobile: isWebMobile(),
      isPWA:       isPWA(),
      isPWAMobile: isPWAMobile(),
      isWebOrPWA:  isWebOrPWA(),
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
    isPWA:          isPWA,
    isPWAMobile:    isPWAMobile,
    isPWADesktop:   isPWADesktop,
    isWebOrPWA:     isWebOrPWA,
    getSummary:     getSummary,

    // Test use only — never call in production
    _overrideForTest: _overrideForTest,
  };

})(typeof window !== 'undefined' ? window : global);
