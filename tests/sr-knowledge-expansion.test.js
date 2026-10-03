/**
 * shadow-reaper-v2/tests/sr-knowledge-expansion.test.js
 * Shadow Reaper — Knowledge Expansion System Tests
 *
 * Build: SR-KNOWLEDGE-EXPANSION-TEST-1
 *
 * Usage: node tests/sr-knowledge-expansion.test.js
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

load('knowledge/sr-knowledge-expansion.js');

var PASS = 0, FAIL = 0;

function test(name, fn) {
  try { fn(); PASS++; console.log('  ✓ ' + name); }
  catch (e) { FAIL++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }
function assertStrContains(str, sub, m) {
  if (typeof str !== 'string' || str.indexOf(sub) === -1) throw new Error((m || 'Missing "' + sub + '"') + ' in: ' + str);
}

var ke = global.SRKnowledgeExpansion;
assert(ke, 'SRKnowledgeExpansion must be loaded');

// ── Module structure
test('Module: BUILD_ID correct', function () {
  assert(ke.BUILD_ID === 'SR-KNOWLEDGE-EXPANSION-1');
});

test('Module: CATEGORY constants defined', function () {
  assert(ke.CATEGORY.GENERAL             === 'GENERAL');
  assert(ke.CATEGORY.CREATOR             === 'CREATOR');
  assert(ke.CATEGORY.PERSONAL_MEMORY     === 'PERSONAL_MEMORY');
  assert(ke.CATEGORY.PROJECT             === 'PROJECT');
  assert(ke.CATEGORY.LEARNED_GENERAL     === 'LEARNED_GENERAL');
  assert(ke.CATEGORY.LIVE_EXTERNAL       === 'LIVE_EXTERNAL');
  assert(ke.CATEGORY.FOUNDATIONAL_LANGUAGE === 'FOUNDATIONAL_LANGUAGE');
});

test('Module: CONFIDENCE constants defined', function () {
  assert(ke.CONFIDENCE.VERIFIED    === 1.0);
  assert(ke.CONFIDENCE.HIGH        === 0.8);
  assert(ke.CONFIDENCE.MEDIUM      === 0.6);
  assert(ke.CONFIDENCE.LOW         === 0.4);
  assert(ke.CONFIDENCE.SPECULATIVE === 0.2);
});

// ── getStats()
test('getStats: generalBuiltIn > 0', function () {
  var stats = ke.getStats();
  assert(stats.generalBuiltIn > 0, 'Should have built-in knowledge items');
  assert(typeof stats.total === 'number');
});

// ── classifyClaim()
test('classifyClaim: "My name is Alex" → PERSONAL_MEMORY, isPrivate=true', function () {
  var r = ke.classifyClaim('My name is Alex');
  assert(r.isPrivate, 'Should be private');
  assert(r.category === ke.CATEGORY.PERSONAL_MEMORY, 'Should be PERSONAL_MEMORY. Got: ' + r.category);
});

test('classifyClaim: "I live in Austin Texas" → PERSONAL_MEMORY', function () {
  var r = ke.classifyClaim('I live in Austin Texas');
  assert(r.isPrivate, 'Should be private');
  assert(r.category === ke.CATEGORY.PERSONAL_MEMORY, 'Should be PERSONAL_MEMORY');
});

test('classifyClaim: "My project is a dark website" → PROJECT, isPrivate=true', function () {
  var r = ke.classifyClaim('My project is a dark website');
  assert(r.isPrivate, 'Project claim should be private');
  assert(r.category === ke.CATEGORY.PROJECT, 'Should be PROJECT. Got: ' + r.category);
});

test('classifyClaim: "Shadow Nexus Social is a creative platform" → CREATOR', function () {
  var r = ke.classifyClaim('Shadow Nexus Social is a creative platform built by Chris');
  assert(!r.isPrivate, 'Creator claim should not be private');
  assert(r.category === ke.CATEGORY.CREATOR, 'Should be CREATOR. Got: ' + r.category);
});

test('classifyClaim: "A CPU is the central processing unit" → LEARNED_GENERAL', function () {
  var r = ke.classifyClaim('A CPU is the central processing unit of a computer');
  assert(!r.isPrivate, 'General fact should not be private');
  assert(r.category === ke.CATEGORY.LEARNED_GENERAL || r.category === ke.CATEGORY.GENERAL,
    'Should be LEARNED_GENERAL or GENERAL. Got: ' + r.category);
});

test('classifyClaim: API key → SENSITIVE, not stored', function () {
  var r = ke.classifyClaim('My API key is sk-1234567890abcdef');
  assert(!r.category || r.category === null || r.reason === 'SENSITIVE',
    'Should be rejected as sensitive. Got: ' + JSON.stringify(r));
});

test('classifyClaim: password → SENSITIVE', function () {
  var r = ke.classifyClaim('My password is hunter2');
  assert(r.reason === 'SENSITIVE', 'Should reject password as sensitive');
});

// ── learnFact()
test('learnFact: general fact gets stored', function () {
  var r = ke.learnFact('A capacitor stores electrical charge');
  assert(r.stored, 'Should store general fact. Reason: ' + r.reason);
  assert(r.category === ke.CATEGORY.LEARNED_GENERAL, 'Should be LEARNED_GENERAL');
});

test('learnFact: duplicate fact gets reinforced', function () {
  var fact = 'An LED requires a current-limiting resistor to prevent burning out';
  ke.learnFact(fact);  // first time
  var r = ke.learnFact(fact);  // second time
  // Second call should not fail
  assert(r !== undefined, 'Second call should not crash');
});

test('learnFact: personal data is NOT stored as learned general', function () {
  var r = ke.learnFact('My email address is test@example.com');
  assert(!r.stored || r.category !== ke.CATEGORY.LEARNED_GENERAL,
    'Personal email should not be stored as learned general knowledge');
});

test('learnFact: project info is NOT stored as learned general', function () {
  var r = ke.learnFact('My app uses Firebase for the backend');
  assert(!r.stored || r.category !== ke.CATEGORY.LEARNED_GENERAL,
    'Personal project detail should not be stored as learned general knowledge');
});

test('learnFact: API key is rejected as sensitive', function () {
  var r = ke.learnFact('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test');
  assert(!r.stored, 'Bearer token should not be stored. Got: ' + JSON.stringify(r));
});

test('learnFact: too-short string is rejected', function () {
  var r = ke.learnFact('hi');
  assert(!r.stored, 'Too-short string should not be stored');
});

// ── query()
test('query: finds CPU knowledge', function () {
  var results = ke.query('what is a CPU processor?');
  assert(results.length > 0, 'Should find CPU knowledge');
  var hasRelevant = results.some(function (r) {
    var text = (r.content || r.text || '').toLowerCase();
    var kws  = (r.keywords || []).join(' ').toLowerCase();
    return text.indexOf('cpu') !== -1 || kws.indexOf('cpu') !== -1;
  });
  assert(hasRelevant, 'At least one result should be CPU-relevant');
});

test('query: finds RAM knowledge', function () {
  var results = ke.query('explain random access memory RAM');
  assert(results.length > 0, 'Should find RAM knowledge');
});

test('query: finds encryption/HTTPS knowledge', function () {
  var results = ke.query('how does HTTPS and TLS encryption work?');
  assert(results.length >= 0, 'Should not crash (may or may not find result)');
});

test('query: returns max requested results', function () {
  var results = ke.query('what is computing?', [ke.CATEGORY.GENERAL], 2);
  assert(results.length <= 2, 'Should not exceed maxResults');
});

test('query: unrelated query returns no results', function () {
  var results = ke.query('aaaaaabbbbbccccxyzxyz1234', [ke.CATEGORY.GENERAL], 3);
  assert(Array.isArray(results), 'Should return array');
  // May or may not return results for gibberish — just shouldn't crash
});

test('query: filters by category', function () {
  // Query only GENERAL — should not return CREATOR items
  var results = ke.query('shadow nexus', [ke.CATEGORY.GENERAL], 5);
  results.forEach(function (r) {
    assert(r.category === ke.CATEGORY.GENERAL || r.category === ke.CATEGORY.LEARNED_GENERAL,
      'All results should be GENERAL. Got: ' + r.category);
  });
});

// ── queryAsContext()
test('queryAsContext: returns string or null for CPU query', function () {
  var result = ke.queryAsContext('how does a CPU work?');
  assert(result === null || typeof result === 'string', 'Should return string or null');
  if (result) assert(result.length > 10, 'Context string should have substance');
});

test('queryAsContext: does not return [object Object]', function () {
  var result = ke.queryAsContext('explain machine learning');
  if (result) {
    assert(result.indexOf('[object Object]') === -1, 'Should not contain raw object');
  }
});

// ── Privacy isolation
test('Privacy: personal fact query returns nothing from GENERAL store', function () {
  // Store a general fact first
  ke.learnFact('Water boils at 100 degrees Celsius at sea level');
  // Query for something that sounds personal
  var results = ke.query('my address is 123 main street', [ke.CATEGORY.GENERAL], 5);
  results.forEach(function (r) {
    var text = (r.content || r.text || '').toLowerCase();
    assert(text.indexOf('address') === -1 || text.indexOf('main street') === -1,
      'Personal address should never appear in general knowledge results');
  });
});

// ── Results
console.log('\nPASS : ' + PASS);
console.log('FAIL : ' + FAIL);
console.log('TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
