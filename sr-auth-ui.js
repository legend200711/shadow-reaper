/**
 * shadow-reaper-standalone/sr-auth-ui.js
 * Shadow Reaper Standalone — Authentication UI + Auth State Manager
 *
 * Build: SR-STANDALONE-AUTH-UI-1
 *
 * Exposes: window.SRAuthUI
 *
 * PURPOSE:
 *   Manages the Login/Signup modal, Firebase authentication state,
 *   and fires auth state change callbacks so the main UI can
 *   show/hide authenticated features.
 *
 * USES:
 *   window.SRFirebaseAdapter  — firebase adapter (optional; graceful if missing)
 *   window.firebase           — Firebase SDK (optional; graceful if missing)
 *
 * DOES NOT:
 *   - Create a separate auth system
 *   - Store credentials in any persistent client storage
 *   - Access any user's private data
 *   - Weakening Firestore security rules
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-AUTH-UI-1';

  // ─── State ────────────────────────────────────────────────────────────────
  var _currentUser     = null;   // Firebase user object or null
  var _authReady       = false;  // true once Firebase auth resolved initial state
  var _onAuthCallbacks = [];     // [ function(user) ]
  var _modalEl         = null;   // injected modal DOM element

  // ─── Firebase helpers ─────────────────────────────────────────────────────
  function _fb()   { return global.SRFirebaseAdapter || null; }
  function _fbAuth(){ return global.firebase && global.firebase.auth ? global.firebase.auth() : null; }

  // ─── Auth state ───────────────────────────────────────────────────────────
  function isAuthenticated() {
    return !!_currentUser;
  }

  function getCurrentUser() {
    return _currentUser || null;
  }

  function getDisplayName() {
    if (!_currentUser) return null;
    return _currentUser.displayName || _currentUser.email || 'Account';
  }

  // ─── Callbacks ────────────────────────────────────────────────────────────
  function onAuthChange(fn) {
    if (typeof fn !== 'function') return;
    _onAuthCallbacks.push(fn);
    // If auth already resolved, call immediately
    if (_authReady) {
      try { fn(_currentUser); } catch(e) {}
    }
  }

  function _fireAuthChange(user) {
    _currentUser = user;
    _onAuthCallbacks.forEach(function (fn) {
      try { fn(user); } catch(e) {}
    });
  }

  // ─── Init: wire Firebase auth observer ────────────────────────────────────
  function init() {
    var fbAdapter = _fb();
    if (!fbAdapter) {
      // No Firebase — auth always null, mark ready immediately
      _authReady = true;
      _fireAuthChange(null);
      return;
    }

    var auth = _fbAuth();
    if (!auth) {
      _authReady = true;
      _fireAuthChange(null);
      return;
    }

    auth.onAuthStateChanged(function (user) {
      _authReady = true;
      _fireAuthChange(user);
    });
  }

  // ─── Sign out ─────────────────────────────────────────────────────────────
  function signOut(callback) {
    callback = callback || function () {};
    var auth = _fbAuth();
    if (!auth) { callback({ ok: false, reason: 'firebase_not_available' }); return; }
    auth.signOut()
      .then(function () { callback({ ok: true }); })
      .catch(function (err) { callback({ ok: false, reason: err.message }); });
  }

  // ─── Modal management ─────────────────────────────────────────────────────
  function showModal(defaultTab) {
    _ensureModal();
    _setTab(defaultTab || 'login');
    _modalEl.style.display = 'flex';
    _clearError();
    setTimeout(function () {
      var inp = _modalEl.querySelector('#srAuthEmail');
      if (inp) inp.focus();
    }, 80);
  }

  function hideModal() {
    if (_modalEl) _modalEl.style.display = 'none';
    _clearError();
  }

  function _clearError() {
    var el = _modalEl && _modalEl.querySelector('#srAuthError');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  function _showError(msg) {
    var el = _modalEl && _modalEl.querySelector('#srAuthError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function _setTab(tab) {
    if (!_modalEl) return;
    var loginTab  = _modalEl.querySelector('#srAuthTabLogin');
    var signupTab = _modalEl.querySelector('#srAuthTabSignup');
    var loginForm = _modalEl.querySelector('#srAuthLoginForm');
    var signupForm= _modalEl.querySelector('#srAuthSignupForm');
    var title     = _modalEl.querySelector('#srAuthTitle');

    if (tab === 'login') {
      loginTab.classList.add('active');
      signupTab.classList.remove('active');
      loginForm.style.display  = 'flex';
      signupForm.style.display = 'none';
      if (title) title.textContent = 'Welcome back';
    } else {
      signupTab.classList.add('active');
      loginTab.classList.remove('active');
      signupForm.style.display = 'flex';
      loginForm.style.display  = 'none';
      if (title) title.textContent = 'Create account';
    }
    _clearError();
  }

  // ─── Build modal DOM ──────────────────────────────────────────────────────
  function _ensureModal() {
    if (_modalEl) return;

    _modalEl = document.createElement('div');
    _modalEl.id = 'srAuthModal';
    _modalEl.setAttribute('role', 'dialog');
    _modalEl.setAttribute('aria-modal', 'true');
    _modalEl.setAttribute('aria-label', 'Sign in to Shadow Reaper');
    _modalEl.style.cssText = [
      'display:none',
      'position:fixed',
      'inset:0',
      'background:rgba(5,8,17,0.88)',
      'z-index:200',
      'align-items:center',
      'justify-content:center',
      'padding:16px',
    ].join(';');

    _modalEl.innerHTML = [
      '<div id="srAuthCard" style="',
        'background:#0d1220;',
        'border:1px solid rgba(30,144,255,0.25);',
        'border-radius:16px;',
        'width:100%;',
        'max-width:380px;',
        'padding:28px 24px 24px;',
        'position:relative;',
        'box-shadow:0 8px 48px rgba(0,0,0,0.6),0 0 40px rgba(30,144,255,0.06);',
      '">',
        '<button id="srAuthClose" aria-label="Close" style="',
          'position:absolute;top:14px;right:14px;',
          'background:none;border:none;cursor:pointer;',
          'color:#5a6880;font-size:20px;line-height:1;',
          'width:28px;height:28px;display:flex;align-items:center;justify-content:center;',
          'border-radius:6px;',
        '">&#215;</button>',

        '<div style="text-align:center;margin-bottom:20px;">',
          '<div style="font-size:36px;margin-bottom:8px;filter:drop-shadow(0 0 12px rgba(30,144,255,0.5));">&#9760;</div>',
          '<div id="srAuthTitle" style="font-size:18px;font-weight:700;color:#e8edf5;letter-spacing:0.02em;">Welcome back</div>',
          '<div style="font-size:12px;color:#5a6880;margin-top:4px;">Shadow Reaper AI</div>',
        '</div>',

        '<div id="srAuthError" style="',
          'display:none;',
          'background:rgba(239,68,68,0.1);',
          'border:1px solid rgba(239,68,68,0.3);',
          'border-radius:8px;',
          'padding:8px 12px;',
          'font-size:12px;',
          'color:#ef4444;',
          'margin-bottom:14px;',
          'line-height:1.5;',
        '"></div>',

        '<div style="display:flex;gap:0;margin-bottom:20px;border-bottom:1px solid rgba(30,144,255,0.15);">',
          '<button id="srAuthTabLogin" style="',
            'flex:1;background:none;border:none;cursor:pointer;',
            'padding:8px 0;font-size:13px;font-weight:600;',
            'color:#1e90ff;border-bottom:2px solid #1e90ff;',
            'transition:all 0.15s;letter-spacing:0.03em;',
          '">LOG IN</button>',
          '<button id="srAuthTabSignup" style="',
            'flex:1;background:none;border:none;cursor:pointer;',
            'padding:8px 0;font-size:13px;font-weight:600;',
            'color:#5a6880;border-bottom:2px solid transparent;',
            'transition:all 0.15s;letter-spacing:0.03em;',
          '">SIGN UP</button>',
        '</div>',

        // ── LOGIN FORM ──
        '<form id="srAuthLoginForm" style="display:flex;flex-direction:column;gap:12px;" autocomplete="on">',
          '<input id="srAuthEmail" type="email" placeholder="Email address" autocomplete="email" required style="',
            'background:#0e1525;border:1.5px solid rgba(30,144,255,0.2);',
            'border-radius:10px;padding:10px 14px;color:#e8edf5;font-size:14px;',
            'outline:none;font-family:inherit;transition:border-color 0.15s;',
          '"/>',
          '<input id="srAuthPassword" type="password" placeholder="Password" autocomplete="current-password" required style="',
            'background:#0e1525;border:1.5px solid rgba(30,144,255,0.2);',
            'border-radius:10px;padding:10px 14px;color:#e8edf5;font-size:14px;',
            'outline:none;font-family:inherit;transition:border-color 0.15s;',
          '"/>',
          '<button type="submit" id="srAuthLoginBtn" style="',
            'background:#1e90ff;border:none;border-radius:10px;',
            'padding:11px;color:#fff;font-size:14px;font-weight:700;',
            'cursor:pointer;letter-spacing:0.04em;transition:background 0.15s;',
          '">LOG IN</button>',
        '</form>',

        // ── SIGNUP FORM ──
        '<form id="srAuthSignupForm" style="display:none;flex-direction:column;gap:12px;" autocomplete="on">',
          '<input id="srAuthSignupEmail" type="email" placeholder="Email address" autocomplete="email" required style="',
            'background:#0e1525;border:1.5px solid rgba(30,144,255,0.2);',
            'border-radius:10px;padding:10px 14px;color:#e8edf5;font-size:14px;',
            'outline:none;font-family:inherit;transition:border-color 0.15s;',
          '"/>',
          '<input id="srAuthSignupPassword" type="password" placeholder="Password (min 6 characters)" autocomplete="new-password" required style="',
            'background:#0e1525;border:1.5px solid rgba(30,144,255,0.2);',
            'border-radius:10px;padding:10px 14px;color:#e8edf5;font-size:14px;',
            'outline:none;font-family:inherit;transition:border-color 0.15s;',
          '"/>',
          '<button type="submit" id="srAuthSignupBtn" style="',
            'background:#1e90ff;border:none;border-radius:10px;',
            'padding:11px;color:#fff;font-size:14px;font-weight:700;',
            'cursor:pointer;letter-spacing:0.04em;transition:background 0.15s;',
          '">CREATE ACCOUNT</button>',
        '</form>',

        '<div id="srAuthNoFirebase" style="display:none;text-align:center;padding:12px 0;">',
          '<div style="color:#5a6880;font-size:12px;line-height:1.7;">',
            'Authentication is not configured.<br>',
            'See <code style="font-size:11px;color:#94a3b8;">firebase/SETUP.md</code> to enable accounts.',
          '</div>',
        '</div>',

      '</div>',
    ].join('');

    document.body.appendChild(_modalEl);

    // ── Wire events ──────────────────────────────────────────────────────────
    _modalEl.querySelector('#srAuthClose').addEventListener('click', hideModal);

    // Close on backdrop click
    _modalEl.addEventListener('click', function (e) {
      if (e.target === _modalEl) hideModal();
    });

    // Tab switching
    _modalEl.querySelector('#srAuthTabLogin').addEventListener('click',  function () { _setTab('login');  });
    _modalEl.querySelector('#srAuthTabSignup').addEventListener('click', function () { _setTab('signup'); });

    // Keyboard ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _modalEl && _modalEl.style.display !== 'none') hideModal();
    });

    // Check if Firebase is available; show no-firebase message if not
    var auth = _fbAuth();
    if (!auth) {
      _modalEl.querySelector('#srAuthLoginForm').style.display  = 'none';
      _modalEl.querySelector('#srAuthSignupForm').style.display = 'none';
      _modalEl.querySelector('#srAuthNoFirebase').style.display = 'block';
      var tabs = _modalEl.querySelector('#srAuthTabLogin').parentNode;
      if (tabs) tabs.style.display = 'none';
      return;
    }

    // Login submit
    _modalEl.querySelector('#srAuthLoginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      _doLogin();
    });

    // Signup submit
    _modalEl.querySelector('#srAuthSignupForm').addEventListener('submit', function (e) {
      e.preventDefault();
      _doSignup();
    });
  }

  // ─── Auth actions ──────────────────────────────────────────────────────────
  function _setLoading(btnId, loading) {
    var btn = _modalEl && _modalEl.querySelector('#' + btnId);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.setAttribute('data-orig', btn.textContent);
      btn.textContent = 'Please wait…';
    } else {
      var orig = btn.getAttribute('data-orig');
      if (orig) btn.textContent = orig;
    }
  }

  function _doLogin() {
    _clearError();
    var email    = (_modalEl.querySelector('#srAuthEmail').value || '').trim();
    var password = _modalEl.querySelector('#srAuthPassword').value || '';
    if (!email || !password) { _showError('Please enter your email and password.'); return; }

    _setLoading('srAuthLoginBtn', true);
    var auth = _fbAuth();
    if (!auth) { _showError('Authentication not available.'); _setLoading('srAuthLoginBtn', false); return; }

    auth.signInWithEmailAndPassword(email, password)
      .then(function () {
        hideModal();
      })
      .catch(function (err) {
        _setLoading('srAuthLoginBtn', false);
        _showError(_friendlyAuthError(err.code));
      });
  }

  function _doSignup() {
    _clearError();
    var email    = (_modalEl.querySelector('#srAuthSignupEmail').value || '').trim();
    var password = _modalEl.querySelector('#srAuthSignupPassword').value || '';
    if (!email)         { _showError('Please enter an email address.'); return; }
    if (password.length < 6) { _showError('Password must be at least 6 characters.'); return; }

    _setLoading('srAuthSignupBtn', true);
    var auth = _fbAuth();
    if (!auth) { _showError('Authentication not available.'); _setLoading('srAuthSignupBtn', false); return; }

    auth.createUserWithEmailAndPassword(email, password)
      .then(function () {
        hideModal();
      })
      .catch(function (err) {
        _setLoading('srAuthSignupBtn', false);
        _showError(_friendlyAuthError(err.code));
      });
  }

  function _friendlyAuthError(code) {
    var map = {
      'auth/invalid-email':          'Please enter a valid email address.',
      'auth/user-not-found':         'No account found with that email.',
      'auth/wrong-password':         'Incorrect password. Please try again.',
      'auth/email-already-in-use':   'An account with that email already exists.',
      'auth/weak-password':          'Password must be at least 6 characters.',
      'auth/too-many-requests':      'Too many attempts. Please wait a moment.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/operation-not-allowed':  'This sign-in method is not enabled. Contact support.',
    };
    return map[code] || 'Something went wrong. Please try again.';
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRAuthUI = {
    build:           BUILD_ID,
    init:            init,
    isAuthenticated: isAuthenticated,
    getCurrentUser:  getCurrentUser,
    getDisplayName:  getDisplayName,
    onAuthChange:    onAuthChange,
    showModal:       showModal,
    hideModal:       hideModal,
    signOut:         signOut,
  };

})(typeof window !== 'undefined' ? window : global);
