/**
 * shadow-reaper-standalone/firebase/firebase-config.js
 *
 * Shadow Reaper Standalone — Firebase Configuration
 *
 * ⚠️  DO NOT COMMIT REAL CREDENTIALS TO GITHUB
 *
 * This is the STANDALONE Shadow Reaper Firebase project.
 * It is NOT connected to Shadow Nexus Social (horr-a08f4).
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   SHADOW REAPER STANDALONE — FIREBASE CONFIG
   Project: ffr3r3223
   NOT Shadow Nexus Social (horr-a08f4)
───────────────────────────────────────────────────────────────────────────────*/

var SR_FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAhySATLk5cBeUO8r5cwwqCpitmWFcZYIs',
  authDomain:        'ffr3r3223.firebaseapp.com',
  projectId:         'ffr3r3223',
  storageBucket:     'ffr3r3223.firebasestorage.app',
  messagingSenderId: '410865691561',
  appId:             '1:410865691561:web:26f031090aae583c3372b8',
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
