/**
 * shadow-reaper-standalone/snx-shadow-conv-history.js
 * Shadow Reaper Standalone — Conversation History
 *
 * Build: SR-STANDALONE-CONV-HISTORY-1
 *
 * Exposes: window.SNXShadowConvHistory
 *
 * DROP-IN REPLACEMENT for the SNS snx-shadow-conv-history.js.
 * Preserves the exact same public API so that:
 *   - core/persistence-bridge.js works unchanged
 *   - tests/master.test.js works unchanged
 *   - ui.html / dev-test.html load order is unchanged
 *
 * WHAT CHANGED vs SNS version:
 *   - Firebase access uses SRFirebaseAdapter (NOT _snxDbCompat / _snxAuth)
 *   - No dependency on _snxCurrentUser
 *   - No dependency on any SNS global
 *   - Firebase is loaded lazily; works in session-only mode without it
 *
 * PUBLIC API (unchanged):
 *   init()
 *   saveTurn(role, text)
 *   loadRecentContext(callback)
 *   detectContinuity(text)  → boolean
 *   newConversation()
 *   setEnabled(bool)
 *   isEnabled()             → boolean
 *   getCurrentConvId()      → string|null
 *   destroy()
 *
 * FIRESTORE PATH:
 *   users/{uid}/shadowReaperConversations/{convId}
 *
 * PRIVACY:
 *   UID-isolated. Guest users get no persistence (session-only).
 *   Sensitive data is filtered before any write.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-STANDALONE-CONV-HISTORY-1';
  var MAX_TURNS = 40;

  var _enabled       = true;
  var _convId        = null;
  var _sessionTurns  = [];

  /* ── Internal helpers ───────────────────────────────────────────────────── */
  function _fb()  { return global.SRFirebaseAdapter || null; }
  function _sec() { return global.SRSecurity        || null; }

  function _uid() {
    var fb = _fb();
    if (fb && typeof fb.getUID === 'function') return fb.getUID();
    return null;
  }

  function _isSignedIn() { return !!_uid(); }

  function _isGuest() { return !_isSignedIn(); }

  function _newId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ── CONTINUITY PATTERNS ─────────────────────────────────────────────────── */
  var _CONT = [
    /what\s+(were|was)\s+we\s+(talking|discussing)/i,
    /where\s+were\s+we/i,
    /remind\s+me\s+(what|where)/i,
    /continue\s+(from|our)/i,
    /pick\s+up\s+(where|from)/i,
    /last\s+time\s+(we|I)/i,
    /previous\s+(conversation|session|chat)/i,
  ];

  /* ── PUBLIC API ──────────────────────────────────────────────────────────── */

  function init() {
    if (!_convId) _convId = _newId();
    if (_isGuest()) {
      console.log('[SNXShadowConvHistory] GUEST — session-only mode, no persistence.');
    } else {
      console.log('[SNXShadowConvHistory] Initialized. ConvId:', _convId);
    }
  }

  function newConversation() {
    _convId       = _newId();
    _sessionTurns = [];
  }

  function saveTurn(role, text) {
    if (!_enabled) return;
    if (_isGuest()) return;

    var sec = _sec();
    if (sec && sec.containsSensitiveData && sec.containsSensitiveData(text)) {
      return; // never persist sensitive data
    }

    var turn = { role: role, text: text, timestamp: new Date().toISOString() };
    _sessionTurns.push(turn);
    if (_sessionTurns.length > MAX_TURNS) _sessionTurns.shift();

    /* Fire-and-forget to Firestore */
    var fb  = _fb();
    var col = fb ? fb.userConversationsCol() : null;
    if (!col || !_convId) return;

    col.doc(_convId).set({
      turns:     _sessionTurns,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(function (err) {
      console.warn('[SNXShadowConvHistory] Save failed:', err.message);
    });
  }

  function loadRecentContext(callback) {
    callback = callback || function () {};

    if (_isGuest()) { callback({ turns: [] }); return; }

    /* Return in-memory session turns first (fast path) */
    if (_sessionTurns.length > 0) {
      callback({ turns: _sessionTurns.slice(-10) });
      return;
    }

    var fb  = _fb();
    var col = fb ? fb.userConversationsCol() : null;
    if (!col || !_convId) { callback({ turns: [] }); return; }

    col.doc(_convId).get().then(function (docSnap) {
      if (docSnap && docSnap.exists) {
        var data  = docSnap.data() || {};
        var turns = Array.isArray(data.turns) ? data.turns : [];
        callback({ turns: turns.slice(-10) });
      } else {
        callback({ turns: [] });
      }
    }).catch(function () {
      callback({ turns: _sessionTurns.slice(-10) });
    });
  }

  function detectContinuity(text) {
    if (!text) return false;
    return _CONT.some(function (p) { return p.test(text); });
  }

  function setEnabled(val) { _enabled = !!val; }
  function isEnabled()     { return _enabled; }
  function getCurrentConvId() { return _convId; }

  function destroy() {
    _sessionTurns = [];
    _convId       = null;
  }

  /**
   * listRecent(callback)
   * Returns a list of recent conversation stubs for the authenticated user.
   * callback({ conversations: [{ convId, preview, updatedAt }] })
   * Guest users receive an empty list.
   */
  function listRecent(callback) {
    callback = callback || function () {};
    if (_isGuest()) { callback({ conversations: [] }); return; }

    var fb  = _fb();
    var col = fb ? fb.userConversationsCol() : null;
    if (!col) { callback({ conversations: [] }); return; }

    col.orderBy('updatedAt', 'desc').limit(20).get()
      .then(function (snap) {
        var convs = [];
        if (snap && snap.docs) {
          snap.docs.forEach(function (doc) {
            var data  = doc.data() || {};
            var turns = Array.isArray(data.turns) ? data.turns : [];
            // Build a preview from the first user turn
            var preview = '';
            for (var i = 0; i < turns.length; i++) {
              if (turns[i] && turns[i].role === 'user' && turns[i].text) {
                preview = turns[i].text.slice(0, 60);
                if (turns[i].text.length > 60) preview += '…';
                break;
              }
            }
            convs.push({
              convId:    doc.id,
              preview:   preview || 'Conversation',
              updatedAt: data.updatedAt || '',
              turnCount: turns.length,
            });
          });
        }
        callback({ conversations: convs });
      })
      .catch(function () {
        callback({ conversations: [] });
      });
  }

  /**
   * loadConversation(convId, callback)
   * Loads a specific saved conversation and returns its turns.
   * Only works for authenticated users; guest returns empty.
   */
  function loadConversation(convId, callback) {
    callback = callback || function () {};
    if (_isGuest() || !convId) { callback({ turns: [] }); return; }

    var fb  = _fb();
    var col = fb ? fb.userConversationsCol() : null;
    if (!col) { callback({ turns: [] }); return; }

    col.doc(convId).get()
      .then(function (docSnap) {
        if (docSnap && docSnap.exists) {
          var data  = docSnap.data() || {};
          var turns = Array.isArray(data.turns) ? data.turns : [];
          // Switch to this conversation
          _convId       = convId;
          _sessionTurns = turns.slice();
          callback({ turns: turns });
        } else {
          callback({ turns: [] });
        }
      })
      .catch(function () {
        callback({ turns: [] });
      });
  }

  /* ── EXPOSE ──────────────────────────────────────────────────────────────── */
  global.SNXShadowConvHistory = {
    build: BUILD_ID,

    init:               init,
    saveTurn:           saveTurn,
    loadRecentContext:  loadRecentContext,
    detectContinuity:   detectContinuity,
    newConversation:    newConversation,
    listRecent:         listRecent,
    loadConversation:   loadConversation,
    setEnabled:         setEnabled,
    isEnabled:          isEnabled,
    getCurrentConvId:   getCurrentConvId,
    destroy:            destroy,
  };

})(typeof window !== 'undefined' ? window : global);
