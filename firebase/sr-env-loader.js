/**
 * shadow-reaper-standalone/firebase/sr-env-loader.js
 *
 * Shadow Reaper Standalone — Runtime Environment Credential Loader
 *
 * PURPOSE:
 *   Injects Firebase credentials into SR_ENV at page-load time so that
 *   firebase-config.js can pick them up without hardcoding keys in source.
 *
 * HOW IT WORKS:
 *   1. In production (Cloudflare Pages / Workers), the deploy pipeline injects
 *      credentials as window.__SR_RUNTIME_ENV before this script runs.
 *   2. In local development, this file reads from a .env.local file via a
 *      build script that writes the values into a gitignored env-local.js.
 *   3. In the Android APK, credentials are injected into the WebView via
 *      the ShadowReaperBridgePlugin before the page loads.
 *
 * SECURITY:
 *   - This file itself contains NO secrets.
 *   - The actual key values come from the runtime environment, not from source.
 *   - .env.local and env-local.js are gitignored.
 *   - This file is safe to commit.
 *
 * PHYSICAL TEST REQUIREMENT:
 *   Verify SR_ENV.FIREBASE_API_KEY is populated before Firebase initialises
 *   by checking: console.log(window.SR_ENV) in the WebView console.
 */

'use strict';

(function (global) {

  // ── 1. Use runtime injection if available (Cloudflare / Android WebView) ──
  if (global.__SR_RUNTIME_ENV && global.__SR_RUNTIME_ENV.FIREBASE_API_KEY) {
    global.SR_ENV = global.__SR_RUNTIME_ENV;
    console.log('[SR-Env] Credentials loaded from runtime injection.');
    return;
  }

  // ── 2. Use window.SR_ENV_LOCAL if defined (injected by local dev build) ──
  if (global.SR_ENV_LOCAL && global.SR_ENV_LOCAL.FIREBASE_API_KEY) {
    global.SR_ENV = global.SR_ENV_LOCAL;
    console.log('[SR-Env] Credentials loaded from local development env.');
    return;
  }

  // ── 3. No credentials found — app runs in offline/auth-disabled mode ──
  // firebase-config.js will detect __SR_FIREBASE_API_KEY__ placeholder and
  // SR_FIREBASE_CONFIGURED will be false, triggering the offline-mode warning.
  global.SR_ENV = global.SR_ENV || {};
  console.warn(
    '[SR-Env] No runtime credentials found.\n' +
    '  Firebase Auth will be unavailable.\n' +
    '  To enable: set window.__SR_RUNTIME_ENV.FIREBASE_API_KEY before page load,\n' +
    '  or add sr-env-local.js (gitignored) with window.SR_ENV_LOCAL = { ... }.'
  );

})(typeof window !== 'undefined' ? window : global);
