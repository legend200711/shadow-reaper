/**
 * shadow-reaper-v2/tests/sns-launcher-tests.js
 * Shadow Nexus Social — Shadow Reaper Launcher Reconnection Tests
 *
 * Build: SNS-2026-SHADOW-REAPER-STAGE12-TEST-001
 *
 * Tests:
 *   1. Shadow Nexus Live knowledge test
 *   2. NightGlass multi-turn conversation regression test
 */

'use strict';

var fs   = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

// ── Browser globals shim ─────────────────────────────────────────────────────

if (typeof window === 'undefined') { global.window = global; }

if (!global.localStorage) {
  global.localStorage = {
    _store: {},
    getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
    setItem:    function (k, v) { this._store[k] = String(v); },
    removeItem: function (k) { delete this._store[k]; },
    clear:      function ()  { this._store = {}; },
  };
}

if (!global.navigator) {
  Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Node.js test runner)', onLine: true },
    writable: true, configurable: true,
  });
}

if (!global.matchMedia) {
  global.matchMedia = function () { return { matches: false, addListener: function(){} }; };
}

// ── Load modules ─────────────────────────────────────────────────────────────

function loadModule(relPath) {
  var code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  var fn = new Function('global', code);
  fn(global);
}

loadModule('core/understanding-engine.js');
loadModule('core/context-engine.js');
loadModule('core/conversation-engine.js');
loadModule('core/response-engine.js');
loadModule('core/persistence-bridge.js');
loadModule('core/local-model.js');
loadModule('core/adaptive-brain.js');
loadModule('knowledge/knowledge-engine.js');
loadModule('knowledge/sr-knowledge-learner.js');
loadModule('translation/translation-engine.js');
loadModule('shadow-reaper.js');

var SR = global.ShadowReaper;
SR.init();

// ── Test runner ───────────────────────────────────────────────────────────────

var pass = 0;
var fail = 0;
var results = [];

function assert(label, condition) {
  if (condition) {
    pass++;
    results.push('  PASS  ' + label);
  } else {
    fail++;
    results.push('  FAIL  ' + label);
  }
}

// ── TEST 1: SHADOW NEXUS LIVE KNOWLEDGE ───────────────────────────────────────

console.log('\n===== TEST 1: SHADOW NEXUS LIVE KNOWLEDGE TEST =====');

SR.newConversation();
var liveResponse = null;
var liveDiag     = null;

SR.ask('What is Shadow Nexus Live and what can I do with it?', function (r) {
  liveResponse = r;
  liveDiag     = SR.getLastDiagnostics ? SR.getLastDiagnostics() : null;
});

// (sync in Node test env)
console.log('Q: What is Shadow Nexus Live and what can I do with it?');
console.log('A:', liveResponse);
if (liveDiag) {
  console.log('  KNOWLEDGE_USED:', liveDiag.KNOWLEDGE_USED);
  console.log('  KNOWLEDGE_CATEGORY:', liveDiag.KNOWLEDGE_CATEGORY);
  console.log('  RESPONSE_SOURCE:', liveDiag.RESPONSE_SOURCE);
}

assert('Live knowledge: response contains "live"',
  liveResponse && liveResponse.toLowerCase().indexOf('live') !== -1);
assert('Live knowledge: response contains SNS context (creator/broadcast/video/shadow nexus)',
  liveResponse && (
    liveResponse.toLowerCase().indexOf('shadow nexus') !== -1 ||
    liveResponse.toLowerCase().indexOf('creator') !== -1 ||
    liveResponse.toLowerCase().indexOf('broadcast') !== -1 ||
    liveResponse.toLowerCase().indexOf('video') !== -1 ||
    liveResponse.toLowerCase().indexOf('stream') !== -1
  ));
assert('Live knowledge: knowledge engine was used',
  liveDiag && liveDiag.KNOWLEDGE_USED === 'YES');

// ── TEST 2: NIGHTGLASS MULTI-TURN REGRESSION ──────────────────────────────────

console.log('\n===== TEST 2: NIGHTGLASS MULTI-TURN CONVERSATION TEST =====');

SR.newConversation();

var turn1, turn2, turn3, turn4, turn5;

SR.ask("I'm building a project called NightGlass. It's a website with a dark blue design.", function(r) { turn1 = r; });
SR.ask("The homepage feels too empty. What could I add without making it cluttered?", function(r) { turn2 = r; });
SR.ask("I like your second idea, but make it more cinematic.", function(r) { turn3 = r; });
SR.ask("Actually, don't change the homepage. Let's work on the menu instead.", function(r) { turn4 = r; });
SR.ask("What project were we talking about, and what color did I say it uses?", function(r) { turn5 = r; });

console.log('Turn 1 - Introduced NightGlass project:', turn1 ? turn1.substring(0,80) + '...' : 'null');
console.log('Turn 2 - Homepage feel:', turn2 ? turn2.substring(0,80) + '...' : 'null');
console.log('Turn 3 - Cinematic second idea:', turn3 ? turn3.substring(0,80) + '...' : 'null');
console.log('Turn 4 - Switch to menu:', turn4 ? turn4.substring(0,80) + '...' : 'null');
console.log('Turn 5 - Recall project:', turn5 ? turn5.substring(0,80) + '...' : 'null');

assert('NightGlass T1: first response is non-empty', turn1 && turn1.length > 0);
assert('NightGlass T2: homepage suggestions are non-empty', turn2 && turn2.length > 0);
assert('NightGlass T3: cinematic response is non-empty', turn3 && turn3.length > 0);
assert('NightGlass T4: menu pivot response is non-empty', turn4 && turn4.length > 0);
assert('NightGlass T5: recall response contains NightGlass',
  turn5 && turn5.toLowerCase().indexOf('nightglass') !== -1);
assert('NightGlass T5: recall response contains dark blue / blue / dark',
  turn5 && (
    turn5.toLowerCase().indexOf('dark blue') !== -1 ||
    turn5.toLowerCase().indexOf('blue') !== -1 ||
    turn5.toLowerCase().indexOf('dark') !== -1
  ));

// Check that context is maintained (via SRContext snapshot)
var ctxSnap = global.SRContext ? global.SRContext.getSnapshot() : null;
assert('NightGlass: context engine has project name NightGlass',
  ctxSnap && ctxSnap.projectName &&
  ctxSnap.projectName.toLowerCase().indexOf('nightglass') !== -1);

// ── RESULTS ───────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('  SNS LAUNCHER — SHADOW REAPER STAGE 12 TEST RESULTS');
console.log('══════════════════════════════════════════════════════════');
results.forEach(function(r) { console.log(r); });
console.log('══════════════════════════════════════════════════════════');
console.log('  PASS:', pass);
console.log('  FAIL:', fail);
console.log('  TOTAL:', pass + fail);
console.log('══════════════════════════════════════════════════════════');
console.log(fail === 0 ? '  *** SNS LAUNCHER TEST: PASS ***' : '  *** SNS LAUNCHER TEST: FAIL ***');
console.log('');

process.exit(fail === 0 ? 0 : 1);
