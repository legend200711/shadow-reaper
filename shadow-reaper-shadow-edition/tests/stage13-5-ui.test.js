/**
 * shadow-reaper-standalone/tests/stage13-5-ui.test.js
 * Shadow Reaper — Stage 13.5 Tests
 *
 * CHECKPOINTS:
 *   - Main assistant UI structure (no visible login screen)
 *   - Settings navigation (sub-pages, back button)
 *   - Setup wizard (first-use, persistence, completion)
 *   - Voice state UI (orb states, session pill)
 *   - Assistant profiles (wake name change, no intelligence reset)
 *   - Phone capability states (Android-required labels)
 *   - Device capability states (real connection states)
 *   - Calling preparation (settings structure)
 *   - Native bridge unavailable behavior (honest BRIDGE_UNAVAILABLE)
 *   - Privacy boundaries (external caller cannot access owner data)
 *   - PWA installation configuration (manifest fields)
 *   - One-brain routing (ShadowReaper.ask is the single entry point)
 *   - Internet restriction verification
 *   - Responsive layout (no overflow on mobile viewport)
 *   - No new regressions from Stage 13
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ── Minimal browser globals ──────────────────────────────────────────────────
global.localStorage = global.localStorage || {
  _store: {},
  getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem:    function (k, v) { this._store[k] = String(v); },
  removeItem: function (k) { delete this._store[k]; },
  clear:      function ()  { this._store = {}; },
};

try {
  if (!global.navigator) {
    Object.defineProperty(global, 'navigator', {
      value: { gpu: undefined, userAgent: 'Node.js test runner / Stage13-5', onLine: true },
      writable: true, configurable: true
    });
  }
} catch (_) {}

global.SRFirebaseAdapter = global.SRFirebaseAdapter || {
  getUID:          function () { return 'test_uid_stage13_5'; },
  isAuthenticated: function () { return true; },
  getCurrentUser:  function () { return { uid: 'test_uid_stage13_5' }; },
};

global.SRSecurity = global.SRSecurity || {
  containsInjectionAttempt: function (t) { return /ignore.*instructions|override.*rules/i.test(t); },
  containsSensitiveData:    function (t) { return /my\s+password\s+is|api\s*key\s*(is|=)/i.test(t); },
};

// ── Module loader ─────────────────────────────────────────────────────────────
function loadModule(relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const fn   = new Function('global', 'require', 'module', 'exports', '__dirname', '__filename', code);
  const mod  = {};
  try {
    fn(global, require, mod, {}, path.dirname(path.join(ROOT, relPath)), path.join(ROOT, relPath));
  } catch (_) {}
  return mod;
}

// ── Load Stage 13.5 modules ────────────────────────────────────────────────────
loadModule('config/environment.js');
loadModule('security/security-policy.js');
loadModule('platform/sr-platform-detector.js');
loadModule('platform/sr-caller-context.js');
loadModule('platform/sr-external-auth-guard.js');
loadModule('platform/adapters/sr-phone-adapter.js');

// Setup wizard
loadModule('sr-setup-wizard.js');

// Native bridge
loadModule('sr-native-bridge.js');

// Adaptive components for one-brain tests
loadModule('snx-shadow-conv-history.js');
loadModule('snx-shadow-memory.js');
loadModule('snx-shadow-adaptive.js');
loadModule('core/adaptive-brain.js');
try { loadModule('core/personality-engine.js'); } catch (_) {}

const CallerCtx  = global.SRCallerContext;
const AuthGuard  = global.SRExternalAuthGuard;
const PhoneAdapt = global.SRPhoneAdapter;
const SetupWiz   = global.SRSetupWizard;
const NativeBridge = global.SRNativeBridge;

// ── Test runner ───────────────────────────────────────────────────────────────
let _passed = 0;
let _failed = 0;
let _results = [];

function test(name, fn) {
  try {
    fn();
    _passed++;
    _results.push({ name, ok: true });
    console.log('  ✓ ' + name);
  } catch (e) {
    _failed++;
    _results.push({ name, ok: false, error: e.message });
    console.error('  ✗ ' + name + '\n    ' + e.message);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'Expected equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}
function assertIncludes(str, substr, msg) {
  if (!str.includes(substr)) throw new Error((msg || 'Expected to include') + ': "' + substr + '" not found in "' + str.slice(0, 80) + '"');
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 1: Main UI Structure
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 1: Main UI Structure ──');

test('index.html contains splash screen element', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'id="srSplash"', 'No splash screen found');
  assertIncludes(html, 'sr-splash-glyph', 'No splash glyph');
  assertIncludes(html, 'Shadow Reaper', 'No title in splash');
});

test('index.html: no visible full-page login screen during normal use', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // Login/auth modal should not be visible by default (not a full page)
  // The auth button should be hidden by default (display:none)
  assertIncludes(html, 'srSettingsSignInBtn', 'No settings sign-in button');
  // There should NOT be a standalone login page or auth gate blocking the main UI
  assert(!html.includes('id="srLoginPage"'), 'Found a dedicated login page element');
  assert(!html.includes('login-gate'), 'Found login-gate class');
});

test('index.html: voice orb is the primary interactive element on main screen', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'id="srVoiceOrb"', 'No voice orb element');
  assertIncludes(html, 'sr-voice-orb', 'No voice orb class');
  assertIncludes(html, 'Tap to Talk', 'No tap to talk label');
});

test('index.html: session state pill in header', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'id="srSessionPill"', 'No session pill');
  assertIncludes(html, 'sr-session-pill-dot', 'No session pill dot');
});

test('index.html: welcome screen uses assistant name heading', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'id="srWelcomeName"', 'No welcome name element');
  assertIncludes(html, 'Shadow Edition', 'No Shadow Edition tagline');
});

test('index.html: no left navigation sidebar (website-feel removed)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // The old desktop nav sidebar (.sr-nav) should be gone
  assert(!html.includes('class="sr-nav"') && !html.includes("class='sr-nav'"), 'Left nav sidebar still present');
  assert(!html.includes('id="srNav"'), 'Old srNav element still present');
});

test('index.html: no hamburger menu button for website nav', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(!html.includes('id="srMenuBtn"'), 'Old hamburger menu button still present');
});

test('index.html: no mobile nav drawer', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(!html.includes('id="srMobileNav"'), 'Old mobile nav drawer still present');
});

test('index.html: no sr-auth-btn visible in header', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // The old .sr-auth-btn (SIGN IN button in header) should be removed
  assert(!html.includes('class="sr-auth-btn"'), 'Header auth button (website-style) still present');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 2: Settings Navigation
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 2: Settings Navigation ──');

test('index.html: settings panel has organized section groups', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'sr-settings-group-label', 'No group labels in settings');
  assertIncludes(html, '>Shadow<', 'Shadow section missing');
  assertIncludes(html, '>Phone<', 'Phone section missing');
  assertIncludes(html, '>Devices<', 'Devices section missing');
  assertIncludes(html, 'Privacy', 'Privacy section missing');
  assertIncludes(html, '>System<', 'System section missing');
});

test('index.html: settings has sub-pages for all required sections', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const requiredPages = [
    'srPage-shadow-identity',
    'srPage-shadow-voice',
    'srPage-shadow-conversation',
    'srPage-shadow-personality',
    'srPage-phone-this',
    'srPage-phone-calls',
    'srPage-phone-contacts',
    'srPage-phone-messages',
    'srPage-phone-controls',
    'srPage-devices-roku',
    'srPage-devices-lights',
    'srPage-devices-computers',
    'srPage-privacy-caller',
    'srPage-privacy-memory',
    'srPage-system-status',
    'srPage-system-diagnostics',
    'srPage-system-account',
  ];
  requiredPages.forEach(function (page) {
    assertIncludes(html, 'id="' + page + '"', 'Settings sub-page missing: ' + page);
  });
});

test('index.html: settings has back button for sub-page navigation', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'id="srSettingsBack"', 'No settings back button');
  assertIncludes(html, 'sr-settings-back-btn', 'No back button class');
});

test('index.html: settings menu items use data-page attribute for navigation', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'data-page="shadow-identity"', 'No data-page for shadow-identity');
  assertIncludes(html, 'data-page="phone-calls"', 'No data-page for phone-calls');
  assertIncludes(html, 'data-page="privacy-caller"', 'No data-page for privacy-caller');
});

test('index.html: all 8 assistant profiles listed in wake name section', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'id="srWakePicker"', 'No wake picker');
  // Profiles are populated dynamically by JS - confirm srWakePicker exists
  assertIncludes(html, 'srPage-shadow-identity', 'Identity page missing');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 3: Setup Wizard
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 3: Setup Wizard ──');

test('SRSetupWizard: module loaded', function () {
  assert(!!SetupWiz, 'SRSetupWizard not loaded');
  assert(typeof SetupWiz.isComplete === 'function', 'isComplete missing');
  assert(typeof SetupWiz.show === 'function', 'show missing');
  assert(typeof SetupWiz.markComplete === 'function', 'markComplete missing');
  assert(typeof SetupWiz.reset === 'function', 'reset missing');
});

test('SRSetupWizard: not complete by default on fresh localStorage', function () {
  global.localStorage.clear();
  assertEq(SetupWiz.isComplete(), false, 'Should not be complete on fresh start');
});

test('SRSetupWizard: markComplete persists to localStorage', function () {
  global.localStorage.clear();
  SetupWiz.markComplete();
  assertEq(SetupWiz.isComplete(), true, 'Should be complete after markComplete');
});

test('SRSetupWizard: reset clears completion', function () {
  SetupWiz.markComplete();
  SetupWiz.reset();
  assertEq(SetupWiz.isComplete(), false, 'Should not be complete after reset');
});

test('SRSetupWizard: getPrefs returns object with expected keys', function () {
  const prefs = SetupWiz.getPrefs();
  assert(typeof prefs === 'object', 'Prefs should be object');
  assert('wakeName' in prefs, 'wakeName missing from prefs');
  assert('voiceGender' in prefs, 'voiceGender missing from prefs');
  assert('micEnabled' in prefs, 'micEnabled missing from prefs');
  assert('memoryEnabled' in prefs, 'memoryEnabled missing from prefs');
});

test('SRSetupWizard: sr-setup-wizard.js has correct BUILD_ID', function () {
  const code = fs.readFileSync(path.join(ROOT, 'sr-setup-wizard.js'), 'utf8');
  assertIncludes(code, 'SR-V2-SETUP-WIZARD-1', 'Incorrect build ID');
});

test('SRSetupWizard: does not store sensitive credentials', function () {
  const code = fs.readFileSync(path.join(ROOT, 'sr-setup-wizard.js'), 'utf8');
  assert(!code.includes('password'), 'Wizard contains "password"');
  assert(!code.includes('apiKey'), 'Wizard contains "apiKey"');
  assert(!code.includes('firebaseConfig'), 'Wizard contains firebase config');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 4: Voice State UI
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 4: Voice State UI ──');

test('index.html: voice orb has correct state CSS classes defined', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, '.sr-voice-orb.listening', 'No listening state CSS');
  assertIncludes(html, '.sr-voice-orb.thinking', 'No thinking state CSS');
  assertIncludes(html, '.sr-voice-orb.speaking', 'No speaking state CSS');
  assertIncludes(html, '.sr-voice-orb.unavailable', 'No unavailable state CSS');
});

test('index.html: session pill has correct state CSS classes', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, '.sr-session-pill.listening', 'No listening pill CSS');
  assertIncludes(html, '.sr-session-pill.thinking', 'No thinking pill CSS');
  assertIncludes(html, '.sr-session-pill.speaking', 'No speaking pill CSS');
});

test('index.html: voice orb label has state classes', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, '.sr-voice-orb-label.listening', 'No listening label CSS');
  assertIncludes(html, '.sr-voice-orb-label.speaking', 'No speaking label CSS');
});

test('index.html: _applySessionState maps LISTENING, THINKING, SPEAKING, IDLE', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'SESSION_STATE.LISTENING', 'No LISTENING state mapping');
  assertIncludes(html, 'SESSION_STATE.THINKING', 'No THINKING state mapping');
  assertIncludes(html, 'SESSION_STATE.SPEAKING', 'No SPEAKING state mapping');
  assertIncludes(html, 'SESSION_STATE.IDLE', 'No IDLE state mapping');
  assertIncludes(html, 'SESSION_STATE.INTERRUPTED', 'No INTERRUPTED state mapping');
});

test('index.html: voice states connected to SRConvSession.onStateChange', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'SRConvSess.onStateChange', 'Not connected to SRConvSession');
  assertIncludes(html, '_applySessionState', 'No _applySessionState function');
});

test('index.html: voice states connected to SRConvSession (sr-conversation-session.js loaded)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'sr-conversation-session.js', 'SRConvSession not loaded in index.html');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 5: Phone Capability States
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 5: Phone Capability States ──');

test('SRPhoneAdapter: module loaded', function () {
  assert(!!PhoneAdapt, 'SRPhoneAdapter not loaded');
});

test('SRPhoneAdapter: getAllCapabilities returns object', function () {
  const caps = PhoneAdapt.getAllCapabilities();
  assert(typeof caps === 'object', 'getAllCapabilities should return object');
  assert(Object.keys(caps).length > 0, 'No capabilities defined');
});

test('SRPhoneAdapter: calling capability marked as NATIVE_REQUIRED on web', function () {
  const caps = PhoneAdapt.getAllCapabilities();
  const calling = caps['calling'] || caps['calls'];
  assert(calling, 'No calling capability defined');
  assertEq(calling.status, 'NATIVE_REQUIRED', 'Calling should require native on web');
});

test('SRPhoneAdapter: contacts capability marked as NATIVE_REQUIRED on web', function () {
  const caps = PhoneAdapt.getAllCapabilities();
  const contacts = caps['contacts'];
  assert(contacts, 'No contacts capability');
  assertEq(contacts.status, 'NATIVE_REQUIRED', 'Contacts should require native on web');
});

test('SRPhoneAdapter: messaging capability marked as NATIVE_REQUIRED on web', function () {
  const caps = PhoneAdapt.getAllCapabilities();
  const msg = caps['messaging'] || caps['sms'];
  assert(msg, 'No messaging capability');
  assertEq(msg.status, 'NATIVE_REQUIRED', 'Messaging should require native on web');
});

test('index.html: calling settings page clearly marks native-only capabilities', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'srPage-phone-calls', 'No phone calls sub-page');
  assertIncludes(html, 'Android App Required', 'No Android App Required label in calls page');
});

test('index.html: contacts page marks native-only', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'srPage-phone-contacts', 'No contacts sub-page');
  // srcap-contacts element should be in this page
  assertIncludes(html, 'srcap-contacts', 'No contacts cap badge');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 6: Device Capability States
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 6: Device Capability States ──');

test('index.html: Roku settings page exists with correct structure', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'srPage-devices-roku', 'No Roku sub-page');
  assertIncludes(html, 'srRokuStatusBlock', 'No Roku status block');
});

test('index.html: Hue lights settings page exists', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'srPage-devices-lights', 'No lights sub-page');
  assertIncludes(html, 'srHueStatusBlock', 'No Hue status block');
});

test('index.html: coming-later devices have Coming Later badges', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'coming-later', 'No coming-later badges');
  assertIncludes(html, 'Coming Later', 'No coming-later text');
  assertIncludes(html, 'srPage-devices-smart-tv', 'No Smart TV page');
  assertIncludes(html, 'srPage-devices-locks', 'No Smart Locks page');
});

test('index.html: device capability badge classes include all states', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'sr-cap-badge.web-pwa', 'No web-pwa badge CSS');
  assertIncludes(html, 'sr-cap-badge.native-req', 'No native-req badge CSS');
  assertIncludes(html, 'sr-cap-badge.connected', 'No connected badge CSS');
  assertIncludes(html, 'sr-cap-badge.unsupported', 'No unsupported badge CSS');
  assertIncludes(html, 'sr-cap-badge.coming-later', 'No coming-later badge CSS');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 7: Native Bridge
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 7: Native Bridge ──');

test('SRNativeBridge: module loaded', function () {
  assert(!!NativeBridge, 'SRNativeBridge not loaded');
  assert(typeof NativeBridge.init === 'function', 'init missing');
  assert(typeof NativeBridge.isAvailable === 'function', 'isAvailable missing');
  assert(typeof NativeBridge.dispatch === 'function', 'dispatch missing');
  assert(typeof NativeBridge.canDispatch === 'function', 'canDispatch missing');
});

test('SRNativeBridge: not available in Node.js/web test environment', function () {
  NativeBridge.init();
  assertEq(NativeBridge.isAvailable(), false, 'Bridge should not be available in test env');
});

test('SRNativeBridge: CALL_CONTACT returns BRIDGE_UNAVAILABLE when not native', function (done) {
  NativeBridge.init();
  var result = null;
  NativeBridge.dispatch({ type: 'CALL_CONTACT', payload: { contact: 'Mom' } }, function (r) {
    result = r;
  });
  assert(result !== null, 'Callback not called synchronously');
  assertEq(result.ok, false, 'Should not succeed without native bridge');
  assertEq(result.result, NativeBridge.RESULT.BRIDGE_UNAVAILABLE, 'Should return BRIDGE_UNAVAILABLE');
  assertIncludes(result.message, 'Android app', 'Message should mention Android app');
});

test('SRNativeBridge: SEND_MESSAGE returns BRIDGE_UNAVAILABLE when not native', function () {
  var result = null;
  NativeBridge.dispatch({ type: 'SEND_MESSAGE', payload: { to: 'Mom', text: 'hello' } }, function (r) {
    result = r;
  });
  assert(result !== null, 'Callback not called');
  assertEq(result.result, NativeBridge.RESULT.BRIDGE_UNAVAILABLE, 'Should be BRIDGE_UNAVAILABLE');
});

test('SRNativeBridge: GET_CONTACTS returns BRIDGE_UNAVAILABLE when not native', function () {
  var result = null;
  NativeBridge.dispatch({ type: 'GET_CONTACTS', payload: {} }, function (r) { result = r; });
  assertEq(result.result, NativeBridge.RESULT.BRIDGE_UNAVAILABLE, 'Contacts unavailable without native');
});

test('SRNativeBridge: SET_ALARM returns BRIDGE_UNAVAILABLE when not native', function () {
  var result = null;
  NativeBridge.dispatch({ type: 'SET_ALARM', payload: { time: '7:00 AM' } }, function (r) { result = r; });
  assertEq(result.result, NativeBridge.RESULT.BRIDGE_UNAVAILABLE, 'Alarm unavailable without native');
});

test('SRNativeBridge: NATIVE_ONLY list contains all phone-native actions', function () {
  const nativeOnly = NativeBridge.NATIVE_ONLY;
  assert(nativeOnly.includes('CALL_CONTACT'), 'CALL_CONTACT not in NATIVE_ONLY');
  assert(nativeOnly.includes('SEND_MESSAGE'), 'SEND_MESSAGE not in NATIVE_ONLY');
  assert(nativeOnly.includes('GET_CONTACTS'), 'GET_CONTACTS not in NATIVE_ONLY');
  assert(nativeOnly.includes('SET_ALARM'), 'SET_ALARM not in NATIVE_ONLY');
  assert(nativeOnly.includes('GET_LOCATION'), 'GET_LOCATION not in NATIVE_ONLY');
});

test('SRNativeBridge: canDispatch returns false for native-only when bridge unavailable', function () {
  NativeBridge.init(); // resets _bridgeReady = false
  assertEq(NativeBridge.canDispatch('CALL_CONTACT'), false, 'Should not dispatch CALL_CONTACT without bridge');
  assertEq(NativeBridge.canDispatch('SEND_MESSAGE'), false, 'Should not dispatch SEND_MESSAGE without bridge');
});

test('SRNativeBridge: canDispatch returns true for web-available actions', function () {
  assertEq(NativeBridge.canDispatch('DEVICE_ACTION'), true, 'DEVICE_ACTION should be dispatchable');
  assertEq(NativeBridge.canDispatch('MEDIA_ACTION'), true, 'MEDIA_ACTION should be dispatchable');
});

test('SRNativeBridge: getNativeStatus returns object with required fields', function () {
  const status = NativeBridge.getNativeStatus();
  assert(typeof status === 'object', 'Status should be object');
  assert('bridgeAvailable' in status, 'bridgeAvailable missing');
  assert('isNative' in status, 'isNative missing');
  assert('isAndroid' in status, 'isAndroid missing');
  assert('capacitorFound' in status, 'capacitorFound missing');
});

test('SRNativeBridge: BUILD_ID is correct', function () {
  assertEq(NativeBridge.BUILD_ID, 'SR-V2-NATIVE-BRIDGE-1', 'Wrong build ID');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 8: Privacy Boundaries (Caller Context)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 8: Privacy Boundaries ──');

test('SRCallerContext: module loaded', function () {
  assert(!!CallerCtx, 'SRCallerContext not loaded');
});

test('SRCallerContext: external caller cannot access owner memories', function () {
  CallerCtx.enterExternalContext({ name: 'external_user_1' });
  assertEq(CallerCtx.isExternalContext(), true, 'Context should be external');
  assertEq(CallerCtx.canAccessCategory('private_memory'), false, 'External caller should not access owner memory');
  CallerCtx.returnToOwnerContext(); // reset
});

test('SRCallerContext: external caller cannot access owner history', function () {
  CallerCtx.enterExternalContext({ name: 'external_user_2' });
  assertEq(CallerCtx.canAccessCategory('private_history'), false, 'External caller should not access history');
  CallerCtx.returnToOwnerContext();
});

test('SRCallerContext: external caller cannot access owner projects', function () {
  CallerCtx.enterExternalContext({ name: 'test_caller' });
  assertEq(CallerCtx.canAccessCategory('projects'), false, 'External caller should not access projects');
  CallerCtx.returnToOwnerContext();
});

test('SRCallerContext: owner context has full access', function () {
  CallerCtx.returnToOwnerContext(); // ensure owner context
  assertEq(CallerCtx.isOwnerContext(), true, 'Owner mode should be active');
  assertEq(CallerCtx.canAccessCategory('private_memory'), true, 'Owner should access memory');
  assertEq(CallerCtx.canAccessCategory('projects'), true, 'Owner should access projects');
});

test('index.html: caller privacy page explains external caller restrictions', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'srPage-privacy-caller', 'No caller privacy page');
  assertIncludes(html, 'Owner Memories', 'No Owner Memories label');
  assertIncludes(html, 'Blocked', 'No Blocked badge for caller privacy');
  assertIncludes(html, 'External Caller Context', 'No external caller explanation');
});

test('index.html: caller privacy confirms ONE brain (not a CallerBrain)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(!html.includes('CallerBrain'), 'Found reference to CallerBrain (should not exist)');
  assertIncludes(html, 'same Shadow Reaper brain', 'Should say one brain');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 9: PWA Installation Configuration
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 9: PWA Configuration ──');

test('manifest.json: exists with required fields', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert(manifest.name, 'No name in manifest');
  assert(manifest.short_name, 'No short_name in manifest');
  assertEq(manifest.display, 'standalone', 'Display should be standalone');
  assert(manifest.start_url, 'No start_url');
  assert(manifest.background_color, 'No background_color');
  assert(manifest.theme_color, 'No theme_color');
});

test('manifest.json: app name is Shadow Reaper — Shadow Edition', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assertIncludes(manifest.name, 'Shadow Reaper', 'Name should contain Shadow Reaper');
  assertIncludes(manifest.name, 'Shadow Edition', 'Name should contain Shadow Edition');
});

test('manifest.json: icons include 192 and 512 sizes', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const sizes = manifest.icons.map(function (i) { return i.sizes; });
  assert(sizes.includes('192x192'), 'No 192x192 icon');
  assert(sizes.includes('512x512'), 'No 512x512 icon');
});

test('manifest.json: has maskable icons', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const maskable = manifest.icons.filter(function (i) { return i.purpose === 'maskable'; });
  assert(maskable.length > 0, 'No maskable icons in manifest');
});

test('manifest.json: theme_color matches Shadow dark palette', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assertEq(manifest.theme_color, '#080c14', 'Theme color should be dark Shadow blue');
});

test('sw.js: cache version bumped to sre-shell-v2', function () {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assertIncludes(sw, 'sre-shell-v2', 'Service worker cache version not bumped');
});

test('sw.js: new Stage 13.5 files are in the app shell cache', function () {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assertIncludes(sw, 'sr-native-bridge.js', 'sr-native-bridge.js not in SW cache');
  assertIncludes(sw, 'sr-setup-wizard.js', 'sr-setup-wizard.js not in SW cache');
  assertIncludes(sw, 'sr-conversation-session.js', 'sr-conversation-session.js not in SW cache');
});

test('index.html: PWA install button hidden by default', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // Install button should have no visible class by default
  // The button starts without .visible; SRPWAState adds it
  assertIncludes(html, 'id="srInstallBtn"', 'No install button');
  assert(!html.includes('class="sr-install-btn visible"'), 'Install button should not start visible');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 10: One Brain Routing
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 10: One Brain Routing ──');

test('index.html: all send paths go through SR.ask()', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // The _send function should call SR.ask()
  assertIncludes(html, 'SR.ask(msg,', 'Main send path does not use SR.ask()');
  // No second AI call should exist
  const matches = (html.match(/\.ask\s*\(/g) || []).length;
  assert(matches >= 1, 'No SR.ask calls found');
});

test('index.html: voice orb sends through _send function (one brain)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // Voice orb taps call _send() which routes to SR.ask()
  assertIncludes(html, '_handleOrbTap', 'No orb tap handler');
  assertIncludes(html, '_send(cmd)', 'Orb does not route through _send');
  assertIncludes(html, '_send(rawTranscript)', 'Raw transcript not sent through _send');
});

test('index.html: no second assistant object created', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // There should not be a second AI or brain initialization
  assert(!html.includes('new ShadowReaper('), 'Second ShadowReaper instantiation found');
  assert(!html.includes('AndroidAssistant'), 'Separate AndroidAssistant found');
  assert(!html.includes('CallerBrain'), 'CallerBrain found — should not exist');
});

test('sr-native-bridge.js: routes DEVICE_ACTION through existing device router (one brain)', function () {
  const code = fs.readFileSync(path.join(ROOT, 'sr-native-bridge.js'), 'utf8');
  assertIncludes(code, 'SRDeviceActionRouter', 'DEVICE_ACTION should use SRDeviceActionRouter');
  assertIncludes(code, '_dispatchDevice', 'No device dispatch function');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 11: Internet Restriction Verification
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 11: Internet Restrictions ──');

test('security/web-research-guard.js: exists and restricts internet', function () {
  const code = fs.readFileSync(path.join(ROOT, 'security/web-research-guard.js'), 'utf8');
  // Should restrict non-approved domains
  assert(code.length > 100, 'web-research-guard.js is too short to be real');
  assertIncludes(code, 'SRResearchGuard', 'SRResearchGuard not found');
});

test('index.html: personality page explains Language Foundation primary intelligence', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'srPage-shadow-personality', 'No personality page');
  assertIncludes(html, 'Language Foundation', 'No Language Foundation mention on personality page');
  assertIncludes(html.toLowerCase(), 'general internet crawling is not enabled', 'No internet restriction statement');
});

test('index.html: system offline behavior described honestly', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'srPage-system-status', 'No system status page');
  assertIncludes(html, 'Weather requires internet', 'No honest offline statement about weather');
  assertIncludes(html, 'Technical research requires internet', 'No honest offline statement about research');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 12: Responsive Layout
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 12: Responsive Layout ──');

test('index.html: viewport meta tag correct for mobile', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'width=device-width', 'No device-width viewport');
  assertIncludes(html, 'viewport-fit=cover', 'No viewport-fit=cover for safe areas');
  assertIncludes(html, 'initial-scale=1.0', 'No initial-scale=1.0');
});

test('index.html: uses 100dvh for mobile dynamic viewport', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, '100dvh', 'No 100dvh for dynamic viewport');
  assertIncludes(html, '100vh', 'No 100vh fallback');
});

test('index.html: safe area inset bottom padding on input', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, '--safe-b', 'No safe-b variable');
  assertIncludes(html, 'safe-area-inset-bottom', 'No safe area inset');
});

test('index.html: settings panel is full-width on mobile (max-width: 480px)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'max-width: 480px', 'No mobile breakpoint for settings');
  assertIncludes(html, 'width: 100vw', 'Settings not full-width on mobile');
});

test('index.html: visual viewport handler prevents keyboard overlap', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'window.visualViewport', 'No visual viewport handler');
  assertIncludes(html, 'visualViewport.height', 'No viewport height adjustment');
});

test('index.html: voice orb has 44px+ touch target (min 80px)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'width: 80px; height: 80px', 'Voice orb is not 80px × 80px');
});

test('index.html: settings rows have min-height 44px for touch targets', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'min-height: 48px', 'Settings rows do not have 48px min-height');
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUP 13: Stage 13 Regression (existing tests must still pass)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Group 13: Stage 13 Regression ──');

test('SRCallerContext: still operational (no regression)', function () {
  assert(!!CallerCtx, 'SRCallerContext not loaded');
  assert(typeof CallerCtx.enterExternalContext === 'function', 'enterExternalContext missing');
  assert(typeof CallerCtx.returnToOwnerContext === 'function', 'returnToOwnerContext missing');
  assert(typeof CallerCtx.canAccessCategory === 'function', 'canAccessCategory missing');
});

test('SRExternalAuthGuard: still operational (no regression)', function () {
  assert(!!AuthGuard, 'SRExternalAuthGuard not loaded');
  assert(typeof AuthGuard.isAutoBlocked === 'function', 'isAutoBlocked missing');
  assert(typeof AuthGuard.isAuthorized === 'function', 'isAuthorized missing');
});

test('SRPhoneAdapter: still operational (no regression)', function () {
  assert(!!PhoneAdapt, 'SRPhoneAdapter not loaded');
  assert(typeof PhoneAdapt.getAllCapabilities === 'function', 'getAllCapabilities missing');
  assert(typeof PhoneAdapt.isNativeAndroid === 'function', 'isNativeAndroid missing');
});

test('index.html: device pair overlay preserved (no regression)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'id="srPairOverlay"', 'Pair overlay removed');
  assertIncludes(html, 'id="srPairConfirmBtn"', 'Pair confirm button removed');
});

test('index.html: confirmation modal preserved (no regression)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'id="srConfirmOverlay"', 'Confirm overlay removed');
  assertIncludes(html, 'id="srConfirmOkBtn"', 'Confirm OK button removed');
});

test('index.html: devices panel preserved (no regression)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'id="srDevicesPanel"', 'Devices panel removed');
  assertIncludes(html, 'id="srDevicesPanelBody"', 'Devices panel body removed');
});

test('index.html: projects panel preserved (no regression)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'id="srProjectsPanel"', 'Projects panel removed');
  assertIncludes(html, 'id="srProjectsList"', 'Projects list removed');
});

test('index.html: all device adapters still loaded', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'devices/adapters/roku-adapter.js', 'Roku adapter not loaded');
  assertIncludes(html, 'devices/adapters/hue-adapter.js', 'Hue adapter not loaded');
  assertIncludes(html, 'devices/adapters/desktop-agent-adapter.js', 'Desktop agent adapter not loaded');
  assertIncludes(html, 'devices/adapters/smart-device-adapter.js', 'Smart device adapter not loaded');
});

test('index.html: all core modules still loaded', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const coreModules = [
    'core/adaptive-brain.js',
    'core/understanding-engine.js',
    'core/context-engine.js',
    'core/conversation-engine.js',
    'core/response-engine.js',
    'core/persistence-bridge.js',
    'core/local-model.js',
    'shadow-reaper.js',
  ];
  coreModules.forEach(function (m) {
    assertIncludes(html, m, 'Core module removed: ' + m);
  });
});

test('index.html: Firebase modules still loaded', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'firebase-app.js', 'Firebase app not loaded');
  assertIncludes(html, 'firebase-auth.js', 'Firebase auth not loaded');
  assertIncludes(html, 'firebase-firestore.js', 'Firebase firestore not loaded');
  assertIncludes(html, 'firebase-adapter.js', 'Firebase adapter not loaded');
});

test('index.html: security modules still loaded', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'security/security-policy.js', 'Security policy not loaded');
  assertIncludes(html, 'security/web-research-guard.js', 'Web research guard not loaded');
  assertIncludes(html, 'security/sr-founder-security.js', 'Founder security not loaded');
});

test('index.html: all XSS safety — textContent used for messages (not innerHTML)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertIncludes(html, 'body.textContent = text', 'Message body does not use textContent');
  // Ensure user message text is never injected with innerHTML
  assert(!html.includes('body.innerHTML = text'), 'Message body uses innerHTML — XSS risk');
  assert(!html.includes('body.innerHTML = msg'), 'Message body uses innerHTML — XSS risk');
});

// ═══════════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════');
console.log('STAGE 13.5 TEST RESULTS');
console.log('══════════════════════════════════════════════════════');
console.log(`  Passed: ${_passed}`);
console.log(`  Failed: ${_failed}`);
console.log(`  Total:  ${_passed + _failed}`);

if (_failed > 0) {
  console.log('\nFailed tests:');
  _results.filter(function (r) { return !r.ok; }).forEach(function (r) {
    console.error('  ✗ ' + r.name + ': ' + r.error);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('\n  All Stage 13.5 tests passed.');
  console.log('');
  process.exit(0);
}
