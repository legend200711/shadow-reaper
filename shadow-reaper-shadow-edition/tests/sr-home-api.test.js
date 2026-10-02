/**
 * shadow-reaper-v2/tests/sr-home-api.test.js
 *
 * Shadow Reaper — Stage 6 Home API Brain Connection Tests
 *
 * Coverage (maps to task Parts 1–25):
 *  A. Context Engine — new fields (projectType, designColor, activeTopic,
 *                      topicHistory, temporaryInstructions, negatedInstructions)
 *  B. processRequest() structured wrapper
 *  C. debugAsk() — diagnostics + context returned together
 *  D. getStatus() — real readiness flags, real websiteKnowledge count
 *  E. Full pipeline: Final Test sequence (task Parts 9, 10, 12–16, 19, 20)
 *  F. Topic switching, negation guard, retrieval-as-context
 *  G. Snapshot exposes all Stage 6 fields
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ── Browser globals ────────────────────────────────────────────────────────────
if (!global.localStorage) {
  global.localStorage = {
    _store: {},
    getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
    setItem:    function (k, v) { this._store[k] = String(v); },
    removeItem: function (k) { delete this._store[k]; },
    clear:      function ()  { this._store = {}; },
  };
}
try {
  if (!global.navigator) {
    Object.defineProperty(global, 'navigator', { value: { gpu: undefined }, writable: true, configurable: true });
  }
} catch (_) {}
if (!global.fetch) global.fetch = function () { return Promise.reject(new Error('no fetch in test')); };

// ── Module loader ──────────────────────────────────────────────────────────────
function loadModule(relPath) {
  var code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  var fn   = new Function('global', 'require', 'module', 'exports', '__dirname', '__filename', code);
  var mod  = {};
  try {
    fn(global, require, mod, {}, path.dirname(path.join(ROOT, relPath)), path.join(ROOT, relPath));
  } catch (e) {
    // swallow browser-only errors
  }
  return mod;
}

// ── Load stack ─────────────────────────────────────────────────────────────────
loadModule('config/environment.js');
loadModule('security/security-policy.js');
loadModule('snx-shadow-conv-history.js');
loadModule('snx-shadow-memory.js');
loadModule('snx-shadow-adaptive.js');
loadModule('core/adaptive-brain.js');
loadModule('knowledge/sr-knowledge-learner.js');
loadModule('core/understanding-engine.js');
loadModule('core/context-engine.js');
loadModule('core/conversation-engine.js');
loadModule('core/response-engine.js');
loadModule('core/persistence-bridge.js');
loadModule('core/local-model.js');
loadModule('knowledge/knowledge-engine.js');
loadModule('adapters/founder-controls.js');
loadModule('shadow-reaper.js');

var SR      = global.ShadowReaper;
var Context = global.SRContext;
var Under   = global.SRUnderstanding;
var Know    = global.SRKnowledge;
var Brain   = global.SRAdaptiveBrain;

SR.init();

// ── Test infrastructure ────────────────────────────────────────────────────────
var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push({ status: 'PASS', name: name });
    process.stdout.write('  ✓  ' + name + '\n');
  } catch (e) {
    FAIL++;
    results.push({ status: 'FAIL', name: name, error: e.message });
    process.stdout.write('  ✗  ' + name + '\n     ' + e.message + '\n');
  }
}

function assert(cond, msg)       { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertContains(s, sub)  {
  if (typeof s !== 'string') throw new Error('assertContains: got non-string: ' + typeof s);
  if (s.indexOf(sub) === -1) throw new Error('Expected "' + s.substring(0,80) + '" to contain "' + sub + '"');
}
function assertNotContains(s,sub){
  if (typeof s !== 'string') return;
  if (s.indexOf(sub) !== -1) throw new Error('Expected string NOT to contain "' + sub + '"');
}

// ── SECTION A: CONTEXT ENGINE — NEW STAGE 6 FIELDS ───────────────────────────
console.log('\n── SECTION A: CONTEXT ENGINE — STAGE 6 FIELDS ──────────────────');

test('context snapshot includes projectType field', function () {
  Context.reset();
  var snap = Context.getSnapshot();
  assert('projectType' in snap, 'Expected projectType in snapshot');
});

test('context snapshot includes designColor field', function () {
  Context.reset();
  var snap = Context.getSnapshot();
  assert('designColor' in snap, 'Expected designColor in snapshot');
});

test('context snapshot includes activeTopic field', function () {
  Context.reset();
  var snap = Context.getSnapshot();
  assert('activeTopic' in snap, 'Expected activeTopic in snapshot');
});

test('context snapshot includes topicHistory field (array)', function () {
  Context.reset();
  var snap = Context.getSnapshot();
  assert(Array.isArray(snap.topicHistory), 'Expected topicHistory to be array');
});

test('context snapshot includes temporaryInstructions field (array)', function () {
  Context.reset();
  var snap = Context.getSnapshot();
  assert(Array.isArray(snap.temporaryInstructions), 'Expected temporaryInstructions to be array');
});

test('context snapshot includes negatedInstructions field (array)', function () {
  Context.reset();
  var snap = Context.getSnapshot();
  assert(Array.isArray(snap.negatedInstructions), 'Expected negatedInstructions to be array');
});

test('context: projectType extracted from "It\'s a website"', function () {
  Context.reset();
  var u = Under.understand("I'm building a project called NightGlass.");
  Context.update(u, "I'm building a project called NightGlass. It's a website.");
  var snap = Context.getSnapshot();
  assert(snap.projectType === 'website', 'Expected projectType=website, got: ' + snap.projectType);
});

test('context: projectType extracted from "It\'s an app"', function () {
  Context.reset();
  var u = Under.understand("I'm working on a project. It's an app for tracking habits.");
  Context.update(u, "I'm working on a project. It's an app for tracking habits.");
  var snap = Context.getSnapshot();
  assert(snap.projectType === 'app', 'Expected projectType=app, got: ' + snap.projectType);
});

test('context: designColor set from "dark blue design"', function () {
  Context.reset();
  var u = Under.understand("It has a dark blue design.");
  Context.update(u, "It has a dark blue design.");
  var snap = Context.getSnapshot();
  assert(snap.designColor === 'dark blue' || (snap.design && snap.design.indexOf('dark blue') !== -1),
    'Expected designColor/design contains dark blue, got: ' + JSON.stringify(snap));
});

test('context: activeTopic set by explicit topic switch', function () {
  Context.reset();
  var u = Under.understand("Let's work on the navigation menu.");
  Context.update(u, "Let's work on the navigation menu.");
  var snap = Context.getSnapshot();
  assert(snap.activeTopic && snap.activeTopic.indexOf('navigation menu') !== -1,
    'Expected activeTopic to include "navigation menu", got: ' + snap.activeTopic);
});

test('context: topicHistory grows as topics switch', function () {
  Context.reset();
  var u1 = Under.understand("Let's work on the header.");
  Context.update(u1, "Let's work on the header.");
  var u2 = Under.understand("Let's switch to the footer.");
  Context.update(u2, "Let's switch to the footer.");
  var snap = Context.getSnapshot();
  assert(snap.topicHistory.length >= 1, 'Expected topicHistory to have at least 1 entry');
});

test('context: negatedInstructions captures "don\'t change the homepage"', function () {
  Context.reset();
  var u = Under.understand("Actually, don't change the homepage.");
  Context.update(u, "Actually, don't change the homepage.");
  var snap = Context.getSnapshot();
  var hasNeg = snap.negatedInstructions.some(function (n) {
    return n.indexOf('homepage') !== -1;
  });
  assert(hasNeg, 'Expected homepage in negatedInstructions, got: ' + JSON.stringify(snap.negatedInstructions));
});

test('context: negation does NOT overwrite projectName', function () {
  Context.reset();
  var u1 = Under.understand("I'm building a project called NightGlass.");
  Context.update(u1, "I'm building a project called NightGlass.");
  var u2 = Under.understand("Actually, don't change the homepage. Let's work on the menu instead.");
  Context.update(u2, "Actually, don't change the homepage. Let's work on the menu instead.");
  var snap = Context.getSnapshot();
  assert(snap.projectName === 'NightGlass',
    'projectName corrupted to: ' + snap.projectName);
});

test('context: reset() clears all Stage 6 fields', function () {
  Context.reset();
  var u = Under.understand("I'm building NightGlass, a dark blue website.");
  Context.update(u, "I'm building NightGlass, a dark blue website.");
  Context.reset();
  var snap = Context.getSnapshot();
  assert(snap.projectName   === null,  'projectName should be null after reset');
  assert(snap.projectType   === null,  'projectType should be null after reset');
  assert(snap.designColor   === null,  'designColor should be null after reset');
  assert(snap.activeTopic   === null,  'activeTopic should be null after reset');
  assert(snap.topicHistory.length === 0, 'topicHistory should be empty after reset');
  assert(snap.negatedInstructions.length === 0, 'negatedInstructions should be empty');
  assert(snap.temporaryInstructions.length === 0, 'temporaryInstructions should be empty');
});

// ── SECTION B: processRequest() WRAPPER ──────────────────────────────────────
console.log('\n── SECTION B: processRequest() WRAPPER ──────────────────────────');

test('processRequest() exists on ShadowReaper', function () {
  assert(typeof SR.processRequest === 'function', 'Expected processRequest to be a function');
});

test('processRequest({ message }) produces a response via callback', function () {
  SR.newConversation();
  var resp = null;
  SR.processRequest({ message: 'Hello there.' }, function (r) { resp = r; });
  assert(resp && typeof resp === 'string', 'Expected string response, got: ' + typeof resp);
  assert(resp.length > 0, 'Expected non-empty response');
});

test('processRequest({ message }) — empty message returns prompt string', function () {
  var resp = null;
  SR.processRequest({ message: '' }, function (r) { resp = r; });
  assert(resp && resp.indexOf("listening") !== -1, 'Expected listening prompt, got: ' + resp);
});

test('processRequest() — non-object opts calls back with error', function () {
  var resp = null;
  SR.processRequest(null, function (r) { resp = r; });
  assert(resp && resp.indexOf('Invalid') !== -1, 'Expected error message for null opts, got: ' + resp);
});

test('processRequest() — whitespace-only message returns prompt string', function () {
  var resp = null;
  SR.processRequest({ message: '   ' }, function (r) { resp = r; });
  assert(resp && resp.length > 0, 'Expected response for whitespace message');
});

test('processRequest() — knowledge question returns knowledge content', function () {
  SR.newConversation();
  var resp = null;
  SR.processRequest({ message: 'What is Shadow Nexus Live?' }, function (r) { resp = r; });
  assert(resp, 'No response');
  assertContains(resp.toLowerCase(), 'live');
});

test('processRequest() includes optional fields without error (source, userId, etc.)', function () {
  SR.newConversation();
  var resp = null;
  SR.processRequest({
    message: 'Hello.',
    source: 'test-runner',
    userId: 'u_test',
    conversationId: 'conv_001',
    projectId: 'proj_nightglass',
    options: {},
  }, function (r) { resp = r; });
  assert(resp && typeof resp === 'string', 'Expected string response');
});

// ── SECTION C: debugAsk() ────────────────────────────────────────────────────
console.log('\n── SECTION C: debugAsk() ─────────────────────────────────────────');

test('debugAsk() exists on ShadowReaper', function () {
  assert(typeof SR.debugAsk === 'function', 'Expected debugAsk to be a function');
});

test('debugAsk() returns { response, diagnostics, context }', function () {
  SR.newConversation();
  var result = null;
  SR.debugAsk('What is Shadow Nexus Live?', function (r) { result = r; });
  assert(result && typeof result === 'object', 'Expected result object');
  assert('response' in result, 'Expected response field');
  assert('diagnostics' in result, 'Expected diagnostics field');
  assert('context' in result, 'Expected context field');
});

test('debugAsk() response is non-empty string', function () {
  SR.newConversation();
  var result = null;
  SR.debugAsk('Hello.', function (r) { result = r; });
  assert(result && typeof result.response === 'string' && result.response.length > 0,
    'Expected non-empty response string');
});

test('debugAsk() diagnostics has all required keys', function () {
  SR.newConversation();
  var result = null;
  SR.debugAsk('What is Shadow Nexus Live?', function (r) { result = r; });
  var d = result.diagnostics;
  var keys = ['INTENT', 'KNOWLEDGE_QUERY', 'KNOWLEDGE_USED', 'RESPONSE_SOURCE',
              'TOKEN_COUNT', 'KNOWLEDGE_MATCHES', 'LANGUAGE_FOUNDATION'];
  keys.forEach(function (k) {
    assert(k in d, 'Expected diagnostics to have key: ' + k);
  });
});

test('debugAsk() context has projectName field', function () {
  SR.newConversation();
  var result = null;
  SR.debugAsk('I\'m building NightGlass, a website.', function (r) { result = r; });
  assert('projectName' in result.context, 'Expected context.projectName field');
});

test('debugAsk() context has Stage 6 fields', function () {
  SR.newConversation();
  var result = null;
  SR.debugAsk('Let\'s work on the menu.', function (r) { result = r; });
  var ctx = result.context;
  assert('projectType'    in ctx, 'Expected projectType');
  assert('designColor'    in ctx, 'Expected designColor');
  assert('activeTopic'    in ctx, 'Expected activeTopic');
  assert('topicHistory'   in ctx, 'Expected topicHistory');
  assert('negatedInstructions'   in ctx, 'Expected negatedInstructions');
  assert('temporaryInstructions' in ctx, 'Expected temporaryInstructions');
});

test('debugAsk() does NOT expose private data', function () {
  SR.newConversation();
  var result = null;
  SR.debugAsk('Hello.', function (r) { result = r; });
  var resultStr = JSON.stringify(result);
  assert(resultStr.indexOf('password') === -1, 'Should not expose password');
  assert(resultStr.indexOf('apiKey')   === -1, 'Should not expose apiKey');
});

test('debugAsk() knowledge question has KNOWLEDGE_USED=YES', function () {
  SR.newConversation();
  var result = null;
  SR.debugAsk('What is Shadow Nexus Live?', function (r) { result = r; });
  assert(result.diagnostics.KNOWLEDGE_USED === 'YES',
    'Expected KNOWLEDGE_USED=YES, got: ' + result.diagnostics.KNOWLEDGE_USED);
});

test('debugAsk() normal greeting has KNOWLEDGE_USED=NO', function () {
  SR.newConversation();
  var result = null;
  SR.debugAsk("What's up?", function (r) { result = r; });
  assert(result.diagnostics.KNOWLEDGE_USED === 'NO',
    'Expected KNOWLEDGE_USED=NO for greeting, got: ' + result.diagnostics.KNOWLEDGE_USED);
});

// ── SECTION D: getStatus() ─────────────────────────────────────────────────────
console.log('\n── SECTION D: getStatus() READINESS FLAGS ────────────────────────');

test('getStatus() returns object', function () {
  var st = SR.getStatus();
  assert(st && typeof st === 'object', 'Expected object');
});

test('getStatus() version is SR-V2-STAGE6 or later', function () {
  var st = SR.getStatus();
  var validVersions = ['SR-V2-STAGE6', 'SR-V2-STAGE7',
                       'SR-V2-STAGE8', 'SR-V2-STAGE9', 'SR-V2-STAGE10', 'SR-V2-STAGE11',
                       'SR-V2-STAGE12'];
  assert(validVersions.indexOf(st.version) !== -1,
    'Expected version SR-V2-STAGE6 or later (up to STAGE12), got: ' + st.version);
});

test('getStatus() API_READY is true when initialized', function () {
  var st = SR.getStatus();
  assert(st.API_READY === true, 'Expected API_READY=true');
});

test('getStatus() KNOWLEDGE_READY is true when SRKnowledge is loaded', function () {
  var st = SR.getStatus();
  assert(st.KNOWLEDGE_READY === true, 'Expected KNOWLEDGE_READY=true');
});

test('getStatus() websiteKnowledge is true (not hardcoded false)', function () {
  var st = SR.getStatus();
  assert(st.websiteKnowledge === true, 'Expected websiteKnowledge=true, was: ' + st.websiteKnowledge);
});

test('getStatus() websiteKnowledgeCount > 0', function () {
  var st = SR.getStatus();
  assert(st.websiteKnowledgeCount > 0, 'Expected websiteKnowledgeCount > 0, got: ' + st.websiteKnowledgeCount);
});

test('getStatus() websiteKnowledgeCategories has SNS, CREATOR, GENERAL', function () {
  var st = SR.getStatus();
  var cats = st.websiteKnowledgeCategories;
  assert(cats && cats.SNS > 0,     'Expected SNS knowledge entries');
  assert(cats && cats.CREATOR > 0, 'Expected CREATOR knowledge entries');
  assert(cats && cats.GENERAL > 0, 'Expected GENERAL knowledge entries');
});

test('getStatus() languageFoundation is an object with loaded field', function () {
  var st = SR.getStatus();
  assert(st.languageFoundation && typeof st.languageFoundation === 'object',
    'Expected languageFoundation object');
  assert('loaded' in st.languageFoundation, 'Expected loaded field');
});

test('getStatus() lastDiagnostics is present', function () {
  var st = SR.getStatus();
  assert(st.lastDiagnostics && typeof st.lastDiagnostics === 'object',
    'Expected lastDiagnostics object in status');
});

test('getStatus() includes LANGUAGE_FOUNDATION_READY flag', function () {
  var st = SR.getStatus();
  assert('LANGUAGE_FOUNDATION_READY' in st, 'Expected LANGUAGE_FOUNDATION_READY flag');
});

test('getStatus() includes KNOWLEDGE_LEARNER_READY flag', function () {
  var st = SR.getStatus();
  assert('KNOWLEDGE_LEARNER_READY' in st, 'Expected KNOWLEDGE_LEARNER_READY flag');
});

test('getStatus() includes PERSISTENCE_READY flag', function () {
  var st = SR.getStatus();
  assert('PERSISTENCE_READY' in st, 'Expected PERSISTENCE_READY flag');
});

test('getStatus() build equals version', function () {
  var st = SR.getStatus();
  assert(st.build === st.version, 'Expected build === version');
});

// ── SECTION E: FULL PIPELINE FINAL TEST SEQUENCE ─────────────────────────────
console.log('\n── SECTION E: FULL PIPELINE — FINAL TEST SEQUENCE ───────────────');

function ask(msg) {
  var resp = null;
  SR.ask(msg, function (r) { resp = r; });
  return resp;
}

test('final Q1: "What is Shadow Nexus Live and what can I do with it?" returns Live knowledge', function () {
  SR.newConversation();
  var r = ask('What is Shadow Nexus Live and what can I do with it?');
  assert(r, 'No response');
  assertContains(r.toLowerCase(), 'live');
  assertNotContains(r, "I don't have information about that yet.");
  assertNotContains(r, "don't have reliable information");
  assertNotContains(r, 'LOCAL MODEL ERROR');
});

test('final Q2: "What\'s the difference between Radio and Radio Studio?" returns Radio knowledge', function () {
  SR.newConversation();
  var r = ask("What's the difference between Radio and Radio Studio?");
  assert(r, 'No response');
  var lc = r.toLowerCase();
  assert(lc.indexOf('radio') !== -1, 'Expected radio content in response: ' + r.substring(0,100));
  assertNotContains(r, "I don't have information about that yet.");
});

test('final Q3: "What is TV Studio used for?" returns TV knowledge', function () {
  SR.newConversation();
  var r = ask('What is TV Studio used for?');
  assert(r, 'No response');
  assertContains(r.toLowerCase(), 'tv');
  assertNotContains(r, "I don't have information about that yet.");
});

test('final Q4: "How do I install Shadow Nexus as an app?" returns PWA knowledge', function () {
  SR.newConversation();
  var r = ask('How do I install Shadow Nexus as an app?');
  assert(r, 'No response');
  var lc = r.toLowerCase();
  var hasPWA = lc.indexOf('install') !== -1 || lc.indexOf('pwa') !== -1 || lc.indexOf('home screen') !== -1;
  assert(hasPWA, 'Expected install/PWA content, got: ' + r.substring(0,100));
  assertNotContains(r, "I don't have information about that yet.");
});

test('final Q5: "Who created Shadow Nexus Social?" returns Chris / creator info', function () {
  SR.newConversation();
  var r = ask('Who created Shadow Nexus Social?');
  assert(r, 'No response');
  assertContains(r.toLowerCase(), 'chris');
  assertNotContains(r, "I don't have information about that yet.");
});

test('final project sequence: project name recognized', function () {
  SR.newConversation();
  ask("I'm building a project called NightGlass. It's a website with a dark blue design.");
  var ctx = Context.getSnapshot();
  assert(ctx.projectName === 'NightGlass',
    'Expected projectName=NightGlass, got: ' + ctx.projectName);
});

test('final project sequence: design color recognized', function () {
  SR.newConversation();
  ask("I'm building a project called NightGlass. It's a website with a dark blue design.");
  var ctx = Context.getSnapshot();
  var hasColor = ctx.designColor === 'dark blue' ||
                 (ctx.design && ctx.design.indexOf('dark blue') !== -1);
  assert(hasColor, 'Expected dark blue in design/designColor, got: ' + JSON.stringify(ctx.design));
});

test('final project sequence: projectType website recognized', function () {
  SR.newConversation();
  ask("I'm building a project called NightGlass. It's a website with a dark blue design.");
  var ctx = Context.getSnapshot();
  assert(ctx.projectType === 'website',
    'Expected projectType=website, got: ' + ctx.projectType);
});

test('final: "The homepage feels too empty. What could I add?" — response is advice not just "NightGlass"', function () {
  SR.newConversation();
  ask("I'm building a project called NightGlass. It's a website with a dark blue design.");
  var r = ask("The homepage feels too empty. What could I add without making it cluttered?");
  assert(r, 'No response');
  // Response should not be JUST the project name (retrieval used as context, not the answer)
  assert(r !== 'NightGlass', 'Response should not be just the project name');
  assert(r.length > 10, 'Response should be substantive, got: ' + r);
});

test('final: negation "don\'t change the homepage" preserves project name', function () {
  SR.newConversation();
  ask("I'm building a project called NightGlass. It's a website with a dark blue design.");
  ask("The homepage feels too empty. What could I add without making it cluttered?");
  ask("Actually, don't change the homepage. Let's work on the menu instead.");
  var ctx = Context.getSnapshot();
  assert(ctx.projectName === 'NightGlass',
    'Project name corrupted after negation, got: ' + ctx.projectName);
});

test('final: "don\'t change the homepage" sets activeTopic to menu', function () {
  SR.newConversation();
  ask("I'm building a project called NightGlass.");
  ask("Actually, don't change the homepage. Let's work on the menu instead.");
  var ctx = Context.getSnapshot();
  var hasMeta = ctx.activeTopic && ctx.activeTopic.indexOf('menu') !== -1;
  assert(hasMeta, 'Expected activeTopic to include menu, got: ' + ctx.activeTopic);
});

test('final: "don\'t change homepage" in negatedInstructions', function () {
  SR.newConversation();
  ask("Actually, don't change the homepage. Let's work on the menu instead.");
  var ctx = Context.getSnapshot();
  var hasNeg = ctx.negatedInstructions.some(function (n) {
    return n.indexOf('homepage') !== -1;
  });
  assert(hasNeg, 'Expected homepage in negatedInstructions, got: ' + JSON.stringify(ctx.negatedInstructions));
});

test('final: "What project are we working on and what color is it?" includes NightGlass', function () {
  SR.newConversation();
  ask("I'm building a project called NightGlass. It's a website with a dark blue design.");
  ask("The homepage feels too empty. What could I add without making it cluttered?");
  ask("Actually, don't change the homepage. Let's work on the menu instead.");
  var r = ask("What project are we working on and what color is it?");
  assert(r, 'No response');
  assertContains(r, 'NightGlass');
});

// ── SECTION F: TOPIC SWITCHING AND CONTEXT COHERENCE ────────────────────────
console.log('\n── SECTION F: TOPIC SWITCHING & CONTEXT COHERENCE ───────────────');

test('topic switch: "let\'s work on X" updates activeTopic', function () {
  Context.reset();
  var u = Under.understand("Let's work on the sidebar.");
  Context.update(u, "Let's work on the sidebar.");
  var snap = Context.getSnapshot();
  assert(snap.activeTopic && snap.activeTopic.indexOf('sidebar') !== -1,
    'Expected activeTopic=sidebar, got: ' + snap.activeTopic);
});

test('topic switch: "focus on X" updates activeTopic', function () {
  Context.reset();
  var u = Under.understand("Focus on the header layout.");
  Context.update(u, "Focus on the header layout.");
  var snap = Context.getSnapshot();
  assert(snap.activeTopic && snap.activeTopic.indexOf('header') !== -1,
    'Expected activeTopic=header layout, got: ' + snap.activeTopic);
});

test('topicHistory: max 5 entries maintained', function () {
  Context.reset();
  var topics = ['header', 'footer', 'sidebar', 'menu', 'login page', 'dashboard'];
  topics.forEach(function (t) {
    var u = Under.understand("Let's work on the " + t + ".");
    Context.update(u, "Let's work on the " + t + ".");
  });
  var snap = Context.getSnapshot();
  assert(snap.topicHistory.length <= 5, 'topicHistory should not exceed 5, got: ' + snap.topicHistory.length);
});

test('stable projectName survives multiple topic switches', function () {
  Context.reset();
  var u1 = Under.understand("I'm building a project called NightGlass.");
  Context.update(u1, "I'm building a project called NightGlass.");
  var switches = ["Let's work on the header.", "Focus on the footer.", "Let's switch to the login page."];
  switches.forEach(function (s) {
    var u = Under.understand(s);
    Context.update(u, s);
  });
  var snap = Context.getSnapshot();
  assert(snap.projectName === 'NightGlass',
    'projectName corrupted after topic switches, got: ' + snap.projectName);
});

// ── SECTION G: RETRIEVAL AS CONTEXT, NOT THE ANSWER ──────────────────────────
console.log('\n── SECTION G: RETRIEVAL AS CONTEXT, NOT THE ANSWER ──────────────');

test('retrieval: response to "The homepage feels empty" is more than just the project name', function () {
  SR.newConversation();
  ask("I'm building a project called NightGlass. It's a website with a dark blue design.");
  var r = ask("The homepage feels empty. What could I add?");
  assert(r !== 'NightGlass', 'Response must not be just the retrieved project name');
  assert(r.length > 15, 'Response should be a real answer, not a keyword, got: ' + r);
});

test('retrieval: knowledge snippet appears as context, response is about the question', function () {
  SR.newConversation();
  var result = null;
  SR.debugAsk('What is Shadow Nexus Live?', function (r) { result = r; });
  // The response should incorporate the knowledge content, not be a snippet label
  assert(result.response !== 'Shadow Nexus Live', 'Response must not be just a keyword');
  assert(result.response.length > 20, 'Response should be substantive');
  assertContains(result.response.toLowerCase(), 'live');
});

test('retrieval: no knowledge bleed into "What\'s up?"', function () {
  SR.newConversation();
  var r = ask("What's up?");
  assertNotContains(r, 'Shadow Nexus Social is a creative');
  assertNotContains(r, 'Radio Studio');
});

test('retrieval: "I\'m working on my website" does not dump SNS platform docs', function () {
  SR.newConversation();
  var r = ask("I'm working on my website and need some help.");
  // Should not return raw SNS platform overview documentation unprompted
  if (r) {
    assert(r.indexOf('Shadow Nexus Social is a creative social platform') === -1 ||
           r.indexOf('Radio') === -1,
      'Should not dump full SNS platform docs for personal website mention');
  }
});

// ── SECTION H: SEMANTIC VARIATION ──────────────────────────────────────────────
console.log('\n── SECTION H: SEMANTIC VARIATION ────────────────────────────────');

test('semantic: "What can Live do?" returns Live knowledge', function () {
  SR.newConversation();
  var r = ask('What can Live do?');
  assert(r, 'No response');
  assertContains(r.toLowerCase(), 'live');
  assertNotContains(r, "I don't have information about that yet.");
});

test('semantic: "Tell me about Live" returns Live knowledge', function () {
  SR.newConversation();
  var r = ask('Tell me about the live feature on Shadow Nexus.');
  assert(r, 'No response');
  assertContains(r.toLowerCase(), 'live');
});

test('semantic: "What is radio on Shadow Nexus?" returns Radio knowledge', function () {
  SR.newConversation();
  var r = ask('What is radio on Shadow Nexus?');
  assert(r, 'No response');
  assertContains(r.toLowerCase(), 'radio');
});

test('semantic: alias "shadow nexus tv" matches TV knowledge', function () {
  var entry = Know.query('What is shadow nexus tv?');
  assert(entry, 'Expected knowledge entry for shadow nexus tv');
  assertContains(entry.content.toLowerCase(), 'tv');
});

test('semantic: "television studio" matches TV Studio knowledge', function () {
  var entry = Know.query('What is the television studio used for?');
  assert(entry, 'Expected knowledge entry for television studio');
  assertContains(entry.content.toLowerCase(), 'tv');
});

// ── SECTION I: NORMAL CONVERSATION ISOLATION ─────────────────────────────────
console.log('\n── SECTION I: NORMAL CONVERSATION ISOLATION ─────────────────────');

test('isolation: "How was your day?" does not return SNS documentation', function () {
  SR.newConversation();
  var r = ask('How was your day?');
  assert(r, 'No response');
  assertNotContains(r, 'Shadow Nexus Social is a creative');
  assertNotContains(r, 'Radio Studio');
  assertNotContains(r, 'TV Studio');
});

test('isolation: "I\'m bored" does not return website documentation', function () {
  SR.newConversation();
  var r = ask("I'm bored.");
  assert(r, 'No response');
  assertNotContains(r, 'Shadow Nexus Social is a creative');
});

test('isolation: "Tell me something interesting" does not trigger knowledge', function () {
  SR.newConversation();
  var r = ask('Tell me something interesting.');
  assert(r, 'No response');
  assertNotContains(r, 'Shadow Nexus Social is a creative social platform');
});

test('isolation: "What should I do tonight" does not trigger SNS docs', function () {
  SR.newConversation();
  var r = ask('What should I do tonight?');
  assert(r, 'No response');
  assertNotContains(r, 'Radio Studio allows DJs');
});

// ── SECTION J: UNKNOWN KNOWLEDGE — PROPER BEHAVIOR ───────────────────────────
console.log('\n── SECTION J: UNKNOWN KNOWLEDGE — PROPER BEHAVIOR ───────────────');

test('unknown: "What do unicorns eat?" does not crash', function () {
  SR.newConversation();
  var r = ask('What do unicorns eat?');
  assert(r && typeof r === 'string', 'Expected string response');
  assert(r.length > 0, 'Expected non-empty response');
});

test('unknown: knowledge query for completely unknown topic returns null', function () {
  var entry = Know.query('What is the price of bananas on Mars?');
  assert(!entry, 'Expected null for completely unknown topic');
});

test('unknown: short score threshold prevents false positives', function () {
  // A query with no SNS keywords should not match
  var entry = Know.query('I like cats and dogs.');
  assert(!entry, 'Generic sentence should not match knowledge, got: ' + JSON.stringify(entry));
});

// ── SECTION K: BUILD REPORT ACCURACY ─────────────────────────────────────────
console.log('\n── SECTION K: BUILD REPORT ACCURACY ─────────────────────────────');

test('build-report: uniqueLemmas > 0', function () {
  var report = require('../language/data/build-report.json');
  assert(report.uniqueLemmas > 0, 'Expected uniqueLemmas > 0');
});

test('build-report: totalEntries != uniqueLemmas (forms > lemmas)', function () {
  var report = require('../language/data/build-report.json');
  assert(report.totalEntries > report.uniqueLemmas,
    'Expected more forms than lemmas (forms include inflections)');
});

test('build-report: repairRun flag is true', function () {
  var report = require('../language/data/build-report.json');
  assert(report.repairRun === true, 'Expected repairRun=true');
});

test('build-report: invalidRemoved > 0', function () {
  var report = require('../language/data/build-report.json');
  assert(report.invalidRemoved > 0, 'Expected invalidRemoved > 0');
});

// ── SECTION L: processRequest() vs ask() PARITY ─────────────────────────────
console.log('\n── SECTION L: processRequest() vs ask() PARITY ──────────────────');

test('processRequest and ask produce same knowledge answer for SNS question', function () {
  SR.newConversation();
  var askResp = null;
  SR.ask('What is Shadow Nexus Live?', function (r) { askResp = r; });

  SR.newConversation();
  var prResp = null;
  SR.processRequest({ message: 'What is Shadow Nexus Live?' }, function (r) { prResp = r; });

  assert(askResp && prResp, 'Both should produce responses');
  // Both should contain live knowledge
  assertContains(askResp.toLowerCase(), 'live');
  assertContains(prResp.toLowerCase(), 'live');
});

// ── RESULTS ────────────────────────────────────────────────────────────────────
var total = PASS + FAIL;
console.log('\n══════════════════════════════════════════════════════════════');
console.log('  SHADOW REAPER — HOME API BRAIN CONNECTION TEST RESULTS');
console.log('══════════════════════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + total);
console.log('══════════════════════════════════════════════════════════════');

if (FAIL > 0) {
  console.log('\n  FAILURES:');
  results.filter(function (r) { return r.status === 'FAIL'; }).forEach(function (r) {
    console.log('   ✗ ' + r.name);
    console.log('     ' + r.error);
  });
  process.exit(1);
} else {
  console.log('HOME API BRAIN CONNECTION TEST: PASS');
  process.exit(0);
}
