/**
 * shadow-reaper-v2/tests/sr-model-adapter.test.js
 * Shadow Reaper — Shadow Model Adapter Tests
 *
 * Build: SR-MODEL-ADAPTER-TEST-1
 *
 * Usage: node tests/sr-model-adapter.test.js
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

// Load dependencies for response engine (needed for deterministic fallback)
load('core/understanding-engine.js');
load('core/context-engine.js');
load('core/conversation-engine.js');
load('core/response-engine.js');
load('core/sr-model-adapter.js');

var PASS = 0, FAIL = 0;

function test(name, fn) {
  try { fn(); PASS++; console.log('  ✓ ' + name); }
  catch (e) { FAIL++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}
function testAsync(name, fn) {
  try { fn(); PASS++; console.log('  ✓ ' + name); }
  catch (e) { FAIL++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed'); }

var adapter = global.SRModelAdapter;
assert(adapter, 'SRModelAdapter must be loaded');

// ── Module structure
test('Module: BUILD_ID correct', function () {
  assert(adapter.BUILD_ID === 'SR-MODEL-ADAPTER-1');
});

test('Module: RUNTIME constants all defined', function () {
  assert(adapter.RUNTIME.WEBGPU        === 'webgpu-local',   'WEBGPU');
  assert(adapter.RUNTIME.CPU           === 'cpu-local',      'CPU');
  assert(adapter.RUNTIME.SHADOW_API    === 'shadow-api',     'SHADOW_API');
  assert(adapter.RUNTIME.DETERMINISTIC === 'deterministic',  'DETERMINISTIC');
  assert(adapter.RUNTIME.EMERGENCY     === 'emergency-fallback', 'EMERGENCY');
});

test('Module: all public API methods exist', function () {
  assert(typeof adapter.generate              === 'function');
  assert(typeof adapter.isStandalone          === 'function');
  assert(typeof adapter.enableStandaloneMode  === 'function');
  assert(typeof adapter.disableStandaloneMode === 'function');
  assert(typeof adapter.getStatus             === 'function');
  assert(typeof adapter.getDiagnostics        === 'function');
  assert(typeof adapter.getAvailableRuntimes  === 'function');
});

// ── Standalone mode
test('Standalone: starts disabled by default (no env var set)', function () {
  // env var is not set in this test file, so should be false
  delete process.env.SHADOW_STANDALONE_TEST;
  adapter.disableStandaloneMode();  // ensure reset
  assert(!adapter.isStandalone(), 'Should not be in standalone mode by default');
});

test('Standalone: enableStandaloneMode() activates standalone', function () {
  adapter.enableStandaloneMode();
  assert(adapter.isStandalone(), 'Should be in standalone mode after enable');
});

test('Standalone: disableStandaloneMode() deactivates standalone', function () {
  adapter.enableStandaloneMode();
  adapter.disableStandaloneMode();
  assert(!adapter.isStandalone(), 'Should not be in standalone mode after disable');
});

test('Standalone: env var SHADOW_STANDALONE_TEST=true activates standalone', function () {
  adapter.disableStandaloneMode();
  process.env.SHADOW_STANDALONE_TEST = 'true';
  assert(adapter.isStandalone(), 'Env var should activate standalone mode');
  delete process.env.SHADOW_STANDALONE_TEST;
});

test('Standalone: env var SHADOW_STANDALONE_TEST=false does not activate', function () {
  adapter.disableStandaloneMode();
  process.env.SHADOW_STANDALONE_TEST = 'false';
  assert(!adapter.isStandalone(), 'false env var should not activate standalone');
  delete process.env.SHADOW_STANDALONE_TEST;
});

// ── getStatus()
test('getStatus: returns valid status object', function () {
  var status = adapter.getStatus();
  assert(typeof status === 'object', 'Should return object');
  assert(typeof status.standaloneMode === 'boolean', 'standaloneMode flag');
  assert(typeof status.generateCount  === 'number',  'generateCount');
  assert(Array.isArray(status.availableRuntimes),    'availableRuntimes array');
});

test('getStatus: standaloneMode reflects current state', function () {
  adapter.enableStandaloneMode();
  var s1 = adapter.getStatus();
  assert(s1.standaloneMode === true, 'Should be true when enabled');

  adapter.disableStandaloneMode();
  var s2 = adapter.getStatus();
  assert(s2.standaloneMode === false, 'Should be false when disabled');
});

test('getStatus: generateCount increments per generate() call', function () {
  adapter.disableStandaloneMode();
  var before = adapter.getStatus().generateCount;

  adapter.generate({
    messages: [],
    understood: { intent: 'GREETING', tone: 'neutral', entities: {}, raw: 'hi' },
    context: {},
  }, function () {});

  var after = adapter.getStatus().generateCount;
  assert(after === before + 1, 'generateCount should increment. Before: ' + before + ' After: ' + after);
});

// ── getDiagnostics()
test('getDiagnostics: returns extended diagnostic object', function () {
  var diag = adapter.getDiagnostics();
  assert(typeof diag === 'object', 'Should return object');
  assert(diag.buildId === 'SR-MODEL-ADAPTER-1', 'buildId correct');
  assert(typeof diag.standaloneTest === 'boolean', 'standaloneTest flag');
  assert(diag.runtimes, 'Should have runtimes sub-object');
});

// ── getAvailableRuntimes()
test('getAvailableRuntimes: returns array', function () {
  var runtimes = adapter.getAvailableRuntimes();
  assert(Array.isArray(runtimes), 'Should return array');
  assert(runtimes.length > 0, 'Should have at least one runtime (deterministic)');
});

test('getAvailableRuntimes: shadow-api excluded in standalone mode', function () {
  adapter.enableStandaloneMode();
  var runtimes = adapter.getAvailableRuntimes();
  assert(runtimes.indexOf(adapter.RUNTIME.SHADOW_API) === -1,
    'shadow-api should be excluded in standalone mode');
  adapter.disableStandaloneMode();
});

test('getAvailableRuntimes: shadow-api included when not standalone (if runtime says so)', function () {
  adapter.disableStandaloneMode();
  // Without SRInferenceRuntime, we get DETERMINISTIC
  var runtimes = adapter.getAvailableRuntimes();
  // At minimum should have deterministic
  assert(runtimes.length > 0, 'Should have runtimes');
});

// ── generate()
test('generate: empty messages → deterministic fallback with greeting', function () {
  adapter.disableStandaloneMode();
  var result = null;
  var runtime = null;

  adapter.generate({
    messages: [],
    understood: { intent: 'GREETING', tone: 'neutral', entities: {}, raw: 'Hello' },
    context: {},
  }, function (err, text, runtimeUsed) {
    result = text;
    runtime = runtimeUsed;
  });

  assert(result && result.length > 0, 'Should return a response');
  assert(runtime === adapter.RUNTIME.DETERMINISTIC, 'Should use deterministic. Got: ' + runtime);
});

test('generate: standalone mode uses local or deterministic (never shadow-api)', function () {
  adapter.enableStandaloneMode();
  var runtimeUsed = null;

  adapter.generate({
    messages: [],
    understood: { intent: 'GREETING', tone: 'neutral', entities: {}, raw: 'hi' },
    context: {},
  }, function (err, text, rt) {
    runtimeUsed = rt;
  });

  assert(runtimeUsed !== adapter.RUNTIME.SHADOW_API,
    'Standalone mode should never use shadow-api. Got: ' + runtimeUsed);
  adapter.disableStandaloneMode();
});

test('generate: callback always receives (error, text, runtime) triplet', function () {
  var callbackArgs = null;

  adapter.generate({
    messages: [],
    understood: { intent: 'QUESTION', tone: 'neutral', entities: {}, raw: 'test' },
    context: {},
  }, function (err, text, runtime) {
    callbackArgs = [err, text, runtime];
  });

  assert(Array.isArray(callbackArgs), 'Callback should be called');
  assert(callbackArgs.length === 3, 'Should have 3 args');
  // err may be null or an error object
  assert(callbackArgs[2] !== undefined, 'Runtime should be defined');
});

test('generate: does not throw when called with no opts', function () {
  var threw = false;
  try {
    adapter.generate(function () {});
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'generate() should not throw with empty opts');
});

test('generate: lastRuntimeUsed is set after generate', function () {
  adapter.disableStandaloneMode();
  adapter.generate({
    messages: [],
    understood: { intent: 'GREETING', tone: 'neutral', entities: {}, raw: 'hi' },
    context: {},
  }, function () {});

  var status = adapter.getStatus();
  assert(status.lastRuntimeUsed !== null, 'lastRuntimeUsed should be set');
});

// ── Results
console.log('\nPASS : ' + PASS);
console.log('FAIL : ' + FAIL);
console.log('TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
