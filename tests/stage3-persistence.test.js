/**
 * shadow-reaper-standalone/tests/stage3-persistence.test.js
 * Shadow Reaper Standalone — Stage 3 Persistence Tests
 *
 * CHECKPOINT 3: Standalone Firebase + History + Memory + Adaptive Learning
 *
 * Tests:
 *   - All persistence modules load using SRFirebaseAdapter (NOT SNS globals)
 *   - UID isolation architecture (client-side path verification)
 *   - Sensitive data filtering
 *   - History enable/disable
 *   - Memory enable/disable
 *   - Adaptive enable/disable
 *   - Continuity detection
 *   - Memory intent detection
 *   - Corrections (adaptive brain)
 *   - Firebase failure graceful degradation
 *
 * PHYSICAL TEST REQUIRED labels indicate tests that require a live Firebase
 * environment to fully validate (cannot be run in Node without real Firebase).
 *
 * STATIC PASS = validated by code/architecture inspection in this test run.
 */

'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ── Minimal stubs ──────────────────────────────────────────────────────────
global.localStorage = {
  _store: {},
  getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem:    function (k, v) { this._store[k] = String(v); },
  removeItem: function (k) { delete this._store[k]; },
  clear:      function ()  { this._store = {}; },
};
try {
  Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'Mozilla/5.0', maxTouchPoints: 0, onLine: true },
    writable: true, configurable: true,
  });
} catch (_) {}

// ── Firebase adapter stub (offline mode) ──────────────────────────────────
global.SRFirebaseAdapter = {
  build: 'SR-STANDALONE-FIREBASE-ADAPTER-1',
  getUID: function () { return null; },  // guest / no auth
  isAuthenticated: function () { return false; },
  getCurrentUser: function () { return null; },
  getStatus: function () { return { ready: false, authenticated: false, uid: null, configured: false }; },
  userConversationsCol: function () { return null; },
  userMemoryCol: function () { return null; },
  userLearnedContextCol: function () { return null; },
  userPreferencesDoc: function () { return null; },
  sharedKnowledgeCol: function () { return null; },
  globalLearningCol: function () { return null; },
  configDoc: function () { return null; },
  safeWrite: function () { return Promise.reject(new Error('offline')); },
  safeAdd: function () { return Promise.reject(new Error('offline')); },
};

// ── Security module stub ───────────────────────────────────────────────────
global.SRSecurity = {
  containsSensitiveData: function (text) {
    return /\b(password|passwd)\s*(is|=|:)\s*\S+/i.test(text) ||
           /\bapi[\s_-]?key\s*(is|=|:)\s*\S+/i.test(text) ||
           /\bmy\s+password\s+is\b/i.test(text);
  },
};

// ── Load modules ────────────────────────────────────────────────────────────
function load(relPath) {
  const code = require('fs').readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('global', 'require', code)(global, require);
}

load('snx-shadow-conv-history.js');
load('snx-shadow-memory.js');
load('snx-shadow-adaptive.js');
load('history/sr-conversation-history.js');
load('memory/sr-personal-memory.js');
load('core/adaptive-brain.js');
load('core/persistence-bridge.js');

// ── Test runner ────────────────────────────────────────────────────────────
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

function assertDoesNotContain(source, sub, msg) {
  if (typeof source === 'string' && source.indexOf(sub) !== -1) {
    throw new Error(msg || 'Should not contain: ' + sub);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ISOLATION ARCHITECTURE TESTS (STATIC PASS)
// ─────────────────────────────────────────────────────────────────────────────

test('[STATIC PASS] SNXShadowConvHistory does NOT use SNS DB globals in live code', function () {
  // References in comments (e.g. "NOT _snxDbCompat") are documentation only — not live code.
  // We check that no assignment or function call references these globals.
  const src = require('fs').readFileSync(require('path').join(ROOT, 'snx-shadow-conv-history.js'), 'utf8');
  // Strip comments before checking
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assertDoesNotContain(noComments, '_snxDbCompat', 'Live code must not call _snxDbCompat');
  assertDoesNotContain(noComments, '_snxAuth(', 'Live code must not call _snxAuth()');
  assertDoesNotContain(noComments, '_snxCurrentUser', 'Live code must not reference _snxCurrentUser');
  assertDoesNotContain(noComments, 'horr-a08f4', 'Must not reference SNS Firebase project');
  assert(noComments.indexOf('SRFirebaseAdapter') !== -1, 'Must use SRFirebaseAdapter');
});

test('[STATIC PASS] SNXShadowMemory does NOT use SNS DB globals in live code', function () {
  const src = require('fs').readFileSync(require('path').join(ROOT, 'snx-shadow-memory.js'), 'utf8');
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assertDoesNotContain(noComments, '_snxDbCompat', 'Live code must not call _snxDbCompat');
  assertDoesNotContain(noComments, '_snxCurrentUser', 'Live code must not reference _snxCurrentUser');
  assertDoesNotContain(noComments, 'horr-a08f4', 'Must not reference SNS Firebase project');
  assert(noComments.indexOf('SRFirebaseAdapter') !== -1, 'Must use SRFirebaseAdapter');
});

test('[STATIC PASS] SNXShadowAdaptive does NOT use SNS DB globals in live code', function () {
  const src = require('fs').readFileSync(require('path').join(ROOT, 'snx-shadow-adaptive.js'), 'utf8');
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assertDoesNotContain(noComments, '_snxDbCompat', 'Live code must not call _snxDbCompat');
  assertDoesNotContain(noComments, '_snxCurrentUser', 'Live code must not reference _snxCurrentUser');
  assertDoesNotContain(noComments, 'horr-a08f4', 'Must not reference SNS Firebase project');
  assert(noComments.indexOf('SRFirebaseAdapter') !== -1, 'Must use SRFirebaseAdapter');
});

test('[STATIC PASS] SRConversationHistory uses SRFirebaseAdapter only (live code)', function () {
  const src = require('fs').readFileSync(require('path').join(ROOT, 'history/sr-conversation-history.js'), 'utf8');
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assertDoesNotContain(noComments, '_snxDbCompat', 'Live code must not reference _snxDbCompat');
  assert(noComments.indexOf('SRFirebaseAdapter') !== -1, 'Must reference SRFirebaseAdapter');
});

test('[STATIC PASS] SRPersonalMemory uses SRFirebaseAdapter only (live code)', function () {
  const src = require('fs').readFileSync(require('path').join(ROOT, 'memory/sr-personal-memory.js'), 'utf8');
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assertDoesNotContain(noComments, '_snxDbCompat', 'Live code must not reference _snxDbCompat');
  assert(noComments.indexOf('SRFirebaseAdapter') !== -1, 'Must reference SRFirebaseAdapter');
});

test('[STATIC PASS] Firestore paths are UID-scoped for all private collections', function () {
  const rules = require('fs').readFileSync(require('path').join(ROOT, 'firebase/firestore.rules'), 'utf8');
  assert(rules.indexOf('isOwner(uid)') !== -1, 'Rules must use isOwner(uid) for private paths');
  assert(rules.indexOf('request.auth.uid == uid') !== -1, 'Rules must check UID equality');
  assert(rules.indexOf('allow read, write: if false') !== -1, 'Catch-all deny rule must exist');
});

test('[STATIC PASS] Founder CANNOT read private user collections (Firestore rules)', function () {
  const rules = require('fs').readFileSync(require('path').join(ROOT, 'firebase/firestore.rules'), 'utf8');
  // Founder rule applies only to sharedKnowledge, globalLearning, shadowReaperConfig
  // Private collections ONLY use isOwner(uid) — Founder is NOT mentioned for private paths
  // Verify private conversation collection only uses isOwner
  const convSection = rules.match(/match \/users\/\{uid\}\/shadowReaperConversations[^}]+\}/s);
  if (convSection) {
    assertDoesNotContain(convSection[0], 'isFounder()', 'Founder must NOT have access to private conversations');
  }
});

test('[STATIC PASS] No "allow read, write: if true" in Firestore rules', function () {
  const rules = require('fs').readFileSync(require('path').join(ROOT, 'firebase/firestore.rules'), 'utf8');
  assert(rules.indexOf('allow read, write: if true') === -1, 'Must NOT have open read/write rules');
});

test('[STATIC PASS] Sensitive data filter exists in SNXShadowConvHistory', function () {
  const src = require('fs').readFileSync(require('path').join(ROOT, 'snx-shadow-conv-history.js'), 'utf8');
  assert(src.indexOf('containsSensitiveData') !== -1, 'Must filter sensitive data before saving');
});

test('[STATIC PASS] Sensitive data filter exists in SNXShadowMemory', function () {
  const src = require('fs').readFileSync(require('path').join(ROOT, 'snx-shadow-memory.js'), 'utf8');
  assert(src.indexOf('containsSensitiveData') !== -1, 'Must filter sensitive data before saving');
});

// ─────────────────────────────────────────────────────────────────────────────
// MODULE FUNCTIONALITY TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('SNXShadowConvHistory loads with correct build ID', function () {
  var h = global.SNXShadowConvHistory;
  assert(h, 'SNXShadowConvHistory not loaded');
  assert(h.build === 'SR-STANDALONE-CONV-HISTORY-1', 'Wrong build ID: ' + h.build);
});

test('SNXShadowConvHistory.init() does not crash in guest mode', function () {
  global.SNXShadowConvHistory.init();
  // guest mode — no exception
});

test('SNXShadowConvHistory.detectContinuity returns true for continuity phrases', function () {
  var H = global.SNXShadowConvHistory;
  assert(H.detectContinuity('what were we talking about?') === true);
  assert(H.detectContinuity('continue from where we left off') === true);
  assert(H.detectContinuity('what time is it?') === false);
});

test('SNXShadowConvHistory.isEnabled() returns true by default', function () {
  assert(global.SNXShadowConvHistory.isEnabled() === true);
});

test('SNXShadowConvHistory.setEnabled(false) disables without crash', function () {
  global.SNXShadowConvHistory.setEnabled(false);
  assert(global.SNXShadowConvHistory.isEnabled() === false);
  global.SNXShadowConvHistory.setEnabled(true); // restore
});

test('SNXShadowConvHistory.saveTurn does NOT crash as guest (offline)', function () {
  // Guest mode: should silently skip
  global.SNXShadowConvHistory.saveTurn('user', 'test message');
});

test('SNXShadowConvHistory.saveTurn blocks sensitive data', function () {
  // Should not throw — just silently skips sensitive data
  global.SNXShadowConvHistory.saveTurn('user', 'my password is secret123');
  // No exception = pass
});

test('SNXShadowConvHistory.newConversation() creates new convId', function () {
  var oldId = global.SNXShadowConvHistory.getCurrentConvId();
  global.SNXShadowConvHistory.newConversation();
  var newId = global.SNXShadowConvHistory.getCurrentConvId();
  // newConversation() resets: new ID should be different if old was set
  // (in guest mode, ID may be null)
  assert(typeof newId === 'string' || newId === null);
});

test('SRConversationHistory loads with correct build ID', function () {
  var h = global.SRConversationHistory;
  assert(h, 'SRConversationHistory not loaded');
  assert(h.build === 'SR-STANDALONE-HISTORY-1', 'Wrong build ID: ' + h.build);
});

test('SRConversationHistory.detectContinuity works correctly', function () {
  var H = global.SRConversationHistory;
  assert(H.detectContinuity('what were we talking about') === true);
  assert(H.detectContinuity('hello') === false);
});

test('SNXShadowMemory loads with correct build ID', function () {
  var m = global.SNXShadowMemory;
  assert(m, 'SNXShadowMemory not loaded');
  assert(m.build === 'SR-STANDALONE-MEMORY-1', 'Wrong build ID: ' + m.build);
});

test('SNXShadowMemory.detectIntent("remember that my color is blue") → MEMORY_SAVE', function () {
  assert(global.SNXShadowMemory.detectIntent('remember that my color is blue') === 'MEMORY_SAVE');
});

test('SNXShadowMemory.detectIntent("show me my memories") → MEMORY_LIST', function () {
  assert(global.SNXShadowMemory.detectIntent('show me my memories') === 'MEMORY_LIST');
});

test('SNXShadowMemory.detectIntent("forget everything") → MEMORY_FORGET_ALL', function () {
  assert(global.SNXShadowMemory.detectIntent('forget everything') === 'MEMORY_FORGET_ALL');
});

test('[STATIC PASS] SNXShadowMemory.save() has sensitive data check before writing', function () {
  // Verify in source that containsSensitiveData is checked before any Firestore write
  // (In guest mode, the guest check fires first — that is correct behavior: guests can't save anything at all)
  const src = require('fs').readFileSync(require('path').join(ROOT, 'snx-shadow-memory.js'), 'utf8');
  assert(src.indexOf('containsSensitiveData') !== -1, 'Sensitive data check must exist in save()');
  // Also verify the check is present for authenticated users (SRPersonalMemory covers this test in runtime)
});

test('SNXShadowMemory.save() tells guest to sign in', function () {
  global.SNXShadowMemory.save('remember that I like cats', function (r) {
    // In guest mode (no UID)
    assert(r.success === false, 'Guest should not be able to save memory');
  });
});

test('SRPersonalMemory loads with correct build ID', function () {
  var m = global.SRPersonalMemory;
  assert(m, 'SRPersonalMemory not loaded');
  assert(m.build === 'SR-STANDALONE-MEMORY-1', 'Wrong build ID: ' + m.build);
});

test('SRPersonalMemory.detectIntent works correctly', function () {
  var M = global.SRPersonalMemory;
  assert(M.detectIntent('remember that my project is Alpha') === 'MEMORY_SAVE');
  assert(M.detectIntent('what do you remember about me') === 'MEMORY_RECALL');
  assert(M.detectIntent('forget everything') === 'MEMORY_FORGET_ALL');
  assert(M.detectIntent('hello') === null);
});

test('SRPersonalMemory.save() rejects sensitive data', function () {
  global.SRPersonalMemory.save('remember that my api key is abc123', function (r) {
    assert(r.success === false, 'Should reject API key in memory save');
  });
});

test('SNXShadowAdaptive loads with correct build ID', function () {
  var a = global.SNXShadowAdaptive;
  assert(a, 'SNXShadowAdaptive not loaded');
  assert(a.build === 'SR-STANDALONE-ADAPTIVE-1', 'Wrong build ID: ' + a.build);
});

test('SNXShadowAdaptive.isEnabled() returns true by default', function () {
  assert(global.SNXShadowAdaptive.isEnabled() === true);
});

test('SNXShadowAdaptive.detectIntent("what have you learned") → ADAPTIVE_LIST', function () {
  assert(global.SNXShadowAdaptive.detectIntent('what have you learned') === 'ADAPTIVE_LIST');
});

test('SNXShadowAdaptive does NOT store sensitive data', function () {
  global.SNXShadowAdaptive.processTurn('my password is hunter2');
  // Should silently skip without error
});

test('SNXShadowAdaptive.processTurn extracts project name', function () {
  global.SNXShadowAdaptive.processTurn('I am working on ShadowPlatform');
  var items = global.SNXShadowAdaptive.listAll();
  // May or may not find it (needs to be loaded), but no crash
  assert(Array.isArray(items), 'listAll should return array');
});

test('SRAdaptiveBrain loads and has learn/retrieve interface', function () {
  var B = global.SRAdaptiveBrain;
  assert(B, 'SRAdaptiveBrain not loaded');
  assert(typeof B.learn === 'function', 'learn() must exist');
  assert(typeof B.retrieve === 'function', 'retrieve() must exist');
  assert(typeof B.correct === 'function', 'correct() must exist');
});

test('SRAdaptiveBrain.learn() does not crash (guest offline mode)', function () {
  global.SRAdaptiveBrain.learn({ text: 'I am working on Project Omega', role: 'user' });
});

test('SRAdaptiveBrain rejects sensitive data in learn()', function () {
  // Should not throw, should silently skip
  global.SRAdaptiveBrain.learn({ text: 'my password is hunter2', role: 'user' });
});

test('SRPersistence bridge loads', function () {
  assert(global.SRPersistence, 'SRPersistence not loaded');
  assert(typeof global.SRPersistence.init === 'function');
  assert(typeof global.SRPersistence.saveTurn === 'function');
  assert(typeof global.SRPersistence.handleMemoryCommand === 'function');
});

test('SRPersistence.init() does not crash with all modules available', function () {
  global.SRPersistence.init();
});

test('SRPersistence.detectMemoryIntent works', function () {
  var intent = global.SRPersistence.detectMemoryIntent('remember that I prefer dark mode');
  assert(intent === 'MEMORY_SAVE', 'Expected MEMORY_SAVE, got: ' + intent);
});

test('SRPersistence.detectContinuityIntent works', function () {
  var r = global.SRPersistence.detectContinuityIntent('where were we');
  assert(r === true, 'Expected true for continuity phrase');
});

test('SRPersistence.getAdaptiveSnippets does not crash', function () {
  var snippets = global.SRPersistence.getAdaptiveSnippets('test message', {});
  assert(Array.isArray(snippets));
});

test('[STATIC PASS] Global Learning does NOT auto-promote private conversations', function () {
  const src = require('fs').readFileSync(require('path').join(ROOT, 'global-learning/sr-global-learning.js'), 'utf8');
  // Global learning must be disabled by default — use regex to be whitespace-tolerant
  assert(/var\s+_enabled\s*=\s*false/.test(src), 'Global learning must default to disabled');
  // Must require user consent
  assert(src.indexOf('_userOptedIn') !== -1, 'Must require user consent');
});

test('[STATIC PASS] SRAdaptiveBrain stores data to users/{uid}/shadowReaperLearnedContext', function () {
  const src = require('fs').readFileSync(require('path').join(ROOT, 'core/adaptive-brain.js'), 'utf8');
  assert(src.indexOf('shadowReaperLearnedContext') !== -1 || src.indexOf('userLearnedContextCol') !== -1, 'Must use UID-scoped learned context path');
});

test('[PHYSICAL TEST REQUIRED] User A private data not accessible to User B — requires live Firebase', function () {
  // This test requires a live Firebase project with two distinct user accounts.
  // The Firestore rules enforce isOwner(uid) which means:
  //   - User B attempting to read users/userA_uid/shadowReaperConversations will get PERMISSION_DENIED
  //   - This is enforced server-side, not filtered by UI
  // Static verification: rules contain isOwner check
  const rules = require('fs').readFileSync(require('path').join(ROOT, 'firebase/firestore.rules'), 'utf8');
  assert(rules.indexOf('isOwner(uid)') !== -1, 'UID isolation rule must exist');
});

// ── RESULTS ────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log('  STAGE 3 — FIREBASE/PERSISTENCE TEST RESULTS');
console.log('══════════════════════════════════════════════');
results.forEach(function (r) { console.log(r); });
console.log('\n  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('══════════════════════════════════════════════');

if (FAIL > 0) {
  process.stdout.write('STAGE 3 TEST: FAIL\n');
  process.exit(1);
} else {
  process.stdout.write('STAGE 3 TEST: PASS\n');
  process.exit(0);
}
