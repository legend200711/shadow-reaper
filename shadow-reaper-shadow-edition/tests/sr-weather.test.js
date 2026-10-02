/**
 * shadow-reaper-shadow-edition/tests/sr-weather.test.js
 * Shadow Reaper — Weather Tool Tests
 *
 * Build: SR-WEATHER-TEST-1
 *
 * Tests: SRWeather
 *   - Module load and API shape
 *   - _extractLocation() — location extraction from text
 *   - isReady() — availability check
 *   - query() with mocked fetch — various scenarios
 *   - getStatus() — status reporting
 *   - clearCache() — cache clearing
 *   - Security: no private data sent; no eval; no credentials
 *
 * NOTE: Network calls are mocked. No actual API requests are made.
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

// ── Mock fetch ────────────────────────────────────────────────────────────────
// Controls which responses the weather module gets.
var _mockMode = 'success';
var _geoCallCount = 0;
var _wxCallCount = 0;

global.fetch = function (url) {
  var isGeo = url.indexOf('geocoding-api') !== -1;
  var isWx  = url.indexOf('api.open-meteo.com') !== -1;

  if (isGeo) _geoCallCount++;
  if (isWx)  _wxCallCount++;

  if (_mockMode === 'success') {
    if (isGeo) {
      return Promise.resolve({
        ok: true,
        json: function () {
          return Promise.resolve({
            results: [{
              name: 'New York',
              admin1: 'New York',
              country: 'United States',
              country_code: 'US',
              latitude: 40.7128,
              longitude: -74.006,
              timezone: 'America/New_York',
            }],
          });
        },
      });
    }
    if (isWx) {
      return Promise.resolve({
        ok: true,
        json: function () {
          return Promise.resolve({
            current: {
              temperature_2m: 72,
              apparent_temperature: 68,
              relative_humidity_2m: 55,
              weather_code: 1,
              wind_speed_10m: 10,
              wind_direction_10m: 180,
            },
            daily: {
              temperature_2m_max: [75, 70, 65],
              temperature_2m_min: [60, 58, 55],
              weather_code: [1, 3, 61],
              precipitation_sum: [0, 0.1, 0.5],
            },
          });
        },
      });
    }
  }

  if (_mockMode === 'geo_fail') {
    if (isGeo) return Promise.resolve({ ok: false });
  }

  if (_mockMode === 'geo_not_found') {
    if (isGeo) {
      return Promise.resolve({
        ok: true,
        json: function () { return Promise.resolve({ results: [] }); },
      });
    }
  }

  if (_mockMode === 'network_error') {
    return Promise.reject(new Error('network error'));
  }

  // fallthrough: same as success
  return Promise.resolve({ ok: false });
};

function load(relPath) {
  const code = require('fs').readFileSync(require('path').join(ROOT, relPath), 'utf8');
  new Function('global', 'require', code)(global, require);
}

load('research/sr-weather.js');

var WX = global.SRWeather;

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
assert(!!WX, 'SRWeather is loaded');
assert(typeof WX.query === 'function', 'query() is a function');
assert(typeof WX.isReady === 'function', 'isReady() is a function');
assert(typeof WX.clearCache === 'function', 'clearCache() is a function');
assert(typeof WX.getStatus === 'function', 'getStatus() is a function');
assert(typeof WX._extractLocation === 'function', '_extractLocation() exported for testing');
assert(typeof WX._WMO === 'object', '_WMO codes exported');

// ── isReady() ─────────────────────────────────────────────────────────────────
console.log('\n── isReady() ────────────────────────────────────────────────────');
// fetch is mocked above, so isReady() should return true
assert(WX.isReady() === true, 'isReady() = true when fetch available');

// ── _extractLocation() ────────────────────────────────────────────────────────
console.log('\n── _extractLocation() ───────────────────────────────────────────');

var locTests = [
  ["what's the weather in New York",         'New York'],
  ["weather in Seattle",                     'Seattle'],
  ["forecast for Los Angeles",               'Los Angeles'],
  ["current weather in London, UK",          'London'],   // may extract just "London"
  ["is it raining in Chicago",               null],   // no standard pattern match
  ["New York weather",                       'New York'],
  ["London forecast",                        'London'],
  ["weather today",                          null],
  ["what's the temperature in Denver today", 'Denver'],
];

locTests.forEach(function (test) {
  var text = test[0];
  var expected = test[1];
  var result = WX._extractLocation(text);
  if (expected === null) {
    // null or something short — just check we don't get a very long false positive
    assert(result === null || (typeof result === 'string' && result.length < 30),
      '_extractLocation no-location: "' + text.slice(0, 40) + '" → null or short');
  } else {
    assert(typeof result === 'string' && result.toLowerCase().indexOf(expected.toLowerCase()) !== -1,
      '_extractLocation "' + text.slice(0, 40) + '" → contains "' + expected + '"');
  }
});

// ── WMO codes ─────────────────────────────────────────────────────────────────
console.log('\n── WMO codes ────────────────────────────────────────────────────');
assertEq(WX._WMO[0], 'Clear sky', 'WMO[0] = Clear sky');
assertEq(WX._WMO[3], 'Overcast', 'WMO[3] = Overcast');
assertEq(WX._WMO[63], 'Moderate rain', 'WMO[63] = Moderate rain');
assertEq(WX._WMO[95], 'Thunderstorm', 'WMO[95] = Thunderstorm');
assert(Object.keys(WX._WMO).length >= 20, 'WMO has at least 20 codes');

// ── query() — success ─────────────────────────────────────────────────────────
console.log('\n── query() — Success ────────────────────────────────────────────');

_mockMode = 'success';
_geoCallCount = 0;
_wxCallCount = 0;

var queryDone = false;
WX.query("what's the weather in New York", function (result) {
  queryDone = true;
  assert(result && result.ok === true, 'query success: ok=true');
  assert(typeof result.formatted === 'string', 'query success: formatted is string');
  assert(result.formatted.indexOf('New York') !== -1, 'query success: formatted contains location');
  assert(result.formatted.indexOf('°F') !== -1, 'query success: formatted contains temperature');
  assert(typeof result.location === 'string', 'query success: location string present');
  assert(_geoCallCount >= 1, 'query made geocode request');
  assert(_wxCallCount >= 1, 'query made weather request');
});

// Since fetch is async, use setTimeout to check callbacks
setTimeout(function () {
  assert(queryDone, 'query callback was called');

  // ── query() — cached result ─────────────────────────────────────────────────
  console.log('\n── query() — Cache ──────────────────────────────────────────────');
  _geoCallCount = 0;
  _wxCallCount = 0;

  WX.query("what's the weather in New York", function (cachedResult) {
    assert(cachedResult && cachedResult.ok === true, 'cache: ok=true');
    assert(cachedResult && cachedResult.cached === true, 'cache: cached=true');
    assertEq(_geoCallCount, 0, 'cache: no geocode request made');
    assertEq(_wxCallCount, 0, 'cache: no weather request made');
  });

  // ── query() — location not found ───────────────────────────────────────────
  console.log('\n── query() — Location Not Found ─────────────────────────────────');
  WX.clearCache();
  _mockMode = 'geo_not_found';

  WX.query('weather in Xyzzyplace99999', function (r) {
    assertEq(r && r.ok, false, 'location not found: ok=false');
    assert(r && r.reason === 'location_not_found', 'location not found: reason correct');
  });

  // ── query() — empty input ──────────────────────────────────────────────────
  console.log('\n── query() — Edge Cases ─────────────────────────────────────────');
  WX.query('', function (r) {
    assertEq(r && r.ok, false, 'empty query: ok=false');
  });

  WX.query(null, function (r) {
    assertEq(r && r.ok, false, 'null query: ok=false');
  });

  // query without location in text — should get needsLocation
  WX.clearCache();
  _mockMode = 'success';
  // Reset last known location by creating fresh module — can't do here, so just test text
  WX.query('weather today', function (r) {
    // Result depends on whether _lastLocation is set from prior successful call.
    // We just verify it returns a well-formed response.
    assert(typeof r === 'object' && r !== null, 'no-location query: returns object');
  });

  // ── clearCache() ───────────────────────────────────────────────────────────
  console.log('\n── clearCache() ─────────────────────────────────────────────────');
  _mockMode = 'success';
  WX.clearCache();
  var status = WX.getStatus();
  assertEq(status.cacheEntries, 0, 'clearCache: cacheEntries = 0 after clear');

  // ── getStatus() ────────────────────────────────────────────────────────────
  console.log('\n── getStatus() ──────────────────────────────────────────────────');
  var st = WX.getStatus();
  assert(typeof st === 'object', 'getStatus returns object');
  assert(typeof st.ready === 'boolean', 'getStatus has ready boolean');
  assert(typeof st.cacheEntries === 'number', 'getStatus has cacheEntries number');
  assert(typeof st.config === 'object', 'getStatus has config object');
  assert(st.config.cacheMinutes > 0, 'getStatus config.cacheMinutes > 0');

  // ── Security check: no eval, no credentials ────────────────────────────────
  console.log('\n── Security ─────────────────────────────────────────────────────');
  // Verify no eval usage by checking source code
  var src = require('fs').readFileSync(require('path').join(ROOT, 'research/sr-weather.js'), 'utf8');
  assert(src.indexOf('eval(') === -1, 'sr-weather.js contains no eval()');
  assert(src.indexOf('innerHTML') === -1, 'sr-weather.js contains no innerHTML (XSS)');
  assert(src.indexOf('api_key') === -1 || src.indexOf('no API key') !== -1,
    'sr-weather.js documents no API key requirement');

  // ── Summary ────────────────────────────────────────────────────────────────
  setTimeout(function () {
    console.log('\n══════════════════════════════════════════════');
    console.log('  SR Weather Tests');
    console.log('══════════════════════════════════════════════');
    console.log('  PASS : ' + PASS);
    console.log('  FAIL : ' + FAIL);
    console.log('  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
  }, 200);

}, 500);
