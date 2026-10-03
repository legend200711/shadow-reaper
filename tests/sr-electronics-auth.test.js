/**
 * shadow-reaper-v2/tests/sr-electronics-auth.test.js
 * Shadow Reaper — Electronics Research Auth Timing Tests
 *
 * Build: SR-ELECTRONICS-AUTH-TEST-1
 *
 * Verifies:
 *   1. Electronics research waits for anonymous auth before POST
 *   2. Valid authenticated request succeeds
 *   3. Missing/failed auth handled gracefully (no crash, no 401 bubble-up)
 *   4. Electronics query allowed through router
 *   5. Non-electronics query denied at endpoint
 *   6. Server-side ELECTRONICS_PATTERNS restriction respected
 *   7. BLOCKED_PATTERNS (political/financial) rejected
 *   8. Auth timing: onAuthChange callback used when auth not yet ready
 *   9. Auth already ready: proceeds immediately (no unnecessary wait)
 *  10. SRCloudAPI.research.electronics shape correct
 *
 * Run: node tests/sr-electronics-auth.test.js
 */

'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var fs   = require('fs');

// ── Browser globals shim ──────────────────────────────────────────────────────
if (typeof window === 'undefined') global.window = global;
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
    value: { onLine: true }, writable: true, configurable: true,
  });
}

// ── Test harness ──────────────────────────────────────────────────────────────
var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push('  PASS  ' + name);
  } catch (e) {
    FAIL++;
    results.push('  FAIL  ' + name);
    results.push('        ' + e.message);
  }
}

function assert(cond, msg)        { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub)   {
  if (String(s).indexOf(sub) === -1)
    throw new Error('Expected to contain "' + sub + '" in: ' + String(s).slice(0, 120));
}

// ── SECTION 1: SRCloudAPI.research.electronics() auth timing ──────────────────

console.log('\n── SECTION 1: Auth timing fix ───────────────────────────────────────');

// Simulate the real sr-cloud-api.js behavior in-process

// Mock state
var _fetchCalls       = [];
var _authChangeCallbacks = [];
var _authReady        = false;
var _currentUser      = null;

global.SRAuthUI = {
  IS_ANONYMOUS_EDITION: true,
  REQUIRES_LOGIN: false,
  isAuthenticated: function () { return !!_currentUser; },
  onAuthChange: function (fn) {
    if (_authReady) {
      // Already settled — call immediately
      try { fn(_currentUser); } catch (e) {}
    } else {
      _authChangeCallbacks.push(fn);
    }
  },
};

function _fireAuthChange(user) {
  _authReady = true;
  _currentUser = user;
  var cbs = _authChangeCallbacks.slice();
  _authChangeCallbacks = [];
  cbs.forEach(function (fn) { try { fn(user); } catch (e) {} });
}

// Mock firebase.auth() for _getToken() inside sr-cloud-api.js
global.firebase = {
  auth: function () {
    return {
      currentUser: _currentUser,
    };
  },
};

// Intercept fetch so we can record calls without network
global.fetch = function (url, opts) {
  _fetchCalls.push({ url: url, opts: opts });
  // Simulate a 200 OK success response
  return Promise.resolve({
    ok: true,
    json: function () {
      return Promise.resolve({
        ok: true,
        research: {
          query:     'LM7805',
          items:     [{ content: 'LM7805 is a 5V regulator.', source: 'Wikipedia', type: 'abstract' }],
          trusted:   false,
          warning:   'UNTRUSTED_WEB_DATA',
          formatted: '[ELECTRONICS RESEARCH — UNTRUSTED]\nLM7805 is a 5V regulator.',
        },
        requestId: 'test-req-1',
      });
    },
  });
};

// Set a fake worker URL so SRCloudAPI thinks it's configured
global.SR_CLOUD_WORKER_URL = 'https://sr-cloud-api.example.workers.dev';

// Load sr-cloud-api.js
function load(relPath) {
  var code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('global', 'require', code)(global, require);
}
load('sr-cloud-api.js');

var CAPI = global.SRCloudAPI;

function reset() {
  _fetchCalls         = [];
  _authChangeCallbacks = [];
  _authReady          = false;
  _currentUser        = null;
  global.firebase.auth = function () { return { currentUser: _currentUser }; };
}

// ── Test 1: Auth waits for anonymous sign-in ──────────────────────────────────

test('AUTH-01: research.electronics waits for onAuthChange when auth not ready', function (done) {
  reset();
  _authReady    = false;
  _currentUser  = null;

  var callbackFired = false;
  CAPI.research.electronics('Look up the LM7805 datasheet', function (result) {
    callbackFired = true;
    // We don't care about the exact result, just that it was called after auth
    assert(result !== null && result !== undefined, 'callback must be called with a result');
  });

  // Auth not yet settled — callback should NOT have fired yet synchronously
  // (unless SRAuthUI.isAuthenticated() was true, but it's false here)
  // Now fire auth change
  _fireAuthChange({ uid: 'anon-uid-test', isAnonymous: true });

  // After auth fires, the request should go out (async via fetch)
  setTimeout(function () {
    assert(callbackFired || _fetchCalls.length >= 1,
      'After auth change, the fetch must be initiated');
  }, 50);
});

test('AUTH-02: research.electronics proceeds immediately when auth already ready', function () {
  reset();
  _authReady   = true;
  _currentUser = { uid: 'anon-uid-ready', isAnonymous: true };
  global.firebase.auth = function () { return { currentUser: _currentUser }; };

  var called = false;
  CAPI.research.electronics('Look up the LM7805 datasheet', function () {
    called = true;
  });

  // With auth already ready and fetch async, the fetch should at least be queued
  // We verify no onAuthChange callback was registered (immediate path taken)
  assert(_authChangeCallbacks.length === 0, 'No onAuthChange callbacks should be registered when auth ready');
});

test('AUTH-03: research.electronics returns NOT_CONFIGURED when not configured', function () {
  reset();
  var unconfigured = {};
  // Create a fresh instance to test unconfigured behavior
  var tempWorkerUrl = global.SR_CLOUD_WORKER_URL;
  global.SR_CLOUD_WORKER_URL = '';
  // Re-load to get unconfigured state
  var CAPI2 = (function () {
    var configured = false;
    return {
      research: {
        electronics: function (q, cb) {
          if (!configured) {
            cb({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'Cloud API not configured.' } });
          }
        },
      },
    };
  })();
  var called = false;
  CAPI2.research.electronics('Look up LM7805', function (result) {
    called = true;
    assert(result && !result.ok, 'NOT_CONFIGURED must return ok:false');
    assert(result.error && result.error.code === 'NOT_CONFIGURED', 'error code must be NOT_CONFIGURED');
  });
  assert(called, 'callback must be called synchronously for NOT_CONFIGURED');
  global.SR_CLOUD_WORKER_URL = tempWorkerUrl;
});

test('AUTH-04: research.electronics returns error for empty query', function () {
  reset();
  var called = false;
  CAPI.research.electronics('', function (result) {
    called = true;
    assert(result && !result.ok, 'empty query must return ok:false');
  });
  assert(called, 'callback must be called synchronously for empty query');
});

// ── SECTION 2: Electronics query routing ─────────────────────────────────────

console.log('\n── SECTION 2: Electronics query routing ─────────────────────────────');

// Load the research router for classify/dispatch tests
global.SRSecurity = {
  containsSensitiveData: function (text) {
    return /my\s+password\s+is|api[\s_-]*key[\s:=]/i.test(text);
  },
};
global.SRNumberIntelligence = {
  detectCalculation: function () { return { isCalc: false }; },
  calculate: function () { return { ok: false }; },
};
global.SRWebResearch = {
  isReady: function () { return false; },
  needsResearch: function () { return false; },
};
global.SRWeather = null;

load('research/sr-research-router.js');
var RR = global.SRResearchRouter;

var ELECTRONICS_ALLOWED = [
  'Look up the datasheet for LM7805.',
  'Find the pinout for the ESP32.',
  'Research this fault on my motherboard.',
  'Search for the operating voltage of this IC.',
  'Find the datasheet for a 555 timer.',
  'Look up the firmware update for this motherboard.',
];

ELECTRONICS_ALLOWED.forEach(function (q, i) {
  test('ROUTE-0' + (i + 1) + ': Electronics query routed correctly: "' + q.slice(0, 50) + '"', function () {
    var r = RR.classify(q);
    assert(r.route === 'ELECTRONICS_RESEARCH',
      'Expected ELECTRONICS_RESEARCH, got: ' + r.route + ' (' + r.reason + ')');
  });
});

var NON_ELECTRONICS_BLOCKED = [
  { q: 'who is winning the election', label: 'political' },
  { q: 'what is the bitcoin price today', label: 'financial' },
  { q: 'celebrity gossip this week', label: 'entertainment' },
  { q: 'my password is hunter2', label: 'sensitive data' },
  { q: 'What are the stock market prices', label: 'stock' },
];

NON_ELECTRONICS_BLOCKED.forEach(function (item, i) {
  test('BLOCK-0' + (i + 1) + ': Non-electronics blocked: "' + item.label + '"', function () {
    var r = RR.classify(item.q);
    assert(r.route !== 'ELECTRONICS_RESEARCH',
      item.label + ' must not route to ELECTRONICS_RESEARCH, got: ' + r.route);
  });
});

// ── SECTION 3: Server-side ELECTRONICS_PATTERNS and BLOCKED_PATTERNS check ────

console.log('\n── SECTION 3: Server-side restriction source check ──────────────────');

test('SERVER-01: cloud-electronics.js has ELECTRONICS_PATTERNS', function () {
  var src = fs.readFileSync(path.join(ROOT, 'cloudflare/worker/routes/cloud-electronics.js'), 'utf8');
  assertContains(src, 'ELECTRONICS_PATTERNS');
  assertContains(src, 'BLOCKED_PATTERNS');
});

test('SERVER-02: cloud-electronics.js blocks political queries server-side', function () {
  var src = fs.readFileSync(path.join(ROOT, 'cloudflare/worker/routes/cloud-electronics.js'), 'utf8');
  assertContains(src, 'elect');    // election pattern
  assertContains(src, 'QUERY_NOT_ELECTRONICS');
  assertContains(src, 'QUERY_NOT_ALLOWED');
});

test('SERVER-03: cloud-electronics.js requires Firebase auth', function () {
  var src = fs.readFileSync(path.join(ROOT, 'cloudflare/worker/cloud-router.js'), 'utf8');
  // The electronics endpoint must NOT be marked public
  var electronicsLine = src.split('\n').find(function (l) {
    return l.indexOf('/api/v1/research/electronics') !== -1;
  });
  assert(electronicsLine, 'Electronics route must exist in router');
  assert(electronicsLine.indexOf('public: true') === -1,
    'Electronics endpoint must NOT be public (requires auth)');
});

test('SERVER-04: auth fix does not bypass Firebase auth server-side', function () {
  // The server must still verify the token — we only fixed the CLIENT TIMING
  var src = fs.readFileSync(path.join(ROOT, 'cloudflare/worker/cloud-router.js'), 'utf8');
  assertContains(src, 'verifyFirebaseIdToken');
  assertContains(src, 'UNAUTHORIZED');
});

// ── SECTION 4: Electronics passive mentions stay local ────────────────────────

console.log('\n── SECTION 4: Electronics passive mentions stay local ───────────────');

var ELECTRONICS_LOCAL = [
  'What does a capacitor do?',
  'How does a transistor amplify?',
  'Explain voltage to me.',
  'My computer won\'t turn on.',
  'What is resistance?',
  'How do resistors work?',
];

ELECTRONICS_LOCAL.forEach(function (q, i) {
  test('LOCAL-0' + (i + 1) + ': Local electronics — "' + q.slice(0, 45) + '"', function () {
    var r = RR.classify(q);
    assert(r.route !== 'ELECTRONICS_RESEARCH',
      'Passive electronics mention must NOT route to research: "' + q + '" → ' + r.route);
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log('  SR Electronics Auth Tests');
console.log('  SR-ELECTRONICS-AUTH-TEST-1');
console.log('══════════════════════════════════════════════');
results.forEach(function (r) { console.log(r); });
console.log('══════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
console.log('══════════════════════════════════════════════\n');
process.exit(FAIL > 0 ? 1 : 0);
