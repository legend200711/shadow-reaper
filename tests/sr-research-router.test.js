/**
 * shadow-reaper-shadow-edition/tests/sr-research-router.test.js
 * Shadow Reaper — Research Router Tests
 *
 * Build: SR-RESEARCH-ROUTER-TEST-1
 *
 * Tests: SRResearchRouter
 *   - classify() — route classification for all input types
 *   - Political exclusion (must always return NOT_ALLOWED)
 *   - Calculation detection → CALCULATION route
 *   - Weather detection → WEATHER route
 *   - Research patterns → INTERNET_RESEARCH or LOCAL_KNOWLEDGE (when undeployed)
 *   - Conversational → NOT_NEEDED
 *   - dispatch() — routing to appropriate module
 *   - formatForContext() — context formatting
 *   - Security: sensitive data never routed externally
 */

'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// Minimal globals
global.window = global;
global.localStorage = {
  _store: {},
  getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem:    function (k, v) { this._store[k] = String(v); },
  removeItem: function (k) { delete this._store[k]; },
  clear:      function ()  { this._store = {}; },
};

// Security mock
global.SRSecurity = {
  containsSensitiveData: function (text) {
    return /my\s+password\s+is|api[\s_-]*key[\s:=]/i.test(text);
  },
  validateUserInput: function (text) {
    return { ok: true, sanitized: text.trim() };
  },
};

// Number intelligence mock (minimal)
global.SRNumberIntelligence = {
  detectCalculation: function (text) {
    if (/(-?[\d,]+(?:\.\d+)?)\s*[+\-×÷*/^]\s*(-?[\d,]+(?:\.\d+)?)/.test(text)) return { isCalc: true };
    if (/(-?[\d,]+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(-?[\d,]+(?:\.\d+)?)/.test(text)) return { isCalc: true };
    return { isCalc: false };
  },
  calculate: function (expression) {
    var m = expression.match(/^(-?[\d.]+)\s*([+\-*/^])\s*(-?[\d.]+)$/);
    if (!m) return { ok: false, reason: 'unsupported' };
    var a = parseFloat(m[1]), op = m[2], b = parseFloat(m[3]);
    var result;
    if (op === '+') result = a + b;
    else if (op === '-') result = a - b;
    else if (op === '*') result = a * b;
    else if (op === '/') { if (b === 0) return { ok: false, reason: 'division_by_zero' }; result = a / b; }
    else return { ok: false, reason: 'unsupported_op' };
    return { ok: true, result: result, expression: expression, formatted: String(result) };
  },
};

// Web research mock — NOT configured (as in default deployment)
global.SRWebResearch = {
  isReady: function () { return false; },
  needsResearch: function () { return false; },
};

// Weather mock — not configured
global.SRWeather = null;

function load(relPath) {
  const code = require('fs').readFileSync(require('path').join(ROOT, relPath), 'utf8');
  new Function('global', 'require', code)(global, require);
}

load('research/sr-research-router.js');

var RR = global.SRResearchRouter;

var PASS = 0, FAIL = 0;

function assert(condition, message) {
  if (condition) {
    PASS++;
    console.log('  PASS: ' + message);
  } else {
    FAIL++;
    console.log('  FAIL: ' + message);
  }
}

function assertEq(actual, expected, message) {
  var ok = actual === expected;
  if (!ok) console.log('       got: ' + JSON.stringify(actual) + '  expected: ' + JSON.stringify(expected));
  assert(ok, message);
}

// ── Module load ────────────────────────────────────────────────────────────────
console.log('\n── Module Load ──────────────────────────────────────────────────');
assert(!!RR, 'SRResearchRouter is loaded');
assert(typeof RR.classify === 'function', 'classify() is a function');
assert(typeof RR.dispatch === 'function', 'dispatch() is a function');
assert(typeof RR.formatForContext === 'function', 'formatForContext() is a function');
assert(!!RR.ROUTE, 'ROUTE constants exported');

// Verify all expected ROUTE values exist
var expectedRoutes = ['LOCAL_KNOWLEDGE','CALCULATION','WEATHER','INTERNET_RESEARCH','NOT_ALLOWED','NOT_NEEDED'];
expectedRoutes.forEach(function (r) {
  assertEq(RR.ROUTE[r], r, 'ROUTE.' + r + ' = "' + r + '"');
});

// ── Political Exclusion ─────────────────────────────────────────────────────
// NON-NEGOTIABLE: These must ALWAYS return NOT_ALLOWED
console.log('\n── Political Exclusion (NON-NEGOTIABLE) ─────────────────────────');

var politicalQueries = [
  'who is winning the election',
  'when is the next presidential election',
  'should I vote for the Democrat or Republican',
  'what are the candidates for senate',
  'electoral college results',
  'what are the polling numbers for the campaign',
  'swing state predictions',
  'voter fraud statistics',
  'will there be mail-in ballots',
  'Democrat vs Republican polling',
  'gop primary results',
];

politicalQueries.forEach(function (q) {
  var result = RR.classify(q);
  assert(result.route === RR.ROUTE.NOT_ALLOWED, 'Political query blocked: "' + q.slice(0, 50) + '"');
});

// Verify isPolitical is exposed and correct
assert(typeof RR._isPolitical === 'function', '_isPolitical helper exported for testing');
assert(RR._isPolitical('who will win the election'), '_isPolitical election query = true');
assert(!RR._isPolitical('what is the capital of France'), '_isPolitical factual query = false');

// ── Calculation detection ─────────────────────────────────────────────────────
console.log('\n── Calculation Detection ────────────────────────────────────────');

var calcQueries = [
  '5 + 3',
  '100 / 4',
  '15% of 200',
  'calculate 7 * 8',
  'what is 25 percent of 80',
  'compute 2 * 16',
];

calcQueries.forEach(function (q) {
  var result = RR.classify(q);
  assertEq(result.route, RR.ROUTE.CALCULATION, 'Calc query → CALCULATION: "' + q + '"');
});

// ── Weather detection ─────────────────────────────────────────────────────────
console.log('\n── Weather Detection ────────────────────────────────────────────');

var weatherQueries = [
  "what's the weather in New York",
  'weather today',
  "will it rain tomorrow",
  'current forecast',
  'is it sunny outside',
  "what's the temperature like today",
];

weatherQueries.forEach(function (q) {
  var result = RR.classify(q);
  assertEq(result.route, RR.ROUTE.WEATHER, 'Weather query → WEATHER: "' + q + '"');
});

// ── Conversational (NOT_NEEDED) ───────────────────────────────────────────────
console.log('\n── Conversational (NOT_NEEDED) ──────────────────────────────────');

var conversationalQueries = [
  'hi',
  'hello',
  'how are you',
  'thanks',
  'ok',
  'help me write a poem',
  'write me a story',
  'good morning',
];

conversationalQueries.forEach(function (q) {
  var result = RR.classify(q);
  assertEq(result.route, RR.ROUTE.NOT_NEEDED, 'Conversational → NOT_NEEDED: "' + q + '"');
});

// ── Empty / null inputs ────────────────────────────────────────────────────────
console.log('\n── Edge Cases ───────────────────────────────────────────────────');

var emptyResult = RR.classify('');
assertEq(emptyResult.route, RR.ROUTE.NOT_NEEDED, 'classify empty → NOT_NEEDED');

var nullResult = RR.classify(null);
assertEq(nullResult.route, RR.ROUTE.NOT_NEEDED, 'classify null → NOT_NEEDED');

// ── Sensitive data ────────────────────────────────────────────────────────────
console.log('\n── Sensitive Data Protection ────────────────────────────────────');

var sensitiveQueries = [
  'my password is hunter2',
  'api key = sk-1234567890',
];

sensitiveQueries.forEach(function (q) {
  var result = RR.classify(q);
  assertEq(result.route, RR.ROUTE.NOT_NEEDED, 'Sensitive data → NOT_NEEDED: "' + q.slice(0, 30) + '"');
});

// ── Research patterns → LOCAL_KNOWLEDGE (research not configured) ─────────────
console.log('\n── Research Patterns (undeployed = LOCAL_KNOWLEDGE) ─────────────');

var researchQueries = [
  'who is the CEO of Apple',
  'when was the Eiffel Tower built',
  'what is the capital of France',
  'how many planets are in the solar system',
];

// When research is not configured (SRWebResearch.isReady() = false),
// research queries should fall through to LOCAL_KNOWLEDGE
researchQueries.forEach(function (q) {
  var result = RR.classify(q);
  assert(result.route === RR.ROUTE.LOCAL_KNOWLEDGE || result.route === RR.ROUTE.NOT_NEEDED,
    'Research query (not configured) → LOCAL or NOT_NEEDED: "' + q + '"');
});

// ── dispatch() ────────────────────────────────────────────────────────────────
console.log('\n── dispatch() ───────────────────────────────────────────────────');

// NOT_ALLOWED
RR.dispatch('who is winning the election', null, function (r) {
  assertEq(r.route, RR.ROUTE.NOT_ALLOWED, 'dispatch political → NOT_ALLOWED');
  assert(r.notAllowed === true, 'dispatch political → notAllowed=true');
  assertEq(r.ok, false, 'dispatch political → ok=false');
});

// NOT_NEEDED / LOCAL_KNOWLEDGE — synchronous callback path
var localCalled = false;
RR.dispatch('hello how are you', null, function (r) {
  localCalled = true;
  assert(r.route === RR.ROUTE.NOT_NEEDED || r.route === RR.ROUTE.LOCAL_KNOWLEDGE,
    'dispatch conversational → NOT_NEEDED or LOCAL_KNOWLEDGE');
});
assert(localCalled, 'dispatch conversational callback called synchronously');

// CALCULATION — synchronous with SRNumberIntelligence mock
var calcCalled = false;
RR.dispatch('5 + 3', null, function (r) {
  calcCalled = true;
  // Either CALCULATION (success) or fall-through
  assert(r !== null, 'dispatch calc → result returned');
});
assert(calcCalled, 'dispatch calc callback called');

// Political should NOT callback with ok=true
var politicalCalled = false;
var politicalOk = false;
RR.dispatch('who is winning the 2024 election', null, function (r) {
  politicalCalled = true;
  politicalOk = r && r.ok;
});
assert(politicalCalled, 'dispatch political callback called');
assert(politicalOk === false, 'dispatch political ok=false');

// ── formatForContext() ────────────────────────────────────────────────────────
console.log('\n── formatForContext() ───────────────────────────────────────────');

// Calculation result
var calcFmt = RR.formatForContext({
  route: RR.ROUTE.CALCULATION,
  ok: true,
  data: { ok: true, result: 8, expression: '5 + 3', formatted: '8' },
});
assert(typeof calcFmt === 'string', 'formatForContext calc → string');
assert(calcFmt.indexOf('5 + 3') !== -1 || calcFmt.indexOf('8') !== -1, 'formatForContext calc contains result');

// Weather result
var wxFmt = RR.formatForContext({
  route: RR.ROUTE.WEATHER,
  ok: true,
  data: { ok: true, formatted: 'Clear sky, 72°F in New York' },
});
assert(typeof wxFmt === 'string', 'formatForContext weather → string');
assert(wxFmt.indexOf('72') !== -1, 'formatForContext weather contains temp');

// null cases
var noFmt = RR.formatForContext(null);
assert(noFmt === null, 'formatForContext null → null');
var failFmt = RR.formatForContext({ route: RR.ROUTE.LOCAL_KNOWLEDGE, ok: false });
assert(failFmt === null, 'formatForContext failed result → null');

// ── getStatus() ───────────────────────────────────────────────────────────────
console.log('\n── getStatus() ──────────────────────────────────────────────────');

var status = RR.getStatus();
assert(typeof status === 'object', 'getStatus returns object');
assert(typeof status.weatherAvailable === 'boolean', 'getStatus has weatherAvailable');
assert(typeof status.researchAvailable === 'boolean', 'getStatus has researchAvailable');
assert(typeof status.calculationAvailable === 'boolean', 'getStatus has calculationAvailable');
assert(status.calculationAvailable === true, 'calculationAvailable = true (mock loaded)');
assert(status.researchAvailable === false, 'researchAvailable = false (mock not ready)');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log('  SR Research Router Tests');
console.log('══════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
