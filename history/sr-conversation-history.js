/**
 * shadow-reaper-standalone/history/sr-conversation-history.js
 * Shadow Reaper Standalone — Private Conversation History
 *
 * Build: SR-STANDALONE-HISTORY-1
 *
 * Exposes: window.SRConversationHistory
 *
 * PURPOSE:
 *   Standalone replacement for SNXShadowConvHistory.
 *   Uses SRFirebaseAdapter (NOT _snxDbCompat) for all Firestore operations.
 *   All data is scoped to the authenticated user's UID.
 *
 * FIRESTORE PATH:
 *   users/{uid}/shadowReaperConversations/{convId}
 *
 * PRIVACY:
 *   - Only the owner UID can read/write their history
 *   - History is never shared with other users
 *   - History is never automatically promoted to shared/global collections
 *   - Sensitive data is filtered before writing
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-HISTORY-1';
  var MAX_TURNS_PER_SESSION = 40;

  var _enabled    = true;
  var _currentConvId = null;
  var _sessionTurns  = [];   // in-memory session buffer

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _fb()  { return global.SRFirebaseAdapter || null; }
  function _sec() { return global.SRSecurity        || null; }
  function _uid() { return _fb() ? _fb().getUID() : null; }

  function _isGuest() {
    return !_uid();
  }

  function _generateConvId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    if (_isGuest()) {
      console.log('[SRConversationHistory] Guest mode — no persistence.');
      return;
    }
    if (!_currentConvId) {
      _currentConvId = _generateConvId();
    }
    console.log('[SRConversationHistory] Initialized. ConvID:', _currentConvId);
  }

  // ─── New conversation ─────────────────────────────────────────────────────
  function newConversation() {
    _currentConvId = _generateConvId();
    _sessionTurns  = [];
    console.log('[SRConversationHistory] New conversation:', _currentConvId);
  }

  // ─── Save turn ────────────────────────────────────────────────────────────
  function saveTurn(role, text) {
    if (!_enabled) return;
    if (_isGuest()) return;

    var sec = _sec();
    if (sec && sec.containsSensitiveData(text)) {
      console.warn('[SRConversationHistory] Turn not saved: sensitive data detected.');
      return;
    }

    var turn = {
      role:      role,
      text:      text,
      timestamp: new Date().toISOString(),
    };

    _sessionTurns.push(turn);
    if (_sessionTurns.length > MAX_TURNS_PER_SESSION) {
      _sessionTurns.shift();
    }

    // Fire-and-forget to Firestore
    var fb  = _fb();
    var col = fb ? fb.userConversationsCol() : null;
    if (!col || !_currentConvId) return;

    var doc = col.doc(_currentConvId);
    doc.set({
      turns:     _sessionTurns,
      updatedAt: new Date().toISOString(),
      uid:       _uid(),
    }, { merge: true }).catch(function (err) {
      console.warn('[SRConversationHistory] Save failed:', err.message);
    });
  }

  // ─── Load recent context ──────────────────────────────────────────────────
  function loadRecentContext(callback) {
    callback = callback || function () {};
    if (_isGuest()) { callback({ turns: [] }); return; }

    // Return in-memory session turns first (fast)
    if (_sessionTurns.length > 0) {
      callback({ turns: _sessionTurns.slice(-10) });
      return;
    }

    var fb  = _fb();
    var col = fb ? fb.userConversationsCol() : null;
    if (!col || !_currentConvId) {
      callback({ turns: [] });
      return;
    }

    col.doc(_currentConvId).get().then(function (doc) {
      if (doc && doc.exists) {
        var data  = doc.data() || {};
        var turns = Array.isArray(data.turns) ? data.turns : [];
        callback({ turns: turns.slice(-10) });
      } else {
        callback({ turns: [] });
      }
    }).catch(function () {
      callback({ turns: _sessionTurns.slice(-10) });
    });
  }

  // ─── Continuity detection ─────────────────────────────────────────────────
  var _CONTINUITY_PATTERNS = [
    /what (were|was) we (talking|discussing)/i,
    /where were we/i,
    /remind me (what|where)/i,
    /continue (from|our)/i,
    /pick up (where|from)/i,
    /last time (we|I)/i,
    /previous (conversation|session|chat)/i,
  ];

  function detectContinuity(text) {
    return _CONTINUITY_PATTERNS.some(function (p) { return p.test(text); });
  }

  // ─── Controls ─────────────────────────────────────────────────────────────
  function setEnabled(val)       { _enabled = !!val; }
  function isEnabled()           { return _enabled; }
  function getCurrentConvId()    { return _currentConvId; }

  function destroy() {
    _sessionTurns  = [];
    _currentConvId = null;
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRConversationHistory = {
    build: BUILD_ID,

    init:               init,
    newConversation:    newConversation,
    saveTurn:           saveTurn,
    loadRecentContext:  loadRecentContext,
    detectContinuity:   detectContinuity,
    setEnabled:         setEnabled,
    isEnabled:          isEnabled,
    getCurrentConvId:   getCurrentConvId,
    destroy:            destroy,
  };

})(typeof window !== 'undefined' ? window : global);
