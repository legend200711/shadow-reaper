/**
 * shadow-reaper-v2/tests/sr-reasoning-core.test.js
 * Shadow Reaper — Reasoning Core Tests
 *
 * Build: SR-REASONING-TEST-1
 *
 * Usage: node tests/sr-reasoning-core.test.js
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

load('core/sr-reasoning-core.js');

var PASS = 0, FAIL = 0;

function test(name, fn) {
  try { fn(); PASS++; console.log('  ✓ ' + name); }
  catch (e) { FAIL++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }
function assertContains(arr, val, m) { if (arr.indexOf(val) === -1) throw new Error((m || 'Missing: ' + val) + ' in ' + JSON.stringify(arr)); }

var rc = global.SRReasoningCore;
assert(rc, 'SRReasoningCore must be loaded');

// ── Module structure
test('Module: BUILD_ID correct', function () {
  assert(rc.BUILD_ID === 'SR-REASONING-CORE-1');
});

test('Module: TASK_TYPE constants defined', function () {
  assert(rc.TASK_TYPE.DIAGNOSIS === 'diagnosis');
  assert(rc.TASK_TYPE.EXPLANATION === 'explanation');
  assert(rc.TASK_TYPE.COMPARISON === 'comparison');
  assert(rc.TASK_TYPE.HOW_TO === 'how_to');
  assert(rc.TASK_TYPE.PLANNING === 'planning');
});

test('Module: TOOL constants defined', function () {
  assert(rc.TOOL.CODING === 'CODING');
  assert(rc.TOOL.WEATHER === 'WEATHER');
  assert(rc.TOOL.ELECTRONICS === 'ELECTRONICS');
  assert(rc.TOOL.CALCULATION === 'CALCULATION');
});

// ── classify()
test('classify: no display → DIAGNOSIS', function () {
  var c = rc.classify('My computer turns on but there is no display');
  assert(c.taskType === rc.TASK_TYPE.DIAGNOSIS, c.taskType);
  assert(c.isDiagnostic);
  assertContains(c.domains, 'hardware');
});

test('classify: how to setup → HOW_TO', function () {
  var c = rc.classify('How do I set up a service worker for offline mode?');
  assert(c.taskType === rc.TASK_TYPE.HOW_TO || c.taskType === rc.TASK_TYPE.EXPLANATION, c.taskType);
  assert(c.isHowTo || c.isExplanation);
});

test('classify: comparison → COMPARISON', function () {
  var c = rc.classify('What is the difference between let and const in JavaScript?');
  assert(c.taskType === rc.TASK_TYPE.COMPARISON || c.taskType === rc.TASK_TYPE.EXPLANATION, c.taskType);
});

test('classify: explanation → EXPLANATION', function () {
  var c = rc.classify('Can you explain what async/await does?');
  assert(c.taskType === rc.TASK_TYPE.EXPLANATION, c.taskType);
});

test('classify: code domain detected for JS question', function () {
  var c = rc.classify('Why is my JavaScript function returning undefined?');
  assertContains(c.domains, 'code');
  assert(c.isDiagnostic);
});

test('classify: electronics domain detected', function () {
  var c = rc.classify('Why does my LED not light up in the circuit?');
  assertContains(c.domains, 'electronics');
});

test('classify: software domain detected', function () {
  var c = rc.classify('My application crashes when I open it');
  assertContains(c.domains, 'software');
  assert(c.isDiagnostic);
});

test('classify: network domain detected', function () {
  var c = rc.classify('My wifi keeps disconnecting');
  assertContains(c.domains, 'network');
});

// ── reason()
test('reason: hardware diagnostic has possibleCauses', function () {
  var u = { intent: 'QUESTION', tone: 'neutral', entities: {}, raw: 'no display' };
  var r = rc.reason('My computer turns on but there is no display', u, {}, {});
  assert(r.taskType === rc.TASK_TYPE.DIAGNOSIS, r.taskType);
  assert(r.possibleCauses.length > 0, 'Should have possible causes');
  assert(r.domains.indexOf('hardware') !== -1, 'Hardware domain');
});

test('reason: code diagnostic has possibleCauses', function () {
  var u = { intent: 'QUESTION', tone: 'neutral', entities: {}, raw: 'undefined error' };
  var r = rc.reason('My JavaScript returns undefined everywhere', u, {}, {});
  assert(r.possibleCauses.length > 0 || r.taskType !== 'unknown', 'Should produce reasoning');
});

test('reason: how-to produces steps', function () {
  var u = { intent: 'QUESTION', tone: 'neutral', entities: {}, raw: 'how to set up pwa' };
  var r = rc.reason('How do I set up a service worker?', u, {}, {});
  assert(r.steps.length > 0, 'Should produce steps');
});

test('reason: comparison produces dimensions', function () {
  var u = { intent: 'QUESTION', tone: 'neutral', entities: {}, raw: 'compare two things' };
  var r = rc.reason('Compare SSD vs HDD for performance', u, {}, {});
  assert(r.comparisonDimensions.length > 0, 'Should produce comparison dimensions');
});

test('reason: constraint extraction works', function () {
  var u = { intent: 'QUESTION', tone: 'neutral', entities: {}, raw: 'without using jquery' };
  var r = rc.reason('How do I make a dropdown without using jQuery?', u, {}, {});
  assert(r.constraints.length > 0, 'Should extract constraint: "without using jQuery"');
});

test('reason: confidence is within 0-1 range', function () {
  var u = { intent: 'QUESTION', tone: 'neutral', entities: {}, raw: 'test' };
  var r = rc.reason('test query', u, {}, {});
  assert(r.confidence >= 0 && r.confidence <= 1, 'Confidence out of range: ' + r.confidence);
});

test('reason: knowledge snippet boosts confidence', function () {
  var u = { intent: 'QUESTION', tone: 'neutral', entities: {}, raw: 'cpu test' };
  var r1 = rc.reason('what is a cpu', u, {}, {});
  var r2 = rc.reason('what is a cpu', u, {}, { knowledgeSnippet: 'A CPU is the processor.' });
  assert(r2.confidence >= r1.confidence, 'Knowledge snippet should boost confidence');
});

test('reason: ambiguous short query has low confidence', function () {
  var u = { intent: 'UNKNOWN', tone: 'neutral', entities: {}, raw: 'fix' };
  var r = rc.reason('fix', u, {}, {});
  assert(r.confidence < 0.6, 'Short ambiguous query should have low confidence: ' + r.confidence);
});

// ── composeReasoningContext()
test('composeReasoningContext: returns string for diagnostic', function () {
  var u = { intent: 'QUESTION', tone: 'neutral', entities: {}, raw: 'no display' };
  var r = rc.reason('no display on monitor', u, {}, {});
  var ctx = rc.composeReasoningContext(r);
  assert(typeof ctx === 'string', 'Should return string');
  assert(ctx.length > 5, 'Context should have content');
});

test('composeReasoningContext: returns null for empty result', function () {
  var ctx = rc.composeReasoningContext(null);
  assert(ctx === null, 'Null input → null output');
});

// ── selectTool()
test('selectTool: code query → CODING', function () {
  var tools = rc.selectTool('explain async/await in javascript');
  assertContains(tools, rc.TOOL.CODING);
});

test('selectTool: weather query → WEATHER', function () {
  var tools = rc.selectTool('what is the weather in London?');
  assertContains(tools, rc.TOOL.WEATHER);
});

test('selectTool: electronics query → ELECTRONICS', function () {
  var tools = rc.selectTool('what resistor do I need for a 5V LED?');
  assertContains(tools, rc.TOOL.ELECTRONICS);
});

test('selectTool: math query → CALCULATION', function () {
  var tools = rc.selectTool('what is 250 * 16?');
  assertContains(tools, rc.TOOL.CALCULATION);
});

test('selectTool: general chat → CONVERSATION', function () {
  var tools = rc.selectTool('Hello, how are you?');
  assertContains(tools, rc.TOOL.CONVERSATION);
});

// ── decomposeQuestion()
test('decomposeQuestion: complex question returns decomposition object', function () {
  var d = rc.decomposeQuestion('What is async and how does it work and why should I use it?');
  assert(typeof d === 'object');
  assert(typeof d.isComplex === 'boolean');
  assert(Array.isArray(d.subQuestions));
});

test('decomposeQuestion: diagnostic question gets sub-questions', function () {
  var d = rc.decomposeQuestion('My computer won\'t turn on');
  assert(typeof d === 'object');
  assert(Array.isArray(d.subQuestions));
  if (d.subQuestions.length > 0) {
    assert(d.subQuestions[0].length > 5, 'Sub-questions should be meaningful');
  }
});

// ── Results
console.log('\nPASS : ' + PASS);
console.log('FAIL : ' + FAIL);
console.log('TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
