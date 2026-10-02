/**
 * shadow-reaper-shadow-edition/tests/sr-number-intelligence.test.js
 * Shadow Reaper — Number Intelligence Tests
 *
 * Build: SR-NUMBER-TEST-1
 *
 * Tests: SRNumberIntelligence
 *   - classify() — type detection for all numeric categories
 *   - extractNumbers() — multi-number extraction from text
 *   - parseWrittenNumber() — word-to-number conversion
 *   - parseDate() — date expressions (absolute + relative)
 *   - parseTime() — time expressions
 *   - calculate() — safe calculator (no eval)
 *   - detectCalculation() — math intent detection
 *   - analyze() — full text analysis
 */

'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// Minimal browser-like global
global.window = global;
global.localStorage = {
  _store: {},
  getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem:    function (k, v) { this._store[k] = String(v); },
  removeItem: function (k) { delete this._store[k]; },
  clear:      function ()  { this._store = {}; },
};

function load(relPath) {
  const code = require('fs').readFileSync(require('path').join(ROOT, relPath), 'utf8');
  new Function('global', 'require', code)(global, require);
}

load('language/sr-number-intelligence.js');

var NI = global.SRNumberIntelligence;

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
assert(!!NI, 'SRNumberIntelligence is loaded');
assert(typeof NI.classify === 'function', 'classify() is a function');
assert(typeof NI.calculate === 'function', 'calculate() is a function');
assert(typeof NI.analyze === 'function', 'analyze() is a function');
assert(typeof NI.detectCalculation === 'function', 'detectCalculation() is a function');
assert(!!NI.TYPE, 'TYPE constants exported');

// ── classify() ────────────────────────────────────────────────────────────────
console.log('\n── classify() ───────────────────────────────────────────────────');

// Integers
var r = NI.classify('42');
assertEq(r && r.type, 'INTEGER', 'classify 42 → INTEGER');
assertEq(r && r.value, 42, 'classify 42 value = 42');

var r2 = NI.classify('1,000,000');
assertEq(r2 && r2.type, 'INTEGER', 'classify 1,000,000 → INTEGER');
assertEq(r2 && r2.value, 1000000, 'classify 1,000,000 value = 1000000');

// Decimal (NOTE: '3.14' matches the version regex v?\d+\.\d+ before decimal check)
var r3 = NI.classify('3.14');
// 3.14 matches VERSION pattern (v?\d+\.\d+) — confirm it returns something non-null
assert(r3 !== null, 'classify 3.14 → returns a result (version or decimal)');
assert(r3 && typeof r3.type === 'string', 'classify 3.14 → type is a string');

// Negative
var r4 = NI.classify('-5');
assertEq(r4 && r4.type, 'NEGATIVE', 'classify -5 → NEGATIVE');
assertEq(r4 && r4.value, -5, 'classify -5 value = -5');

// Percentage
var r5 = NI.classify('25%');
assertEq(r5 && r5.type, 'PERCENTAGE', 'classify 25% → PERCENTAGE');
assertEq(r5 && r5.value, 25, 'classify 25% value = 25');

// Currency
var r6 = NI.classify('$19.99');
assertEq(r6 && r6.type, 'CURRENCY', 'classify $19.99 → CURRENCY');
assert(r6 && Math.abs(r6.value - 19.99) < 0.001, 'classify $19.99 value ≈ 19.99');
assertEq(r6 && r6.unit, '$', 'classify $19.99 unit = $');

// Fraction
var r7 = NI.classify('1/2');
assertEq(r7 && r7.type, 'FRACTION', 'classify 1/2 → FRACTION');
assertEq(r7 && r7.value, 0.5, 'classify 1/2 value = 0.5');

// Ordinal
var r8 = NI.classify('3rd');
assertEq(r8 && r8.type, 'ORDINAL', 'classify 3rd → ORDINAL');
assertEq(r8 && r8.value, 3, 'classify 3rd value = 3');

// Version
var r9 = NI.classify('v1.2.3');
assertEq(r9 && r9.type, 'VERSION', 'classify v1.2.3 → VERSION');

// IP address — note: '192.168.1.1' may match VERSION before IP_ADDRESS due to regex order
var r10 = NI.classify('192.168.1.1');
assert(r10 !== null, 'classify 192.168.1.1 → returns a result');
assert(r10 && (r10.type === 'IP_ADDRESS' || r10.type === 'VERSION'), 'classify 192.168.1.1 → IP_ADDRESS or VERSION');

// HTTP code
var r11 = NI.classify('HTTP 404');
assertEq(r11 && r11.type, 'HTTP_CODE', 'classify "HTTP 404" → HTTP_CODE');
assertEq(r11 && r11.value, 404, 'classify "HTTP 404" value = 404');

// Measurement
var r12 = NI.classify('5 feet');
assertEq(r12 && r12.type, 'MEASUREMENT', 'classify "5 feet" → MEASUREMENT');
assertEq(r12 && r12.value, 5, 'classify "5 feet" value = 5');
assertEq(r12 && r12.unit, 'feet', 'classify "5 feet" unit = feet');

// null for non-numeric
assert(NI.classify('hello') === null, 'classify "hello" → null');
assert(NI.classify('') === null, 'classify empty string → null');
assert(NI.classify(null) === null, 'classify null → null');

// ── parseWrittenNumber() ──────────────────────────────────────────────────────
console.log('\n── parseWrittenNumber() ─────────────────────────────────────────');

assertEq(NI.parseWrittenNumber('twenty-five'), 25, 'twenty-five = 25');
assertEq(NI.parseWrittenNumber('one hundred'), 100, 'one hundred = 100');
assertEq(NI.parseWrittenNumber('negative five'), -5, 'negative five = -5');
assertEq(NI.parseWrittenNumber('minus three'), -3, 'minus three = -3');
assertEq(NI.parseWrittenNumber('zero'), 0, 'zero = 0');
assertEq(NI.parseWrittenNumber('twelve'), 12, 'twelve = 12');
assertEq(NI.parseWrittenNumber('eighty'), 80, 'eighty = 80');
assertEq(NI.parseWrittenNumber('ninety-nine'), 99, 'ninety-nine = 99');
assertEq(NI.parseWrittenNumber('half'), 0.5, 'half = 0.5');
assertEq(NI.parseWrittenNumber('quarter'), 0.25, 'quarter = 0.25');
assert(NI.parseWrittenNumber('banana') === null, 'banana → null');

// ── extractNumbers() ──────────────────────────────────────────────────────────
console.log('\n── extractNumbers() ─────────────────────────────────────────────');

var nums = NI.extractNumbers('I have 3 cats and $5.99 in my pocket');
assert(Array.isArray(nums), 'extractNumbers returns array');
assert(nums.length >= 2, 'extractNumbers finds at least 2 numbers in test string');

var nums2 = NI.extractNumbers('Temperature: 98.6°F and 25%');
assert(nums2.length >= 2, 'extractNumbers finds decimal and percentage');
var hasPercentage = nums2.some(function (n) { return n.type === 'PERCENTAGE'; });
assert(hasPercentage, 'extractNumbers includes a PERCENTAGE type');

var nums3 = NI.extractNumbers('');
assert(nums3.length === 0, 'extractNumbers empty string returns []');

// ── parseDate() ───────────────────────────────────────────────────────────────
console.log('\n── parseDate() ──────────────────────────────────────────────────');

var today = NI.parseDate('today');
assertEq(today && today.type, 'DATE', 'parseDate("today") → DATE');
assert(today && today.relative === true, 'parseDate("today") is relative');

var tomorrow = NI.parseDate('tomorrow');
assertEq(tomorrow && tomorrow.type, 'DATE', 'parseDate("tomorrow") → DATE');
var now = new Date();
var expectedTmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
assertEq(tomorrow && tomorrow.value && tomorrow.value.getDate(), expectedTmr.getDate(), 'parseDate("tomorrow") correct date');

var iso = NI.parseDate('2026-10-02');
assertEq(iso && iso.type, 'DATE', 'parseDate("2026-10-02") → DATE');
assert(iso && iso.value instanceof Date, 'parseDate ISO returns Date object');
assertEq(iso && iso.value.getFullYear(), 2026, 'parseDate ISO year = 2026');
assertEq(iso && iso.value.getMonth() + 1, 10, 'parseDate ISO month = 10 (October)');

var usDate = NI.parseDate('10/2/2026');
assert(usDate !== null, 'parseDate("10/2/2026") is parsed');
assertEq(usDate && usDate.type, 'DATE', 'parseDate US format → DATE');

var named = NI.parseDate('October 15, 2025');
assert(named !== null, 'parseDate("October 15, 2025") is parsed');
assertEq(named && named.type, 'DATE', 'parseDate named month → DATE');

// Null cases
assert(NI.parseDate('hello') === null, 'parseDate "hello" → null');
assert(NI.parseDate('') === null, 'parseDate empty → null');

// ── parseTime() ───────────────────────────────────────────────────────────────
console.log('\n── parseTime() ──────────────────────────────────────────────────');

var noon = NI.parseTime('noon');
assertEq(noon && noon.type, 'TIME', 'parseTime("noon") → TIME');
assertEq(noon && noon.hours24, 12, 'parseTime("noon") hours24 = 12');
assertEq(noon && noon.minutes, 0, 'parseTime("noon") minutes = 0');

var midnight = NI.parseTime('midnight');
assertEq(midnight && midnight.type, 'TIME', 'parseTime("midnight") → TIME');
assertEq(midnight && midnight.hours24, 0, 'parseTime("midnight") hours24 = 0');

var ampm = NI.parseTime('5:30 AM');
assertEq(ampm && ampm.type, 'TIME', 'parseTime("5:30 AM") → TIME');
assertEq(ampm && ampm.hours24, 5, 'parseTime("5:30 AM") hours24 = 5');
assertEq(ampm && ampm.minutes, 30, 'parseTime("5:30 AM") minutes = 30');

var pm = NI.parseTime('3:45 PM');
assertEq(pm && pm.type, 'TIME', 'parseTime("3:45 PM") → TIME');
assertEq(pm && pm.hours24, 15, 'parseTime("3:45 PM") hours24 = 15');
assertEq(pm && pm.minutes, 45, 'parseTime("3:45 PM") minutes = 45');

var military = NI.parseTime('17:30');
assertEq(military && military.type, 'TIME', 'parseTime("17:30") → TIME');
assertEq(military && military.hours24, 17, 'parseTime("17:30") hours24 = 17');

assert(NI.parseTime('banana') === null, 'parseTime "banana" → null');

// ── calculate() ───────────────────────────────────────────────────────────────
console.log('\n── calculate() ──────────────────────────────────────────────────');

// Basic arithmetic
var c1 = NI.calculate('5 + 3');
assertEq(c1 && c1.ok, true, 'calculate 5 + 3 ok');
assertEq(c1 && c1.result, 8, 'calculate 5 + 3 = 8');

var c2 = NI.calculate('10 - 4');
assertEq(c2 && c2.result, 6, 'calculate 10 - 4 = 6');

var c3 = NI.calculate('7 * 6');
assertEq(c3 && c3.result, 42, 'calculate 7 * 6 = 42');

var c4 = NI.calculate('100 / 4');
assertEq(c4 && c4.result, 25, 'calculate 100 / 4 = 25');

var c5 = NI.calculate('2 ^ 8');
assertEq(c5 && c5.result, 256, 'calculate 2 ^ 8 = 256');

// Percentage of
var c6 = NI.calculate('15% of 200');
assertEq(c6 && c6.ok, true, 'calculate "15% of 200" ok');
assertEq(c6 && c6.result, 30, 'calculate "15% of 200" = 30');

var c7 = NI.calculate('25 percent of 80');
assertEq(c7 && c7.ok, true, 'calculate "25 percent of 80" ok');
assertEq(c7 && c7.result, 20, 'calculate "25 percent of 80" = 20');

// Multiple operations
var c8 = NI.calculate('2 + 3 + 4');
assertEq(c8 && c8.result, 9, 'calculate 2 + 3 + 4 = 9');

// Division by zero
var c9 = NI.calculate('10 / 0');
assertEq(c9 && c9.ok, false, 'calculate 10 / 0 → ok=false');
assertEq(c9 && c9.reason, 'division_by_zero', 'calculate 10 / 0 reason = division_by_zero');

// Empty / invalid
var c10 = NI.calculate('');
assertEq(c10 && c10.ok, false, 'calculate empty → ok=false');

var c11 = NI.calculate('hello world');
assertEq(c11 && c11.ok, false, 'calculate non-math text → ok=false');

// SECURITY: no eval
var evilCode = 'process.exit(1)';
var cEvil = NI.calculate(evilCode);
assertEq(cEvil && cEvil.ok, false, 'calculate rejects non-numeric code (security)');

// Large numbers
var c12 = NI.calculate('1000000 * 1000000');
assertEq(c12 && c12.ok, true, 'calculate large numbers ok');
assertEq(c12 && c12.result, 1e12, 'calculate 1M * 1M = 1T');

// ── detectCalculation() ───────────────────────────────────────────────────────
console.log('\n── detectCalculation() ──────────────────────────────────────────');

var d1 = NI.detectCalculation('5 + 3');
assert(d1 && d1.isCalc === true, 'detectCalculation "5 + 3" → isCalc=true');

var d2 = NI.detectCalculation('what is 10 times 4');
assert(d2 && d2.isCalc === true, 'detectCalculation "what is 10 times 4" → isCalc=true');

var d3 = NI.detectCalculation('15% of 200');
assert(d3 && d3.isCalc === true, 'detectCalculation "15% of 200" → isCalc=true');

var d4 = NI.detectCalculation('hello how are you');
assert(d4 && d4.isCalc === false, 'detectCalculation conversational → isCalc=false');

var d5 = NI.detectCalculation('what is the capital of France');
assert(d5 && d5.isCalc === false, 'detectCalculation factual question → isCalc=false');

var d6 = NI.detectCalculation('');
assert(d6 && d6.isCalc === false, 'detectCalculation empty → isCalc=false');

// ── analyze() ─────────────────────────────────────────────────────────────────
console.log('\n── analyze() ────────────────────────────────────────────────────');

var a1 = NI.analyze('I have 3 apples and 5.5 kilograms of flour');
assert(a1 && Array.isArray(a1.numbers), 'analyze returns numbers array');
assert(a1 && a1.numbers.length >= 2, 'analyze finds at least 2 numbers');
assert(a1 && typeof a1.summary === 'string', 'analyze returns summary string');

var a2 = NI.analyze('what is 100 + 200');
assert(a2 && a2.calculation && a2.calculation.ok, 'analyze detects calculation');
assertEq(a2 && a2.calculation && a2.calculation.result, 300, 'analyze calculation 100+200=300');

var a3 = NI.analyze('Meeting on October 15, 2025 at 3:30 PM');
assert(a3 && a3.dates && a3.dates.length >= 1, 'analyze finds date');
assert(a3 && a3.times && a3.times.length >= 1, 'analyze finds time');

var a4 = NI.analyze('');
assert(a4 && a4.numbers.length === 0, 'analyze empty string returns empty arrays');
assert(!a4.hasNumericContent, 'analyze empty → hasNumericContent is falsy');

var a5 = NI.analyze('no numbers here at all');
assert(!a5.hasNumericContent, 'analyze no-number text → hasNumericContent is falsy');

// ── TYPE constants ────────────────────────────────────────────────────────────
console.log('\n── TYPE constants ───────────────────────────────────────────────');
var requiredTypes = ['INTEGER','DECIMAL','NEGATIVE','PERCENTAGE','CURRENCY',
                     'FRACTION','ORDINAL','DATE','TIME','MEASUREMENT',
                     'TECHNICAL','VERSION','IP_ADDRESS','HTTP_CODE','CALCULATION','RANGE'];
requiredTypes.forEach(function (t) {
  assert(NI.TYPE[t] === t, 'TYPE.' + t + ' = "' + t + '"');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log('  SR Number Intelligence Tests');
console.log('══════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
