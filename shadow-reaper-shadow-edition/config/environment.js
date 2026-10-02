/**
 * shadow-reaper-standalone/config/environment.js
 * Shadow Reaper Standalone — Environment Configuration
 *
 * Build: SR-STANDALONE-ENV-1
 *
 * Exposes: window.SREnvironment
 *
 * PURPOSE:
 *   Single source of truth for environment (development vs production)
 *   and feature flag state. All modules that need to know the current
 *   environment reference this file.
 *
 * IMPORTANT:
 *   - Real credentials are NEVER stored here
 *   - Firebase credentials come from firebase/firebase-config.js
 *   - Cloudflare credentials come from environment variables / secrets
 *   - This file may be committed to GitHub safely
 */

'use strict';

(function (global) {

  // ─── Environment detection ────────────────────────────────────────────────
                                  var _isLocalhost = (function () {
    try {
      return typeof window !== 'undefined' &&
             window.location != null &&
             (window.location.hostname === 'localhost' ||
              window.location.hostname === '127.0.0.1' ||
              window.location.hostname === '');
    } catch (_) { return false; }
  })();

  var _isDevMode = _isLocalhost || (
    typeof SR_DEV_MODE !== 'undefined' && SR_DEV_MODE === true
  );

  // ─── Environment config ───────────────────────────────────────────────────
  var _env = {
    // Current environment: "development" or "production"
    mode: _isDevMode ? 'development' : 'production',

    // Firebase
    firebase: {
      configured:  (typeof SR_FIREBASE_CONFIGURED !== 'undefined') ? SR_FIREBASE_CONFIGURED : false,
      projectId:   (typeof SR_FIREBASE_CONFIG !== 'undefined') ? (SR_FIREBASE_CONFIG.projectId || '') : '',
    },

    // Cloudflare
    cloudflare: {
      workerConfigured: false,   // updated by SRCloudflareAdapter.configure()
    },

    // Feature flags — default OFF for all persistence/cloud features until configured
    features: {
      persistenceEnabled:  false,  // true once Firebase adapter is initialized
      cloudflareEnabled:   false,  // true once Cloudflare adapter is configured
      researchEnabled:     false,  // true once research Worker is deployed
      appCheckEnabled:     false,  // true once App Check is enabled in Firebase console
    },

    // Development-only overrides
    dev: {
      skipFirebase:      _isDevMode,  // run fully offline in dev if Firebase not configured
      verboseLogging:    _isDevMode,
      bypassAppCheck:    _isDevMode,  // App Check debug token used in dev
    },
  };

  // ─── Set feature flag ─────────────────────────────────────────────────────
  function setFeature(key, value) {
    if (_env.features.hasOwnProperty(key)) {
      _env.features[key] = !!value;
    }
  }

  // ─── Get ─────────────────────────────────────────────────────────────────
  function get() {
    return Object.assign({}, _env, {
      features: Object.assign({}, _env.features),
      dev:      Object.assign({}, _env.dev),
    });
  }

  function isDev() {
    return _env.mode === 'development';
  }

  function isProd() {
    return _env.mode === 'production';
  }

  function isFeatureEnabled(key) {
    return !!_env.features[key];
  }

  // ─── Log summary (dev only) ───────────────────────────────────────────────
  if (_isDevMode) {
    console.log('[SREnvironment] Running in DEVELOPMENT mode.');
    console.log('[SREnvironment] Firebase configured:', _env.firebase.configured);
    console.log('[SREnvironment] Project ID:', _env.firebase.projectId || '(not set)');
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SREnvironment = {
    build: 'SR-STANDALONE-ENV-1',

    get:              get,
    isDev:            isDev,
    isProd:           isProd,
    isFeatureEnabled: isFeatureEnabled,
    setFeature:       setFeature,
  };

})(typeof window !== 'undefined' ? window : global);
