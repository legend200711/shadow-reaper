/**
 * shadow-reaper-standalone/adapters/firebase-adapter.js
 * Shadow Reaper Standalone — Firebase Adapter
 *
 * Build: SR-STANDALONE-FIREBASE-ADAPTER-1
 *
 * Exposes: window.SRFirebaseAdapter
 *
 * PURPOSE:
 *   Single, thin bridge between Shadow Reaper core and the standalone
 *   Firebase project.  All Firestore paths and auth helpers live here.
 *
 *   This is the ONLY file that may reference Firebase SDK globals.
 *   Core modules (adaptive-brain, persistence-bridge, etc.) must use
 *   this adapter instead of reaching for Firebase directly.
 *
 * ISOLATION GUARANTEE:
 *   - This adapter connects ONLY to the Firebase project defined in
 *     firebase/firebase-config.js (SR_FIREBASE_CONFIG).
 *   - It never references _snxDbCompat, _snxAuth, _snxCurrentUser,
 *     or any other Shadow Nexus Social global.
 *
 * COLLECTION PATHS:
 *   users/{uid}/shadowReaperConversations
 *   users/{uid}/shadowReaperMemory
 *   users/{uid}/shadowReaperLearnedContext
 *   users/{uid}/shadowReaperPreferences
 *   sharedKnowledge
 *   globalLearning
 *   shadowReaperConfig
 *   webResearchCache   (future)
 *
 * SECURITY:
 *   - UID is obtained from Firebase Auth only — never from client state
 *   - All writes include the authenticated UID
 *   - No cross-user access; no guest writes
 *   - Sensitive field names are rejected before any write
 */

'use strict';

(function (global) {

  // ─── State ────────────────────────────────────────────────────────────────
  var _app      = null;   // Firebase app instance
  var _db       = null;   // Firestore instance
  var _auth     = null;   // Auth instance
  var _ready    = false;  // true once initialized successfully
  var _uid      = null;   // cached UID from current user

  // ─── Sensitive-field guard ────────────────────────────────────────────────
  var _FORBIDDEN_FIELDS = [
    'apiKey', 'authDomain', 'projectId', 'storageBucket',
    'messagingSenderId', 'appId', 'token', 'password', 'secret',
    'firebaseConfig', '_systemRule',
  ];

  function _hasForbiddenFields(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return _FORBIDDEN_FIELDS.some(function (k) { return obj.hasOwnProperty(k); });
  }

  // ─── Firebase SDK availability checks ────────────────────────────────────
  function _fbApp()       { return global.firebase && global.firebase.app        ? global.firebase.app       : null; }
  function _fbFirestore() { return global.firebase && global.firebase.firestore  ? global.firebase.firestore : null; }
  function _fbAuth()      { return global.firebase && global.firebase.auth       ? global.firebase.auth      : null; }

  // ─── Init ─────────────────────────────────────────────────────────────────
  /**
   * init()
   * Must be called after the Firebase SDK scripts are loaded and
   * firebase/firebase-config.js is loaded.
   * Returns { ok: boolean, reason?: string }
   */
  function init() {
    // Check config
    if (typeof SR_FIREBASE_CONFIGURED === 'undefined' || !SR_FIREBASE_CONFIGURED) {
      console.warn('[SRFirebaseAdapter] Firebase credentials not configured. Running offline.');
      return { ok: false, reason: 'credentials_missing' };
    }

    // Check SDK
    if (!global.firebase) {
      console.warn('[SRFirebaseAdapter] Firebase SDK not loaded.');
      return { ok: false, reason: 'sdk_missing' };
    }

    try {
      // Initialize only if not already initialized
      if (global.firebase.apps && global.firebase.apps.length === 0) {
        _app = global.firebase.initializeApp(SR_FIREBASE_CONFIG);
      } else {
        _app = global.firebase.app();
      }
      _db   = global.firebase.firestore();
      _auth = global.firebase.auth();

      // Expose _db on the public object so adapter helpers (e.g. SRWakeName) can
      // reach Firestore without duplicating path logic.
      global.SRFirebaseAdapter._db = _db;

      // Cache UID on auth state change
      _auth.onAuthStateChanged(function (user) {
        _uid = user ? user.uid : null;
      });

      _ready = true;
      console.log('[SRFirebaseAdapter] Initialized. Project:', SR_FIREBASE_CONFIG.projectId);
      return { ok: true };

    } catch (err) {
      console.error('[SRFirebaseAdapter] Init failed:', err);
      return { ok: false, reason: err.message };
    }
  }

  // ─── Auth helpers ─────────────────────────────────────────────────────────
  function getUID() {
    if (_auth && _auth.currentUser) return _auth.currentUser.uid;
    return _uid || null;
  }

  function isAuthenticated() {
    return !!getUID();
  }

  function getCurrentUser() {
    return (_auth && _auth.currentUser) ? _auth.currentUser : null;
  }

  // ─── Firestore path helpers ───────────────────────────────────────────────
  function _col(path) {
    if (!_ready || !_db) return null;
    return _db.collection(path);
  }

  function _doc(path) {
    if (!_ready || !_db) return null;
    return _db.doc(path);
  }

  // ── Private user collections (UID-scoped) ─────────────────────────────────
  function userConversationsCol() {
    var uid = getUID();
    if (!uid) return null;
    return _col('users/' + uid + '/shadowReaperConversations');
  }

  function userMemoryCol() {
    var uid = getUID();
    if (!uid) return null;
    return _col('users/' + uid + '/shadowReaperMemory');
  }

  function userLearnedContextCol() {
    var uid = getUID();
    if (!uid) return null;
    return _col('users/' + uid + '/shadowReaperLearnedContext');
  }

  function userPreferencesDoc() {
    var uid = getUID();
    if (!uid) return null;
    return _doc('users/' + uid + '/shadowReaperPreferences/settings');
  }

  // Per-user assistant preferences (wake name, wake listening, etc.)
  // Path: users/{uid}/shadowReaperPreferences/assistant
  function userAssistantPrefDoc() {
    var uid = getUID();
    if (!uid) return null;
    return _doc('users/' + uid + '/shadowReaperPreferences/assistant');
  }

  // ── Shared / Global collections (read: all authenticated; write: Founders via rules) ──
  function sharedKnowledgeCol() {
    return _col('sharedKnowledge');
  }

  function globalLearningCol() {
    return _col('globalLearning');
  }

  function configDoc(docId) {
    return _doc('shadowReaperConfig/' + (docId || 'globalSettings'));
  }

  // ─── Write guard ──────────────────────────────────────────────────────────
  /**
   * safeWrite(ref, data, options)
   * Validates data before any Firestore write.
   * Returns a Promise.
   */
  function safeWrite(ref, data, options) {
    if (!ref) {
      return Promise.reject(new Error('[SRFirebaseAdapter] No Firestore ref provided.'));
    }
    if (_hasForbiddenFields(data)) {
      return Promise.reject(new Error('[SRFirebaseAdapter] Write rejected: forbidden fields detected.'));
    }
    if (options && options.merge) {
      return ref.set(data, { merge: true });
    }
    return ref.set(data);
  }

  function safeAdd(col, data) {
    if (!col) {
      return Promise.reject(new Error('[SRFirebaseAdapter] No Firestore collection provided.'));
    }
    if (_hasForbiddenFields(data)) {
      return Promise.reject(new Error('[SRFirebaseAdapter] Add rejected: forbidden fields detected.'));
    }
    return col.add(data);
  }

  // ─── Status ───────────────────────────────────────────────────────────────
  function getStatus() {
    return {
      ready:           _ready,
      authenticated:   isAuthenticated(),
      uid:             getUID(),
      projectId:       (typeof SR_FIREBASE_CONFIG !== 'undefined') ? SR_FIREBASE_CONFIG.projectId : null,
      configured:      (typeof SR_FIREBASE_CONFIGURED !== 'undefined') ? SR_FIREBASE_CONFIGURED : false,
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRFirebaseAdapter = {
    build: 'SR-STANDALONE-FIREBASE-ADAPTER-1',

    init:                  init,
    getUID:                getUID,
    isAuthenticated:       isAuthenticated,
    getCurrentUser:        getCurrentUser,
    getStatus:             getStatus,

    // Collection/doc refs
    userConversationsCol:  userConversationsCol,
    userMemoryCol:         userMemoryCol,
    userLearnedContextCol: userLearnedContextCol,
    userPreferencesDoc:    userPreferencesDoc,
    userAssistantPrefDoc:  userAssistantPrefDoc,  // wake name + assistant settings
    sharedKnowledgeCol:    sharedKnowledgeCol,
    globalLearningCol:     globalLearningCol,
    configDoc:             configDoc,

    // Safe write wrappers
    safeWrite:             safeWrite,
    safeAdd:               safeAdd,

    // Internal Firestore reference (used by SRWakeName for direct doc access)
    _db: null,  // populated during init() — intentionally exposed for adapter helpers
    getDB:             function () { return _db; },
  };

})(typeof window !== 'undefined' ? window : global);
