/**
 * shadow-reaper-standalone/firebase/firebase-config.js
 *
 * Shadow Reaper Standalone — Firebase Configuration
 *
 * ⚠️  CREDENTIALS ARE LOADED AT RUNTIME FROM environment or .env.local
 *
 * This source file must NEVER contain production API keys.
 * Production keys are injected via the deployment pipeline (Cloudflare secrets,
 * CI environment variables, or a .env.local file excluded from version control).
 *
 * To run locally:
 *   1. Copy .env.example to .env.local
 *   2. Fill in SR_FIREBASE_API_KEY and the other variables
 *   3. The build step or runtime loader replaces the placeholders below
 *
 * This is the STANDALONE Shadow Reaper Firebase project (ffr3r3223).
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   SHADOW REAPER STANDALONE — FIREBASE CONFIG
   Project: ffr3r3223
   Production credentials are injected at runtime — not stored here.
───────────────────────────────────────────────────────────────────────────────*/

// Runtime credential injection: the deploy pipeline (or sr-env-loader.js)
// replaces these placeholders with the real values before the app initialises.
// Do NOT hardcode real API keys here.
var SR_FIREBASE_CONFIG = {
  apiKey:            (typeof SR_ENV !== 'undefined' && SR_ENV.FIREBASE_API_KEY)  || '__SR_FIREBASE_API_KEY__',
  authDomain:        (typeof SR_ENV !== 'undefined' && SR_ENV.FIREBASE_AUTH_DOMAIN)  || 'ffr3r3223.firebaseapp.com',
  projectId:         (typeof SR_ENV !== 'undefined' && SR_ENV.FIREBASE_PROJECT_ID)   || 'ffr3r3223',
  storageBucket:     (typeof SR_ENV !== 'undefined' && SR_ENV.FIREBASE_STORAGE_BUCKET) || 'ffr3r3223.firebasestorage.app',
  messagingSenderId: (typeof SR_ENV !== 'undefined' && SR_ENV.FIREBASE_MESSAGING_SENDER_ID) || '410865691561',
  appId:             (typeof SR_ENV !== 'undefined' && SR_ENV.FIREBASE_APP_ID)      || '1:410865691561:web:26f031090aae583c3372b8',
  measurementId:     '',   // not provided — Analytics not enabled
};

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIG GUARD
   Prevents initialization if credentials are missing (dev-time safety check).
───────────────────────────────────────────────────────────────────────────────*/
var SR_FIREBASE_CONFIGURED = (function () {
  var required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  return required.every(function (k) {
    return typeof SR_FIREBASE_CONFIG[k] === 'string' && SR_FIREBASE_CONFIG[k].trim() !== '';
  });
})();

if (!SR_FIREBASE_CONFIGURED) {
  console.warn(
    '[SRFirebase] ⚠️  Firebase credentials are not configured.\n' +
    '  Shadow Reaper Standalone will run in offline/local mode.\n' +
    '  See firebase/SETUP.md to add your credentials.'
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FEATURE FLAGS
   Which Firebase services are active for this project.
   Update these as services are enabled in the Firebase console.
───────────────────────────────────────────────────────────────────────────────*/
var SR_FIREBASE_FEATURES = {
  auth:        true,   // Firebase Authentication
  firestore:   true,   // Firestore (private user data + shared knowledge)
  appCheck:    false,  // Firebase App Check (enable before production launch)
  analytics:   false,  // Firebase Analytics (optional)
  storage:     false,  // Firebase Storage (reserved for future use)
};

/* Export for use by the Firebase adapter */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SR_FIREBASE_CONFIG, SR_FIREBASE_CONFIGURED, SR_FIREBASE_FEATURES };
}
