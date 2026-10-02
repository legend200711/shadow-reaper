/**
 * shadow-reaper-standalone/tests/sr-no-login.test.js
 * Shadow Reaper — Shadow Edition — Account-Free Access Tests
 *
 * Build: SR-SHADOW-EDITION-NO-LOGIN-TESTS-1
 *
 * Verifies that Shadow Reaper — Shadow Edition:
 *   1. Opens without any login screen or account requirement
 *   2. Does not request email or password from the user
 *   3. Uses anonymous Firebase Auth (not public/open database)
 *   4. Keeps Firestore security rules UID-isolated
 *   5. Provides local-first persistence without user accounts
 *   6. Provides a "Clear My Shadow Data" action
 *   7. Does not contain protected-route redirects to login
 *   8. PWA/Android entry point goes directly to Shadow (no login gate)
 *
 * Tests run entirely in Node.js (static analysis + module behavior).
 * Firebase-live tests are labelled PHYSICAL TEST REQUIRED.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push('  ✓  ' + name);
  } catch (e) {
    FAIL++;
    results.push('  ✗  ' + name + '\n        ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertContains(str, sub, msg) {
  if (str.indexOf(sub) === -1) throw new Error(msg || 'Expected to contain: ' + sub);
}

function assertNotContains(str, sub, msg) {
  if (str.indexOf(sub) !== -1) throw new Error(msg || 'Expected NOT to contain: ' + sub);
}

// ── Source reads ──────────────────────────────────────────────────────────────
var indexSrc  = fs.readFileSync(path.join(ROOT, 'index.html'),    'utf8');
var authUiSrc = fs.readFileSync(path.join(ROOT, 'sr-auth-ui.js'), 'utf8');
var fbAdapterSrc = fs.readFileSync(path.join(ROOT, 'adapters/firebase-adapter.js'), 'utf8');
var firestoreRules = fs.readFileSync(path.join(ROOT, 'firebase/firestore.rules'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Fresh installation opens without login
// ─────────────────────────────────────────────────────────────────────────────
test('1. Fresh installation: no login gate in startup path', function () {
  // The boot() function must not redirect to a login modal on startup.
  // The only auth call in boot() should be SRAuth.init() + SRAuth.onAuthChange()
  // which triggers anonymous sign-in — not a login UI.
  assertContains(authUiSrc, 'signInAnonymously', 'Auth module must use anonymous sign-in');
  assertNotContains(authUiSrc, 'signInWithEmailAndPassword', 'Must not use email/password sign-in');
  assertNotContains(authUiSrc, 'createUserWithEmailAndPassword', 'Must not create email accounts');
  // boot() must call _onAnonReady (not _onAuthChange with login gate)
  assertContains(indexSrc, '_onAnonReady', 'boot() must call anonymous-ready handler');
  assertNotContains(indexSrc, '_onAuthChange', 'Old auth-gated handler must not exist');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Existing installation opens without login
// ─────────────────────────────────────────────────────────────────────────────
test('2. Existing installation: Firebase restores anonymous session automatically', function () {
  // Firebase IndexedDB persistence means the anonymous session is restored on
  // every page reload. SRAuthUI.init() calls onAuthStateChanged which fires
  // with the existing user object — signInAnonymously is only called if null.
  assertContains(authUiSrc, 'onAuthStateChanged', 'Must use onAuthStateChanged for session restore');
  assertContains(authUiSrc, 'Session restored', 'Must log session restoration');
  // The fallback: if Firebase is unavailable, run in session-only mode (not error)
  assertContains(authUiSrc, 'session-only mode', 'Must handle offline gracefully');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: No email/password is ever requested
// ─────────────────────────────────────────────────────────────────────────────
test('3. No email or password input in any user-facing element', function () {
  // index.html must not have email/password input fields in user-facing UI
  assertNotContains(indexSrc, 'type="email"',    'Must not have email input field in main app');
  assertNotContains(indexSrc, 'type="password"', 'Must not have password input field in main app');
  assertNotContains(indexSrc, 'autocomplete="email"',            'Must not have email autocomplete');
  assertNotContains(indexSrc, 'autocomplete="current-password"', 'Must not have password autocomplete');
  assertNotContains(indexSrc, 'autocomplete="new-password"',     'Must not have new-password field');
  // sr-auth-ui.js must not build a login form
  assertNotContains(authUiSrc, 'srAuthEmail',    'Auth module must not reference email field');
  assertNotContains(authUiSrc, 'srAuthPassword', 'Auth module must not reference password field');
  assertNotContains(authUiSrc, 'srAuthLoginForm',  'Auth module must not build login form');
  assertNotContains(authUiSrc, 'srAuthSignupForm', 'Auth module must not build signup form');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Shadow conversation works without authentication UI
// ─────────────────────────────────────────────────────────────────────────────
test('4. SR.ask() is called for all messages — no auth gate on conversation', function () {
  // The _send() function must call SR.ask() directly without an auth gate
  // (the old code had an _isAuth check that showed a login prompt first)
  assertContains(indexSrc, 'SR.ask(msg,', 'Messages must go through SR.ask()');
  assertNotContains(indexSrc, '_showAuthPrompt', 'Must not show auth prompts');
  assertNotContains(indexSrc, "if (!_isAuth)", 'Must not gate on _isAuth');
  assertNotContains(indexSrc, '_isAuth =', 'Must not maintain _isAuth state variable');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Voice works without login
// ─────────────────────────────────────────────────────────────────────────────
test('5. Voice input/output is not gated behind authentication', function () {
  // Voice button and TTS must not check auth state before activating
  assertContains(indexSrc, '_toggleVoice', 'Voice toggle must exist');
  assertContains(indexSrc, 'SRVoice.startListening', 'Voice listening must be wired');
  // No auth check before voice in _toggleVoice
  var voiceIdx = indexSrc.indexOf('function _toggleVoice');
  var nextSendIdx = indexSrc.indexOf('function _send', voiceIdx);
  var voiceBlock = indexSrc.slice(voiceIdx, nextSendIdx);
  assertNotContains(voiceBlock, '_isAuth', 'Voice toggle must not check auth state');
  assertNotContains(voiceBlock, 'SRAuth.showModal', 'Voice toggle must not open login modal');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Offline Shadow works without login
// ─────────────────────────────────────────────────────────────────────────────
test('6. Offline mode: Firebase unavailable falls back to session-only (no error screen)', function () {
  // When firebase is not available, SRAuthUI must fire null user — not crash
  assertContains(authUiSrc, "_fireAuthChange(null)", 'Must gracefully fire null user when offline');
  assertContains(authUiSrc, "session-only mode (no login required)", 'Must log session-only fallback');
  // _onAnonReady(null) must still show the UI (no login redirect when user=null)
  var anonReadyIdx = indexSrc.indexOf('function _onAnonReady');
  var nextFnIdx    = indexSrc.indexOf('  // ── APP OPTIONS', anonReadyIdx);
  var anonReadyBlock = indexSrc.slice(anonReadyIdx, nextFnIdx);
  assertContains(anonReadyBlock, '$nav.classList.add', 'Nav must be shown even with null user');
  assertNotContains(anonReadyBlock, 'SRAuth.showModal', 'Must not open login when user is null');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: Memory persists after restart (architecture check)
// ─────────────────────────────────────────────────────────────────────────────
test('7. Memory persistence uses UID-scoped Firestore (survives page reload)', function () {
  // SNXShadowMemory uses the anonymous UID to scope Firestore paths
  var memSrc = fs.readFileSync(path.join(ROOT, 'snx-shadow-memory.js'), 'utf8');
  assertContains(memSrc, 'shadowReaperMemory', 'Memory must use correct Firestore path');
  assertContains(memSrc, '_getCurrentUID()',    'Memory must get UID from adapter');
  assertContains(memSrc, '_isGuest()',          'Memory must check guest state via UID');
  // Anonymous UIDs are real — they pass the isGuest() check once signed in
  assertContains(memSrc, 'fb.getUID',           'Memory must use SRFirebaseAdapter.getUID()');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8: Conversation history persists after restart
// ─────────────────────────────────────────────────────────────────────────────
test('8. Conversation history persistence uses UID-scoped Firestore', function () {
  var histSrc = fs.readFileSync(path.join(ROOT, 'snx-shadow-conv-history.js'), 'utf8');
  assertContains(histSrc, 'shadowReaperConversations', 'History must use correct Firestore path');
  assertContains(histSrc, '_uid()',     'History must get UID from adapter');
  assertContains(histSrc, '_isGuest()', 'History must check guest state');
  // Session turns are always kept in memory for the current session
  assertContains(histSrc, '_sessionTurns', 'History must maintain in-session turns');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 9: Projects persist
// ─────────────────────────────────────────────────────────────────────────────
test('9. Projects are not gated behind login — accessible with anonymous UID', function () {
  // _goProjects() must not check _isAuth before opening the panel
  var goProjectsIdx = indexSrc.indexOf('function _goProjects');
  var nextFnIdx     = indexSrc.indexOf('  document.getElementById(\'srNavProjects\')', goProjectsIdx);
  var goBlock = indexSrc.slice(goProjectsIdx, nextFnIdx);
  assertNotContains(goBlock, '_isAuth', 'Projects must not gate on _isAuth');
  assertNotContains(goBlock, '_showAuthPrompt', 'Projects must not show auth prompt');
  assertContains(goBlock, '_openProjectsPanel()', 'Projects must directly open panel');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 10: Adaptive/personality settings persist
// ─────────────────────────────────────────────────────────────────────────────
test('10. Adaptive learning persistence uses UID-scoped Firestore', function () {
  var adaptSrc = fs.readFileSync(path.join(ROOT, 'snx-shadow-adaptive.js'), 'utf8');
  assertContains(adaptSrc, 'shadowReaperLearnedContext', 'Adaptive must use correct Firestore path');
  assertContains(adaptSrc, '_uid()', 'Adaptive must get UID from adapter');
  // First-launch prefs are stored in localStorage (no Firebase required)
  assertContains(indexSrc, 'srShadowEditionPrefs', 'Setup prefs must be stored locally');
  assertContains(indexSrc, 'localStorage.setItem', 'Prefs must use localStorage');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 11: One user's data cannot become globally accessible
// ─────────────────────────────────────────────────────────────────────────────
test('11. Data is UID-isolated — no cross-user access possible via Firestore rules', function () {
  // Firestore rules enforce isOwner(uid) — anonymous UIDs are real UIDs
  assertContains(firestoreRules, 'isOwner(uid)',        'Rules must use isOwner(uid) check');
  assertContains(firestoreRules, 'request.auth.uid == uid', 'Rules must compare auth.uid to path uid');
  assertContains(firestoreRules, 'isAuthenticated()',   'Rules must require authentication (anon counts)');
  // Users collection path must include {uid} wildcard
  assertContains(firestoreRules, 'match /users/{uid}/', 'Rules must scope to user UID path');
  // Anonymous UIDs are real Firebase auth UIDs — this is documented in the adapter
  assertContains(fbAdapterSrc, 'Anonymous', 'Adapter must document anonymous identity');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 12: Firestore is NOT made public to bypass authentication
// ─────────────────────────────────────────────────────────────────────────────
test('12. Firestore rules do NOT allow public read/write', function () {
  // The catch-all rule must deny everything not explicitly allowed
  assertContains(firestoreRules, 'allow read, write: if false', 'Catch-all must deny all');
  // Guest users (null auth) must have no access
  assertNotContains(firestoreRules, 'allow read, write: if true', 'Must not have open allow-all rule');
  assertNotContains(firestoreRules, 'allow read: if true',  'Must not have open read rule');
  assertNotContains(firestoreRules, 'allow write: if true', 'Must not have open write rule');
  // No public/unauthenticated access pattern
  assertNotContains(firestoreRules, 'request.auth == null', 'Must not allow null auth reads');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 13: No protected-route redirect sends users to login
// ─────────────────────────────────────────────────────────────────────────────
test('13. No protected-route redirect to login in index.html', function () {
  // The old system redirected to login modal when _isAuth was false.
  // Shadow Edition must never do this.
  assertNotContains(indexSrc, 'window.location.href = ', 'Must not redirect to login page');
  assertNotContains(indexSrc, "SRAuth.showModal('login')", 'Must not force open login modal');
  assertNotContains(indexSrc, 'SRAuth.showModal("login")', 'Must not force open login modal');
  assertNotContains(indexSrc, 'id="srAuthBtn"',    'Login/Signup button must not exist in DOM');
  assertNotContains(indexSrc, 'id="srProfileBtn"', 'Profile button (auth-only) must not exist in DOM');
  assertNotContains(indexSrc, 'LOG IN / SIGN UP',  'Login button text must not appear in UI');
  assertNotContains(indexSrc, 'CREATE ACCOUNT',    'Create Account button must not exist');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 14: PWA opens directly into Shadow (no login gate)
// ─────────────────────────────────────────────────────────────────────────────
test('14. PWA manifest and service worker do not gate on login', function () {
  // sw.js must not contain login-redirect or login-check logic.
  // Note: sw.js may legitimately cache sr-auth-ui.js as a file — that is fine.
  var swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assertNotContains(swSrc, 'redirectToLogin',            'Service worker must not redirect to login');
  assertNotContains(swSrc, 'window.location',            'Service worker must not redirect pages');
  assertNotContains(swSrc, 'signInWithEmailAndPassword', 'Service worker must not trigger email login');
  assertNotContains(swSrc, 'sign-in',                    'Service worker must not reference sign-in flow');
  // manifest.json start_url must go to the app directly
  var manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert(manifest.start_url, 'manifest.json must have start_url');
  assertNotContains(manifest.start_url, 'login', 'PWA start_url must not point to login page');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 15: Future Android APK opens directly into Shadow
// ─────────────────────────────────────────────────────────────────────────────
test('15. Android entry point (capacitor.config.json) does not require login', function () {
  var capConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  // The webDir must point to the root app — not a login page
  assert(capConfig.webDir || capConfig.server, 'Capacitor config must have webDir or server');
  // sr-auth-ui.js must expose REQUIRES_LOGIN: false for Android/native code to inspect
  assertContains(authUiSrc, 'REQUIRES_LOGIN:  false', 'Auth module must expose REQUIRES_LOGIN=false');
  assertContains(authUiSrc, 'IS_ANONYMOUS_EDITION: true', 'Auth module must identify as anonymous edition');
});

// ─────────────────────────────────────────────────────────────────────────────
// BONUS: First-launch setup does not ask for email/password
// ─────────────────────────────────────────────────────────────────────────────
test('BONUS: First-launch setup overlay collects name/voice — NOT email/password', function () {
  // The setup overlay must exist
  assertContains(indexSrc, 'srSetupOverlay', 'First-launch setup overlay must exist in DOM');
  assertContains(indexSrc, 'srSetupStartBtn', 'Setup must have a start button');
  // It must NOT ask for email or password
  var setupIdx  = indexSrc.indexOf('srSetupOverlay');
  var setupEnd  = indexSrc.indexOf('<!-- ── SCRIPTS', setupIdx);
  var setupBlock = indexSrc.slice(setupIdx, setupEnd);
  assertNotContains(setupBlock, 'type="email"',    'Setup must not ask for email');
  assertNotContains(setupBlock, 'type="password"', 'Setup must not ask for password');
  // It must collect name + voice + memory preference
  assertContains(setupBlock, 'srSetupName',    'Setup must have name field');
  assertContains(setupBlock, 'data-voice',     'Setup must have voice picker');
  assertContains(setupBlock, 'data-mem',       'Setup must have memory picker');
  assertContains(setupBlock, 'No account needed', 'Setup must state no account needed');
});

// ─────────────────────────────────────────────────────────────────────────────
// BONUS: Clear My Shadow Data is available without login
// ─────────────────────────────────────────────────────────────────────────────
test('BONUS: Clear My Shadow Data button exists and has no auth gate', function () {
  assertContains(indexSrc, 'srClearDataBtn', '"Clear My Shadow Data" button must exist');
  assertContains(indexSrc, 'Clear My Shadow Data', 'Button label must be present');
  assertNotContains(indexSrc, 'srClearMemoryBtn', 'Old auth-gated clear button must be removed');
  assertNotContains(indexSrc, 'srSignOutBtn', 'Sign Out button must be removed');
  assertNotContains(indexSrc, 'srMobileNavSignOut', 'Mobile nav Sign Out must be removed');
});

// ─────────────────────────────────────────────────────────────────────────────
// BONUS: SRAuthUI build tag is Shadow Edition Anonymous build
// ─────────────────────────────────────────────────────────────────────────────
test('BONUS: sr-auth-ui.js is Shadow Edition Anonymous build (not login UI build)', function () {
  assertContains(authUiSrc, 'SR-SHADOW-EDITION-ANON-1', 'Build ID must be Shadow Edition anon build');
  assertNotContains(authUiSrc, 'SR-STANDALONE-AUTH-UI-1', 'Old login build ID must not exist');
  assertNotContains(authUiSrc, 'signInWithEmailAndPassword', 'Must not have email login method');
  assertNotContains(authUiSrc, 'createUserWithEmailAndPassword', 'Must not have account creation');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log('  SR-NO-LOGIN TESTS — SHADOW EDITION ACCOUNT-FREE');
console.log('══════════════════════════════════════════════');
results.forEach(function (r) { console.log(r); });
console.log('\n  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
console.log('══════════════════════════════════════════════\n');

if (FAIL > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
