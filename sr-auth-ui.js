/**
 * shadow-reaper-standalone/sr-auth-ui.js
 * Shadow Reaper — Shadow Edition — Anonymous Identity Manager
 *
 * Build: SR-SHADOW-EDITION-ANON-1
 *
 * Exposes: window.SRAuthUI
 *
 * PURPOSE:
 *   Manages automatic anonymous Firebase authentication so that each
 *   installation gets a stable, UID-isolated identity without requiring
 *   the user to create an account, enter an email address, or set a
 *   password.
 *
 *   Users NEVER see a login screen.
 *   Users NEVER need to register, sign in, or sign up.
 *   The UID is internal — used only for Firestore data isolation.
 *
 * IDENTITY STRATEGY:
 *   On init(), calls firebase.auth().signInAnonymously() if no user is
 *   currently signed in.  The browser's IndexedDB persistence layer
 *   (Firebase default) retains the anonymous session across page reloads
 *   and browser restarts, so the same UID is reused for the life of the
 *   installation.
 *
 *   If Firebase credentials are not configured (offline / dev mode),
 *   the app runs in session-only mode — no error, no login prompt.
 *
 * SECURITY:
 *   - Anonymous UIDs are real Firebase UIDs — Firestore rules treat them
 *     identically to email-authenticated UIDs.
 *   - users/{uid}/... data is isolated per UID — one installation cannot
 *     read another installation's data.
 *   - Firestore is NOT made publicly readable or writable.
 *   - This file does NOT weaken any security rule.
 *
 * DOES NOT:
 *   - Show a login screen
 *   - Ask for email or password
 *   - Create user accounts
 *   - Expose login/signup/register UI
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-SHADOW-EDITION-ANON-1';

  // ─── State ────────────────────────────────────────────────────────────────
  var _currentUser     = null;   // Firebase user object or null
  var _authReady       = false;  // true once auth has resolved
  var _onAuthCallbacks = [];     // [ function(user) ]

  // ─── Firebase helpers ─────────────────────────────────────────────────────
  function _fbAuth() {
    return global.firebase && global.firebase.auth ? global.firebase.auth() : null;
  }

  // ─── Auth state ───────────────────────────────────────────────────────────
  function isAuthenticated() {
    return !!_currentUser;
  }

  function getCurrentUser() {
    return _currentUser || null;
  }

  function getUID() {
    return _currentUser ? _currentUser.uid : null;
  }

  // Anonymous users have no display name / email.
  // Return a generic label so any code that calls getDisplayName() does not break.
  function getDisplayName() {
    if (!_currentUser) return null;
    return _currentUser.displayName || 'Shadow User';
  }

  // ─── Callbacks ────────────────────────────────────────────────────────────
  function onAuthChange(fn) {
    if (typeof fn !== 'function') return;
    _onAuthCallbacks.push(fn);
    if (_authReady) {
      try { fn(_currentUser); } catch (e) {}
    }
  }

  function _fireAuthChange(user) {
    _currentUser = user;
    _onAuthCallbacks.forEach(function (fn) {
      try { fn(user); } catch (e) {}
    });
  }

  // ─── Init: wire Firebase auth observer + auto sign-in anonymously ─────────
  function init() {
    var auth = _fbAuth();

    if (!auth) {
      // Firebase not configured — run in session-only mode.
      // No login screen; no error. The app still works offline.
      _authReady = true;
      _fireAuthChange(null);
      console.log('[SRAuthUI] Firebase not available — session-only mode (no login required).');
      return;
    }

    // Observe auth state. Firebase restores the persisted anonymous session
    // automatically on page reload, so onAuthStateChanged fires with the
    // existing user object before signInAnonymously() is needed.
    auth.onAuthStateChanged(function (user) {
      if (user) {
        // Existing session restored (anonymous or otherwise).
        _authReady = true;
        console.log('[SRAuthUI] Session restored. UID:', user.uid, 'anonymous:', user.isAnonymous);
        _fireAuthChange(user);
      } else {
        // No session — sign in anonymously. Automatic, silent, no user interaction.
        auth.signInAnonymously()
          .then(function (credential) {
            var u = credential.user || auth.currentUser;
            _authReady = true;
            console.log('[SRAuthUI] Anonymous sign-in complete. UID:', u ? u.uid : 'unknown');
            _fireAuthChange(u);
          })
          .catch(function (err) {
            // Anonymous auth failed (e.g. network offline at first launch, or
            // Anonymous provider not enabled in Firebase console).
            // Fall back to session-only mode — the app still works.
            _authReady = true;
            console.warn('[SRAuthUI] Anonymous sign-in failed (' + err.code + '). Running session-only.');
            _fireAuthChange(null);
          });
      }
    });
  }

  // ─── showModal / hideModal — no-op stubs ─────────────────────────────────
  // These stubs exist so that any existing code that calls SRAuthUI.showModal()
  // or SRAuthUI.hideModal() does not throw an error.  They do nothing because
  // Shadow Edition does not have a login modal.
  function showModal() {
    console.log('[SRAuthUI] showModal() called — no login required in Shadow Edition.');
  }

  function hideModal() {}

  // ─── signOut — clears the anonymous session and creates a new one ─────────
  // Calling signOut in Shadow Edition resets the local identity so the next
  // page load starts with a fresh anonymous UID.  This is equivalent to
  // "Clear My Shadow Data" at the identity level.
  function signOut(callback) {
    callback = callback || function () {};
    var auth = _fbAuth();
    if (!auth) { callback({ ok: false, reason: 'firebase_not_available' }); return; }
    auth.signOut()
      .then(function () { callback({ ok: true }); })
      .catch(function (err) { callback({ ok: false, reason: err.message }); });
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRAuthUI = {
    build:           BUILD_ID,
    init:            init,
    isAuthenticated: isAuthenticated,
    getCurrentUser:  getCurrentUser,
    getUID:          getUID,
    getDisplayName:  getDisplayName,
    onAuthChange:    onAuthChange,
    showModal:       showModal,   // no-op stub — no login modal in Shadow Edition
    hideModal:       hideModal,   // no-op stub
    signOut:         signOut,

    // Documented capability flag — callers can check this to confirm no login is required
    REQUIRES_LOGIN:  false,
    IS_ANONYMOUS_EDITION: true,
  };

})(typeof window !== 'undefined' ? window : global);
