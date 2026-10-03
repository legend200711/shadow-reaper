/**
 * shadow-reaper-v2/tests/run-tests.js
 * Shadow Reaper V2 — Central Test Runner
 *
 * Build: SR-V2-TEST-RUNNER-1
 *
 * Usage:
 *   npm test
 *   node tests/run-tests.js
 *   node tests/run-tests.js --suite conversation-quality
 *   node tests/run-tests.js --suite stage2
 *
 * Runs all test suites (or a named subset) and prints a summary.
 * Exit code 0 = all suites passed, 1 = one or more failures.
 *
 * Each suite file is a standalone Node.js script that prints:
 *   PASS : N
 *   FAIL : N
 *   TOTAL: N
 * on the last few lines. This runner captures those counts.
 *
 * New suites can be added to SUITES below without touching this file.
 */

'use strict';

var path       = require('path');
var { spawnSync } = require('child_process');

// ─── Suite registry ───────────────────────────────────────────────────────────
// Add new test files here. Order = execution order.
var SUITES = [
  { name: 'stage1-core',           file: 'shadow-reaper-v2-stage1.test.js' },
  { name: 'stage2-platform',       file: 'stage2-platform.test.js' },
  { name: 'stage3-persistence',    file: 'stage3-persistence.test.js' },
  { name: 'stage4-founder',        file: 'stage4-founder-security.test.js' },
  { name: 'stage5-ui',             file: 'stage5-ui.test.js' },
  { name: 'stage6-global',         file: 'stage6-global-learning.test.js' },
  { name: 'stage7-research',       file: 'stage7-research.test.js' },
  { name: 'stage8-integration',    file: 'stage8-integration.test.js' },
  { name: 'stage9-security',       file: 'stage9-security-attack.test.js' },
  { name: 'adaptive-brain',        file: 'adaptive-brain.test.js' },
  { name: 'knowledge-learning',    file: 'knowledge-learning.test.js' },
  { name: 'language',              file: 'language.test.js' },
  { name: 'voice-assistant',       file: 'voice-assistant.test.js' },
  { name: 'wake-name',             file: 'wake-name-founder-enrollment.test.js' },
  { name: 'master',                file: 'master.test.js' },
  { name: 'conversation-quality',  file: 'conversation-quality.test.js' },
  { name: 'knowledge-retrieval',   file: 'sr-knowledge-retrieval.test.js' },
  { name: 'home-api',              file: 'sr-home-api.test.js' },
  { name: 'word-definition',       file: 'sr-word-definition.test.js' },
  { name: 'lexical-expansion',     file: 'sr-lexical-expansion.test.js' },
  { name: 'api-v1',                file: 'api-v1.test.js' },
  { name: 'product-split',         file: 'product-split.test.js' },
  { name: 'offline-intelligence',  file: 'offline-intelligence.test.js' },
  { name: 'sr-no-login',           file: 'sr-no-login.test.js' },
  { name: 'language-comprehension', file: 'language-comprehension.test.js' },
  { name: 'cloud-api',             file: 'cloud-api.test.js' },
  { name: 'cloud-live-verify',     file: 'cloud-live-verify.js' },
  { name: 'internet-router',       file: 'internet-router.test.js' },
  { name: 'inference-runtime',     file: 'inference-runtime.test.js' },
  { name: 'hosted-inference',      file: 'hosted-inference.test.js' },
  { name: 'pipeline-live',         file: 'pipeline-live-test.js' },
  { name: 'api-first',             file: 'api-first.test.js' },
  { name: 'personality-session',   file: 'personality-session.test.js' },
  { name: 'sns-launcher',          file: 'sns-launcher-tests.js' },
  { name: 'founder-shadow',        file: 'founder-shadow.test.js' },
  { name: 'conversation-regression', file: 'sr-conversation-regression.test.js' },
  { name: 'knowledge-hosted-connection', file: 'knowledge-hosted-connection.test.js' },
  // SR-CONN-REPAIR-1 targeted tests
  { name: 'weather-production',      file: 'sr-weather-production.test.js' },
  { name: 'electronics-auth',        file: 'sr-electronics-auth.test.js' },
  { name: 'creator-knowledge',       file: 'sr-creator-knowledge.test.js' },
  // SR-HF-VOICE-1 — Hands-free voice conversation tests
  { name: 'handsfree-voice',         file: 'sr-handsfree-voice.test.js' },
  // SR-V2-PERSONALITY-2 — Human-like adaptive personality Stage 1
  { name: 'personality-adaptive',    file: 'sr-personality-adaptive.test.js' },
  // SHADOW-HUMAN-1 — 7-stage human-like companion evolution
  { name: 'natural-conversation',    file: 'sr-natural-conversation.test.js' },
  { name: 'voice-personality',       file: 'sr-voice-personality.test.js' },
  { name: 'companion-integration',   file: 'sr-companion-integration.test.js' },
  // SR-STANDALONE-1 — 6-Stage Standalone Intelligence Migration
  { name: 'reasoning-core',          file: 'sr-reasoning-core.test.js' },
  { name: 'coding-foundation',       file: 'sr-coding-foundation.test.js' },
  { name: 'knowledge-expansion',     file: 'sr-knowledge-expansion.test.js' },
  { name: 'model-adapter',           file: 'sr-model-adapter.test.js' },
  { name: 'standalone-validation',   file: 'sr-standalone-validation.test.js' },
];

var TESTS_DIR = __dirname;

// ─── Parse CLI arguments ──────────────────────────────────────────────────────
var args = process.argv.slice(2);
var suiteFilter = null;
for (var i = 0; i < args.length; i++) {
  if (args[i] === '--suite' && args[i + 1]) {
    suiteFilter = args[i + 1];
    i++;
  }
}

var suitesToRun = suiteFilter
  ? SUITES.filter(function (s) { return s.name.indexOf(suiteFilter) !== -1; })
  : SUITES;

if (!suitesToRun.length) {
  console.error('No suites matched filter: ' + suiteFilter);
  process.exit(1);
}

// ─── Run suites ───────────────────────────────────────────────────────────────
var totalPass = 0;
var totalFail = 0;
var totalWarn = 0;
var suiteResults = [];

console.log('\n══════════════════════════════════════════════');
console.log('  SHADOW REAPER TEST RUNNER — SR-V2-TEST-RUNNER-1');
console.log('══════════════════════════════════════════════\n');

suitesToRun.forEach(function (suite) {
  var filePath = path.join(TESTS_DIR, suite.file);

  // Check file exists
  var fs = require('fs');
  if (!fs.existsSync(filePath)) {
    console.log('  SKIP  ' + suite.name + ' (' + suite.file + ' not found)');
    suiteResults.push({ name: suite.name, status: 'SKIP', pass: 0, fail: 0, warn: 0 });
    return;
  }

  console.log('  Running: ' + suite.name + ' (' + suite.file + ')');

  var result = spawnSync(process.execPath, [filePath], {
    cwd:     path.resolve(TESTS_DIR, '..'),
    timeout: 60000,   // 60s per suite
    encoding: 'utf8',
  });

  var stdout = (result.stdout || '') + (result.stderr || '');
  var lines  = stdout.split('\n');

  // Parse PASS / FAIL / WARN counts from last 10 lines
  var pass = 0; var fail = 0; var warn = 0;
  lines.slice(-15).forEach(function (line) {
    var pm = line.match(/PASS\s*:\s*(\d+)/);
    var fm = line.match(/FAIL\s*:\s*(\d+)/);
    var wm = line.match(/WARN\s*:\s*(\d+)/);
    if (pm) pass = parseInt(pm[1], 10);
    if (fm) fail = parseInt(fm[1], 10);
    if (wm) warn = parseInt(wm[1], 10);
  });

  // If the process crashed or timed out with no output
  if (result.status !== 0 && pass === 0 && fail === 0) {
    fail = 1; // count as 1 failure
    console.log('    ERROR: Process exited with code ' + result.status);
    if (result.error) console.log('    ' + result.error.message);
  }

  // Print stdout (trimmed) for visibility
  var printLines = lines.filter(function (l) { return l.trim().length > 0; });
  printLines.forEach(function (l) { console.log('    ' + l); });

  totalPass += pass;
  totalFail += fail;
  totalWarn += warn;

  var sStatus = fail > 0 ? 'FAIL' : 'PASS';
  suiteResults.push({ name: suite.name, status: sStatus, pass: pass, fail: fail, warn: warn });
  console.log('');
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════');
console.log('  SUITE RESULTS');
console.log('══════════════════════════════════════════════');
suiteResults.forEach(function (s) {
  var icon = s.status === 'PASS' ? '✓' : s.status === 'SKIP' ? '-' : '✗';
  console.log('  ' + icon + '  ' + s.name + ': ' + s.status +
              ' (pass=' + s.pass + ' fail=' + s.fail + ')');
});

console.log('');
console.log('══════════════════════════════════════════════');
console.log('  TOTAL ACROSS ALL SUITES');
console.log('══════════════════════════════════════════════');
console.log('  PASS : ' + totalPass);
console.log('  WARN : ' + totalWarn);
console.log('  FAIL : ' + totalFail);
console.log('  TOTAL: ' + (totalPass + totalFail + totalWarn));
console.log('══════════════════════════════════════════════\n');

process.exit(totalFail > 0 ? 1 : 0);
