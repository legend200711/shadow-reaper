/**
 * shadow-reaper-v2/tests/sr-coding-foundation.test.js
 * Shadow Reaper — Coding Foundation Tests
 *
 * Build: SR-CODING-TEST-1
 *
 * Usage: node tests/sr-coding-foundation.test.js
 */

'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.window = global;
try {
  Object.defineProperty(global, 'navigator', {
    value: { onLine: true, userAgent: 'node-test' },
    writable: true, configurable: true,
  });
} catch (_) {}

function load(relPath) {
  try { require(path.join(ROOT, relPath)); return true; }
  catch (e) { return false; }
}

load('coding/sr-coding-foundation.js');

var PASS = 0, FAIL = 0;

function test(name, fn) {
  try { fn(); PASS++; console.log('  ✓ ' + name); }
  catch (e) { FAIL++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }
function assertContains(arr, val, m) { if (arr.indexOf(val) === -1) throw new Error((m || 'Missing: ' + val) + ' in ' + JSON.stringify(arr)); }
function assertNotContains(arr, val, m) { if (arr.indexOf(val) !== -1) throw new Error((m || 'Should not have: ' + val) + ' in ' + JSON.stringify(arr)); }
function assertStrContains(str, sub, m) {
  if (typeof str !== 'string' || str.indexOf(sub) === -1) throw new Error((m || 'Missing "' + sub + '"') + ' in: ' + str);
}

var cf = global.SRCodingFoundation;
assert(cf, 'SRCodingFoundation must be loaded');

// ── Module structure
test('Module: BUILD_ID correct', function () {
  assert(cf.BUILD_ID === 'SR-CODING-FOUNDATION-1');
});

test('Module: LANGUAGES has required entries', function () {
  var required = ['javascript', 'html', 'css', 'python', 'nodejs', 'git', 'http', 'firebase', 'cloudflare_workers', 'service_workers', 'sql'];
  required.forEach(function (lang) {
    assert(cf.LANGUAGES[lang], 'Missing language: ' + lang);
  });
});

test('Module: CONCEPTS has key entries', function () {
  var required = ['async/await', 'promises', 'closures', 'this binding', 'event loop', 'dom', 'scope', 'cors', 'rest api', 'authentication'];
  required.forEach(function (c) {
    assert(cf.CONCEPTS[c], 'Missing concept: ' + c);
  });
});

test('Module: ERROR_PATTERNS array exists with entries', function () {
  assert(Array.isArray(cf.ERROR_PATTERNS), 'ERROR_PATTERNS should be array');
  assert(cf.ERROR_PATTERNS.length >= 6, 'Should have at least 6 error patterns');
});

test('Module: ARCHITECTURE_PATTERNS has pwa, rest_api, auth_flow, caching', function () {
  assert(cf.ARCHITECTURE_PATTERNS.pwa);
  assert(cf.ARCHITECTURE_PATTERNS.rest_api);
  assert(cf.ARCHITECTURE_PATTERNS.auth_flow);
  assert(cf.ARCHITECTURE_PATTERNS.caching);
});

// ── detectLanguage()
test('detectLanguage: "async/await in JavaScript" → javascript', function () {
  assertContains(cf.detectLanguage('explain async/await in JavaScript'), 'javascript');
});

test('detectLanguage: "git commit and push" → git', function () {
  assertContains(cf.detectLanguage('how do I git commit and push'), 'git');
});

test('detectLanguage: "html form" → html', function () {
  assertContains(cf.detectLanguage('how do I create an HTML form'), 'html');
});

test('detectLanguage: "css flexbox" → css', function () {
  assertContains(cf.detectLanguage('explain css flexbox layout'), 'css');
});

test('detectLanguage: "firebase firestore" → firebase', function () {
  assertContains(cf.detectLanguage('how do I write to Firebase Firestore'), 'firebase');
});

test('detectLanguage: "service worker offline" → service_workers', function () {
  assertContains(cf.detectLanguage('why is my service worker serving old code'), 'service_workers');
});

test('detectLanguage: "cloudflare worker" → cloudflare_workers', function () {
  assertContains(cf.detectLanguage('how do I deploy a cloudflare worker'), 'cloudflare_workers');
});

test('detectLanguage: "python def" → python', function () {
  assertContains(cf.detectLanguage('how do I write a def in python'), 'python');
});

test('detectLanguage: weather question → no languages', function () {
  var langs = cf.detectLanguage('What is the weather in New York?');
  // Should not detect code languages for weather questions
  assertNotContains(langs, 'javascript');
  assertNotContains(langs, 'python');
});

// ── detectConcept()
test('detectConcept: async/await question', function () {
  assertContains(cf.detectConcept('how does async await work in JavaScript'), 'async/await');
});

test('detectConcept: promise chain', function () {
  assertContains(cf.detectConcept('how do .then and .catch work on promises'), 'promises');
});

test('detectConcept: closure question', function () {
  assertContains(cf.detectConcept('what is a closure in JavaScript?'), 'closures');
});

test('detectConcept: CORS error', function () {
  assertContains(cf.detectConcept('I am getting a CORS error on my API'), 'cors');
});

test('detectConcept: service worker caching', function () {
  assertContains(cf.detectConcept('my service worker is serving stale JavaScript files'), 'service worker caching');
});

test('detectConcept: scope / hoisting', function () {
  assertContains(cf.detectConcept('explain scope and hoisting in JavaScript'), 'scope');
});

test('detectConcept: DOM manipulation', function () {
  assertContains(cf.detectConcept('how do I use document.querySelector to manipulate DOM'), 'dom');
});

test('detectConcept: authentication/JWT', function () {
  assertContains(cf.detectConcept('how does JWT authentication work?'), 'authentication');
});

// ── isCodeQuery()
test('isCodeQuery: JS error → true', function () {
  assert(cf.isCodeQuery('my JavaScript is throwing a TypeError'), 'Should be code query');
});

test('isCodeQuery: Python script → true', function () {
  assert(cf.isCodeQuery('my python script has a def that fails'), 'Should be code query');
});

test('isCodeQuery: weather → false', function () {
  assert(!cf.isCodeQuery('what is the weather today?'), 'Weather should not be code query');
});

test('isCodeQuery: greeting → false', function () {
  assert(!cf.isCodeQuery('Hey how are you doing?'), 'Greeting should not be code query');
});

// ── matchErrorPattern()
test('matchErrorPattern: "cannot read properties of undefined"', function () {
  var result = cf.matchErrorPattern('TypeError: Cannot read properties of undefined (reading \'name\')');
  assert(result.matched, 'Should match');
  assert(result.errorType.indexOf('Null') !== -1, 'Should identify as null reference');
  assert(result.likelyCauses.length > 0);
  assert(result.fixApproach.length > 10);
});

test('matchErrorPattern: "is not a function"', function () {
  var result = cf.matchErrorPattern('TypeError: myFunc is not a function');
  assert(result.matched, 'Should match not-a-function error');
  assert(result.likelyCauses.length > 0);
});

test('matchErrorPattern: "is not defined"', function () {
  var result = cf.matchErrorPattern('ReferenceError: foo is not defined');
  assert(result.matched, 'Should match ReferenceError');
});

test('matchErrorPattern: SyntaxError unexpected token', function () {
  var result = cf.matchErrorPattern('SyntaxError: Unexpected token }');
  assert(result.matched, 'Should match SyntaxError');
});

test('matchErrorPattern: CORS error', function () {
  var result = cf.matchErrorPattern('Access to fetch blocked by CORS policy');
  assert(result.matched, 'Should match CORS error');
  assertStrContains(result.fixApproach, 'CORS', 'Fix approach mentions CORS');
});

test('matchErrorPattern: Maximum call stack', function () {
  var result = cf.matchErrorPattern('RangeError: Maximum call stack size exceeded');
  assert(result.matched, 'Should match call stack error');
  assertStrContains(result.diagnosis.toLowerCase(), 'recursion', 'Should mention recursion');
});

test('matchErrorPattern: UnhandledPromiseRejection', function () {
  var result = cf.matchErrorPattern('UnhandledPromiseRejection: Error: something failed');
  assert(result.matched, 'Should match promise rejection');
});

test('matchErrorPattern: unknown error → not matched', function () {
  var result = cf.matchErrorPattern('My app looks weird today');
  assert(!result.matched, 'Non-error message should not match');
});

// ── explain()
test('explain: async/await query returns structured result', function () {
  var result = cf.explain('explain how async await works in JavaScript');
  assert(result, 'Should return result');
  assertContains(result.languages, 'javascript');
  assertContains(result.detectedConcepts, 'async/await');
  assert(result.conceptSummaries.length > 0, 'Should have concept summaries');
  assert(result.confidence > 0.5, 'Confidence should be good for matched concept');
});

test('explain: CORS error query has error match', function () {
  var result = cf.explain('I am getting a CORS error when calling my API');
  assert(result.errorMatch && result.errorMatch.matched, 'Should have error match');
  assert(result.errorMatch.errorType === 'CORS Error', 'Should identify CORS error type');
});

test('explain: service worker caching returns pitfalls', function () {
  var result = cf.explain('why does my service worker keep serving old JavaScript files?');
  assert(result.pitfalls.length > 0, 'Should have pitfalls for service worker caching');
  var hasCacheWarning = result.pitfalls.some(function (p) {
    return p.toLowerCase().indexOf('stale') !== -1 || p.toLowerCase().indexOf('cache') !== -1 || p.toLowerCase().indexOf('version') !== -1;
  });
  assert(hasCacheWarning, 'Should warn about stale cache issues');
});

test('explain: PWA question detects architecture pattern', function () {
  var result = cf.explain('how do I build a PWA with offline support?');
  assert(result.architecturePattern, 'Should detect PWA architecture pattern');
  assert(result.architecturePattern.name.toLowerCase().indexOf('pwa') !== -1, 'Should be PWA pattern');
});

test('explain: confidence is 0-1 range', function () {
  var result = cf.explain('some coding question about javascript');
  assert(result.confidence >= 0 && result.confidence <= 1, 'Confidence out of range: ' + result.confidence);
});

// ── composeExplanationContext()
test('composeExplanationContext: async/await produces injectable string', function () {
  var expl = cf.explain('explain async await in javascript');
  var ctx = cf.composeExplanationContext(expl);
  assert(typeof ctx === 'string', 'Should return string');
  assert(ctx.length > 20, 'Should have substantial content');
  var ctxLower = ctx.toLowerCase();
  assert(ctxLower.indexOf('async') !== -1 || ctxLower.indexOf('promise') !== -1 || ctxLower.indexOf('asynchronous') !== -1,
    'Context should contain async-related content: ' + ctx);
});

test('composeExplanationContext: error includes diagnosis and fix', function () {
  var expl = cf.explain('ReferenceError: myVar is not defined');
  var ctx = cf.composeExplanationContext(expl);
  if (expl.errorMatch && expl.errorMatch.matched) {
    assert(ctx, 'Should produce context for error query');
    assert(ctx.indexOf('ReferenceError') !== -1 || ctx.indexOf('Scope') !== -1 || ctx.indexOf('not defined') !== -1 || ctx.indexOf('defined') !== -1,
      'Should contain error diagnosis info: ' + ctx);
  }
});

test('composeExplanationContext: null input → null output', function () {
  var ctx = cf.composeExplanationContext(null);
  assert(ctx === null, 'Null input should return null');
});

// ── lookupLanguage() / lookupConcept()
test('lookupLanguage: "javascript" returns entry', function () {
  var entry = cf.lookupLanguage('javascript');
  assert(entry, 'Should return JS entry');
  assert(entry.name === 'JavaScript');
  assert(Array.isArray(entry.key_concepts));
  assert(entry.key_concepts.length > 5);
});

test('lookupLanguage: unknown key returns null', function () {
  assert(cf.lookupLanguage('cobol') === null, 'Unknown language should return null');
});

test('lookupConcept: "async/await" returns entry', function () {
  var c = cf.lookupConcept('async/await');
  assert(c, 'Should return async/await concept entry');
  assert(c.summary.length > 20, 'Summary should be substantive');
  assert(Array.isArray(c.common_pitfalls));
  assert(c.common_pitfalls.length > 0);
});

test('lookupConcept: unknown returns null', function () {
  assert(cf.lookupConcept('nonexistent_concept') === null, 'Unknown concept should return null');
});

// ── Results
console.log('\nPASS : ' + PASS);
console.log('FAIL : ' + FAIL);
console.log('TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
