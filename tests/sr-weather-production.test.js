/**
 * shadow-reaper-v2/tests/sr-weather-production.test.js
 * Shadow Reaper — Weather Production Path Tests
 *
 * Build: SR-WEATHER-PROD-TEST-1
 *
 * Verifies:
 *   1. Production PWA uses Shadow API weather route (SRCloudAPI.weather.query)
 *   2. No direct provider fetch required from PWA in production
 *   3. Austin, TX request
 *   4. Chicago, IL request
 *   5. Backend failure → truthful message, no hallucination
 *   6. Missing location handled
 *   7. No fake API-key message
 *   8. No hallucinated live weather
 *   9. SRWeather fallback used only when SRCloudAPI not available
 *  10. weather_unavailable reason when both sources down
 *
 * Run: node tests/sr-weather-production.test.js
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

// ── Mocks ─────────────────────────────────────────────────────────────────────

var _cloudApiConfigured = true;
var _cloudOnline        = true;
var _cloudWeatherResult = null;    // null = default success
var _cloudWeatherCalls  = [];      // captured calls
var _srWeatherCalls     = [];      // captured fallback calls

global.SRNumberIntelligence = {
  detectCalculation: function () { return { isCalc: false }; },
  calculate: function () { return { ok: false }; },
};

global.SRSecurity = {
  containsSensitiveData: function (text) {
    return /my\s+password\s+is|api[\s_-]*key[\s:=]/i.test(text);
  },
};

global.SRWebResearch = {
  isReady: function () { return false; },
  needsResearch: function () { return false; },
};

// Cloud API mock — production path
global.SRCloudAPI = {
  build: 'SR-CLOUD-API-1',
  isConfigured: function () { return _cloudApiConfigured; },
  isOnline:     function () { return _cloudOnline; },
  weather: {
    query: function (opts, cb) {
      _cloudWeatherCalls.push(opts);
      if (_cloudWeatherResult !== null) {
        cb(_cloudWeatherResult);
        return;
      }
      // Default: success
      var loc = (opts && opts.location) || 'Unknown';
      cb({
        ok: true,
        weather: {
          location:    loc,
          condition:   'Partly cloudy',
          temperature: 74,
          feelsLike:   71,
          humidity:    58,
          wind:        { speed: 10, direction: 'S' },
          formatted:   'Weather for ' + loc + ':\nPartly cloudy, 74°F (feels like 71°F)\nHumidity: 58%  |  Wind: 10 mph S\nToday: High 80°F, Low 62°F',
          retrievedAt: new Date().toISOString(),
          source:      'Open-Meteo (open-meteo.com)',
          trusted:     true,
        },
      });
    },
  },
  research: {
    electronics: function (query, cb) {
      cb({ ok: false, error: { code: 'NOT_NEEDED', message: 'Not used in weather test.' } });
    },
  },
};

// SRWeather — direct fetch fallback (should NOT be used in production)
global.SRWeather = {
  isReady: function () { return true; },
  query: function (text, cb) {
    _srWeatherCalls.push(text);
    cb({ ok: true, location: 'Fallback City', formatted: 'Fallback weather data', reason: 'weather_retrieved' });
  },
  _extractLocation: function (text) {
    var m = text.match(/\b(?:weather\s+in|in|for|at)\s+([A-Za-z][A-Za-z\s,\.]{1,40}?)(?:\s*[\?\.,!]|$)/i);
    return m ? m[1].trim() : null;
  },
  clearCache: function () {},
};

// Load research router
function load(relPath) {
  var code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('global', 'require', code)(global, require);
}
load('research/sr-research-router.js');

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

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(s, sub) {
  if (String(s).indexOf(sub) === -1)
    throw new Error('Expected to contain "' + sub + '" in: ' + String(s).slice(0, 120));
}
function assertNotContains(s, sub) {
  if (String(s).indexOf(sub) !== -1)
    throw new Error('Expected NOT to contain "' + sub + '" in: ' + String(s).slice(0, 120));
}

function reset() {
  _cloudApiConfigured  = true;
  _cloudOnline         = true;
  _cloudWeatherResult  = null;
  _cloudWeatherCalls   = [];
  _srWeatherCalls      = [];
  global.navigator.onLine = true;
}

// ── SECTION 1: Production path uses Shadow API ────────────────────────────────

console.log('\n── SECTION 1: Production path uses Shadow API (SRCloudAPI.weather) ──');

test('PROD-01: WEATHER dispatch calls SRCloudAPI.weather.query (not SRWeather.query)', function () {
  reset();
  var dispatched = false;
  global.SRResearchRouter.dispatch("What's the weather in Austin?", null, function (result) {
    dispatched = true;
    assert(result.route === 'WEATHER', 'route must be WEATHER, got: ' + result.route);
    assert(result.ok === true, 'must succeed via cloud path');
    assert(_cloudWeatherCalls.length >= 1, 'SRCloudAPI.weather.query must have been called');
    assert(_srWeatherCalls.length === 0, 'SRWeather.query must NOT be called in production');
  });
  assert(dispatched, 'callback must be called');
});

test('PROD-02: Production weather result has formatted text', function () {
  reset();
  global.SRResearchRouter.dispatch("What's the weather in Austin?", null, function (result) {
    assert(result.ok === true, 'must succeed');
    assert(result.data && result.data.formatted, 'must have formatted weather text');
    assert(typeof result.data.formatted === 'string', 'formatted must be string');
  });
});

test('PROD-03: Production weather is trusted', function () {
  reset();
  global.SRResearchRouter.dispatch("What's the weather in Austin?", null, function (result) {
    assert(result.trusted === true, 'weather data must be trusted');
  });
});

// ── SECTION 2: City requests ───────────────────────────────────────────────────

console.log('\n── SECTION 2: City requests ─────────────────────────────────────────');

test('PROD-04: Austin, TX request — SRCloudAPI called with location', function () {
  reset();
  global.SRResearchRouter.dispatch("What's the weather in Austin, TX?", null, function (result) {
    assert(result.ok === true, 'Austin request must succeed');
    assert(_cloudWeatherCalls.length >= 1, 'cloud API must be called');
    assert(result.data && result.data.formatted, 'must have formatted data');
  });
});

test('PROD-05: Chicago, IL request — SRCloudAPI called with location', function () {
  reset();
  global.SRResearchRouter.dispatch("What is the weather in Chicago?", null, function (result) {
    assert(result.ok === true, 'Chicago request must succeed');
    assert(_cloudWeatherCalls.length >= 1, 'cloud API must be called');
    assert(result.data && result.data.formatted, 'must have formatted data');
  });
});

// ── SECTION 3: Backend failure handling ──────────────────────────────────────

console.log('\n── SECTION 3: Backend failure handling ──────────────────────────────');

test('PROD-06: Backend failure → result ok:false with reason', function () {
  reset();
  _cloudWeatherResult = {
    ok: false,
    error: { code: 'SERVICE_UNAVAILABLE', message: 'Weather data unavailable.' },
    requestId: 'test-fail',
  };
  global.SRResearchRouter.dispatch("What's the weather in Austin?", null, function (result) {
    assert(result.route === 'WEATHER', 'route must be WEATHER');
    assert(result.ok === false, 'must return ok:false on backend failure');
    // reason should be the error code, not a fake message
    assert(result.reason && result.reason !== '', 'reason must be non-empty');
    assert(_srWeatherCalls.length === 0, 'fallback SRWeather must not be called when cloud fails with error');
  });
});

test('PROD-07: Location not found → result ok:false', function () {
  reset();
  _cloudWeatherResult = {
    ok: false,
    error: { code: 'LOCATION_NOT_FOUND', message: 'Location not found.' },
    requestId: 'test-loc',
  };
  global.SRResearchRouter.dispatch("What's the weather in Xyzzy99999?", null, function (result) {
    assert(result.route === 'WEATHER', 'route must be WEATHER');
    assert(result.ok === false, 'unknown location must return ok:false');
  });
});

test('PROD-08: No API key required message in weather code', function () {
  var src = fs.readFileSync(path.join(ROOT, 'research/sr-research-router.js'), 'utf8');
  // The router must not tell the user they need an API key
  assertNotContains(src, 'needs a weather api');
  assertNotContains(src, 'api key required');
  assertNotContains(src, 'weather api key');
});

test('PROD-09: No "live weather is impossible" message in pipeline', function () {
  var src = fs.readFileSync(path.join(ROOT, 'shadow-reaper.js'), 'utf8');
  assertNotContains(src.toLowerCase(), 'live weather is impossible');
  assertNotContains(src.toLowerCase(), 'cannot provide live weather');
  assertNotContains(src.toLowerCase(), 'need a weather api');
  assertNotContains(src.toLowerCase(), 'weather api key');
});

test('PROD-10: Weather failure message is truthful (no fabrication)', function () {
  // Verify the shadow-reaper.js pipeline uses a truthful message on failure
  var src = fs.readFileSync(path.join(ROOT, 'shadow-reaper.js'), 'utf8');
  // The pipeline has "I can't reach live weather data right now"
  assert(
    src.indexOf("can't reach live weather") !== -1 ||
    src.indexOf("temporarily unavailable") !== -1 ||
    src.indexOf("weather data right now") !== -1,
    'Pipeline must have a truthful weather-unavailable message'
  );
});

// ── SECTION 4: SRWeather fallback (offline / unconfigured) ────────────────────

console.log('\n── SECTION 4: SRWeather fallback ────────────────────────────────────');

test('PROD-11: SRWeather used as fallback when SRCloudAPI not configured', function () {
  reset();
  _cloudApiConfigured = false;
  global.SRResearchRouter.dispatch("What's the weather in Austin?", null, function (result) {
    assert(result.route === 'WEATHER', 'route must be WEATHER');
    // With cloud unconfigured, must fall back to SRWeather
    assert(_srWeatherCalls.length >= 1, 'SRWeather must be called as fallback');
    assert(result.ok === true, 'fallback must succeed when SRWeather works');
  });
});

test('PROD-12: weather_unavailable when both sources down', function () {
  reset();
  _cloudApiConfigured = false;
  var origWeather = global.SRWeather;
  global.SRWeather = null;
  global.SRResearchRouter.dispatch("What's the weather in Austin?", null, function (result) {
    assert(result.route === 'WEATHER', 'route must be WEATHER');
    assert(result.ok === false, 'must fail when both sources unavailable');
  });
  global.SRWeather = origWeather;
});

// ── SECTION 5: No direct provider fetch in production ────────────────────────

console.log('\n── SECTION 5: No direct provider fetch in production ────────────────');

test('PROD-13: SRWeather.query is NOT called in production (cloud path)', function () {
  reset();
  var srWeatherQueryCalled = false;
  var origQuery = global.SRWeather.query;
  global.SRWeather.query = function (text, cb) {
    srWeatherQueryCalled = true;
    origQuery.call(this, text, cb);
  };
  global.SRResearchRouter.dispatch("What's the weather in Austin?", null, function () {});
  global.SRWeather.query = origQuery;
  assert(!srWeatherQueryCalled,
    'SRWeather.query (direct Open-Meteo fetch) must NOT be called when SRCloudAPI is available');
});

test('PROD-14: Production weather goes through correct endpoint path', function () {
  // Verify the cloud-api client routes to /api/v1/weather
  var src = fs.readFileSync(path.join(ROOT, 'sr-cloud-api.js'), 'utf8');
  assertContains(src, '/api/v1/weather');
  assertContains(src, 'SRCloudAPI');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log('  SR Weather Production Path Tests');
console.log('  SR-WEATHER-PROD-TEST-1');
console.log('══════════════════════════════════════════════');
results.forEach(function (r) { console.log(r); });
console.log('══════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
console.log('══════════════════════════════════════════════\n');
process.exit(FAIL > 0 ? 1 : 0);
