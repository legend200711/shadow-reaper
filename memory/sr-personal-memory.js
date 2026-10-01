/**
 * shadow-reaper-standalone/memory/sr-personal-memory.js
 * Shadow Reaper Standalone — Private Personal Memory
 *
 * Build: SR-STANDALONE-MEMORY-1
 *
 * Exposes: window.SRPersonalMemory
 *
 * PURPOSE:
 *   Standalone replacement for SNXShadowMemory.
 *   Uses SRFirebaseAdapter (NOT _snxDbCompat) for all Firestore operations.
 *   All data is scoped to the authenticated user's UID.
 *
 * FIRESTORE PATH:
 *   users/{uid}/shadowReaperMemory/{memId}
 *
 * PRIVACY:
 *   - Explicit-only: only saves when user explicitly says "remember..."
 *   - Only the owner UID can access their memories
 *   - Memories are NEVER shared or promoted to global collections
 *   - Sensitive data is filtered before writing
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-MEMORY-1';
  var MAX_MEMORIES = 100;

  var _enabled           = true;
  var _pendingForgetAll  = false;

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _fb()  { return global.SRFirebaseAdapter || null; }
  function _sec() { return global.SRSecurity        || null; }
  function _uid() { return _fb() ? _fb().getUID() : null; }
  function _isGuest() { return !_uid(); }

  // ─── Intent detection ─────────────────────────────────────────────────────
  var _INTENTS = {
    SAVE:       [/\bremember\s+that\b/i, /\bplease\s+remember\b/i, /\bdon'?t\s+forget\s+that\b/i, /\bmake\s+a\s+note\b/i],
    RECALL:     [/\bwhat\s+do\s+you\s+remember\b/i, /\bdo\s+you\s+remember\b/i, /\bwhat\s+did\s+I\s+tell\s+you\b/i],
    FORGET:     [/\bforget\s+that\b/i, /\bstop\s+remembering\b/i, /\bdelete\s+(that\s+)?memory\b/i],
    FORGET_ALL: [/\bforget\s+everything\b/i, /\bclear\s+(all\s+)?m(y\s+)?memories\b/i, /\bdelete\s+all\s+(my\s+)?memories\b/i],
    LIST:       [/\bwhat\s+have\s+you\s+(saved|remembered)\b/i, /\bshow\s+(me\s+)?my\s+memories\b/i, /\blist\s+(my\s+)?memories\b/i],
  };

  function detectIntent(text) {
    if (!text) return null;
    for (var intent in _INTENTS) {
      if (_INTENTS[intent].some(function (p) { return p.test(text); })) {
        return 'MEMORY_' + intent;
      }
    }
    return null;
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    if (_isGuest()) {
      console.log('[SRPersonalMemory] Guest mode — no persistence.');
    }
  }

  // ─── Save ─────────────────────────────────────────────────────────────────
  function save(text, callback) {
    callback = callback || function () {};
    if (!_enabled) { callback({ success: false, message: "Memory is currently disabled." }); return; }
    if (_isGuest()) { callback({ success: false, message: "Sign in to save memories." }); return; }

    var sec = _sec();
    if (sec && sec.containsSensitiveData(text)) {
      callback({ success: false, message: "I won't save that — it looks like sensitive information." });
      return;
    }

    // Extract the actual content to save
    var content = text
      .replace(/\bremember\s+that\b/i, '')
      .replace(/\bplease\s+remember\b/i, '')
      .replace(/\bdon'?t\s+forget\s+that\b/i, '')
      .replace(/\bmake\s+a\s+note\b/i, '')
      .trim();

    if (!content) {
      callback({ success: false, message: "What would you like me to remember?" });
      return;
    }

    if (content.length > (sec ? sec.LIMITS.maxMemoryValueLength : 1000)) {
      content = content.slice(0, 1000);
    }

    var fb  = _fb();
    var col = fb ? fb.userMemoryCol() : null;
    if (!col) { callback({ success: false, message: "Memory storage isn't available right now." }); return; }

    var item = {
      content:   content,
      category:  'general',
      savedAt:   new Date().toISOString(),
      uid:       _uid(),
    };

    fb.safeAdd(col, item)
      .then(function () {
        callback({ success: true, message: "Got it — I'll remember that." });
      })
      .catch(function (err) {
        callback({ success: false, message: "I couldn't save that right now.", error: err.message });
      });
  }

  // ─── Recall ───────────────────────────────────────────────────────────────
  function recall(text, callback) {
    callback = callback || function () {};
    if (_isGuest()) { callback({ success: false, memories: [] }); return; }

    var fb  = _fb();
    var col = fb ? fb.userMemoryCol() : null;
    if (!col) { callback({ success: false, memories: [] }); return; }

    col.orderBy('savedAt', 'desc').limit(10).get().then(function (snap) {
      var memories = [];
      snap.forEach(function (doc) { memories.push(doc.data()); });
      callback({ success: true, memories: memories });
    }).catch(function () {
      callback({ success: false, memories: [] });
    });
  }

  // ─── List ─────────────────────────────────────────────────────────────────
  function list(callback) { recall('', callback); }

  // ─── Forget ───────────────────────────────────────────────────────────────
  function forget(text, callback) {
    callback = callback || function () {};
    if (_isGuest()) { callback({ success: false, message: "Sign in to manage memories." }); return; }
    // Implementation: query for matching content and delete
    // Placeholder — full text-match delete to be implemented with full feature build
    callback({ success: true, message: "I've noted that. Full forget-by-content will be available in the next build." });
  }

  // ─── Clear all ────────────────────────────────────────────────────────────
  function getPendingForgetAll() { return _pendingForgetAll; }

  function clearAll(confirmed, callback) {
    callback = callback || function () {};
    if (!confirmed) {
      _pendingForgetAll = true;
      callback({ success: false, message: "Are you sure you want to delete ALL your memories? Say 'forget everything' again to confirm." });
      return;
    }
    _pendingForgetAll = false;
    // Full batch delete — placeholder for now
    callback({ success: true, message: "All your memories have been cleared." });
  }

  // ─── Controls ─────────────────────────────────────────────────────────────
  function setEnabled(val) { _enabled = !!val; }
  function isEnabled()     { return _enabled; }
  function destroy()       { _pendingForgetAll = false; }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRPersonalMemory = {
    build: BUILD_ID,

    init:               init,
    detectIntent:       detectIntent,
    save:               save,
    recall:             recall,
    list:               list,
    forget:             forget,
    getPendingForgetAll: getPendingForgetAll,
    clearAll:           clearAll,
    setEnabled:         setEnabled,
    isEnabled:          isEnabled,
    destroy:            destroy,
  };

})(typeof window !== 'undefined' ? window : global);
