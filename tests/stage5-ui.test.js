/**
 * shadow-reaper-standalone/tests/stage5-ui.test.js
 * Shadow Reaper Standalone — Stage 5 UI / Cosmetic Tests
 *
 * CHECKPOINT 5: UI does not break conversation, persistence,
 *   mobile actions, permissions, or security.
 *
 * STATIC PASS = validated by code/HTML inspection.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push('  ✓  ' + name);
  } catch (e) {
    FAIL++;
    results.push('  ✗  ' + name + '\n        ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertContains(str, sub, msg) {
  if (str.indexOf(sub) === -1) throw new Error(msg || 'Expected to contain: ' + sub);
}

function assertNotContains(str, sub, msg) {
  if (str.indexOf(sub) !== -1) throw new Error(msg || 'Expected NOT to contain: ' + sub);
}

var src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── IDENTITY ──────────────────────────────────────────────────────────────

test('index.html exists and is non-empty', function () {
  assert(src.length > 1000, 'File must have substantial content');
});

test('Title is "Shadow Reaper" (not Shadow Nexus Social)', function () {
  assertContains(src, '<title>Shadow Reaper</title>');
  assertNotContains(src, 'Shadow Nexus Social', 'Must not reference SNS');
});

test('index.html references Shadow Reaper Standalone product', function () {
  // Accept either build ID (UI-1 original or UI-2 with product split update)
  assert(
    src.indexOf('SR-V2-STANDALONE-UI') !== -1,
    'Build ID must reference SR-V2-STANDALONE-UI'
  );
});

// ── VISUAL IDENTITY ────────────────────────────────────────────────────────

test('UI uses near-black / deep navy background', function () {
  assertContains(src, '#050811', 'Deep void background color must be present');
  assertContains(src, '#080c14', 'Deep background must be present');
});

test('UI uses electric blue energy palette', function () {
  assertContains(src, '#1e90ff', 'Electric blue must be present');
  assertContains(src, 'var(--electric)', 'Electric variable must be used');
});

test('UI has Grim Reaper identity (skull/scythe glyph)', function () {
  // &#9760; = ☠ (skull and crossbones)
  assert(src.indexOf('9760') !== -1, 'Skull/reaper glyph must be present');
});

test('UI does not use excessive flashing animations', function () {
  // No blink or flash animations
  assertNotContains(src, 'animation-name: blink', 'No blink animation');
  assertNotContains(src, '@keyframes flash', 'No flash keyframe');
  assertNotContains(src.toLowerCase(), 'blink', 'No blink references');
});

test('UI has accessible aria labels', function () {
  assertContains(src, 'aria-label', 'ARIA labels required');
  assertContains(src, 'aria-live', 'Live region required for conversation');
  assertContains(src, 'role="log"', 'Conversation must be role=log');
});

// ── RESPONSIVE DESIGN ─────────────────────────────────────────────────────

test('UI has mobile-first viewport meta', function () {
  assertContains(src, 'width=device-width', 'Must have viewport meta');
  assertContains(src, 'initial-scale=1', 'Must have initial-scale');
});

test('UI has desktop responsive breakpoint', function () {
  assertContains(src, 'min-width', 'Must have desktop breakpoint');
  assertContains(src, '900px', 'Must have desktop layout breakpoint');
});

test('UI uses mobile-first approach (max-width media queries for desktop only)', function () {
  assertContains(src, '@media (min-width', 'Must have min-width media queries (mobile-first)');
});


test('Device Control Mode section has been removed from UI', function () {
  assertNotContains(src, 'srDeviceSection', 'Device Control Mode section must NOT exist (removed)');
  assertNotContains(src, 'AI_ONLY', 'AI_ONLY mode must NOT exist in UI (removed)');
  assertNotContains(src, 'SMART_DEVICES', 'SMART_DEVICES mode must NOT exist in UI (removed)');
  assertNotContains(src, 'FULL_DEVICE_CONTROL', 'FULL_DEVICE_CONTROL mode must NOT exist in UI (removed)');
  assertNotContains(src, 'Download for Android', 'APK download button must NOT exist (removed)');
  assertNotContains(src, 'srAndroidDownloadSection', 'Android download section must NOT exist (removed)');
  // Internal capability infrastructure preserved
  assertContains(src, 'sr-device-controls', 'Internal capability container still preserved');
});

// ── XSS SAFETY ────────────────────────────────────────────────────────────

test('User messages use textContent, not innerHTML', function () {
  // Must use textContent for user data
  assertContains(src, 'body.textContent = text', 'User message text must use textContent');
  assertNotContains(src, 'innerHTML = text', 'Must not use innerHTML with user data');
  assertNotContains(src, 'innerHTML = msg', 'Must not use innerHTML with message');
});

test('Hint chip messages use getAttribute, not direct eval', function () {
  assertContains(src, 'getAttribute(\'data-msg\')', 'Must use getAttribute for hint chips');
  assertNotContains(src, 'eval(', 'Must not use eval()');
});

// ── FUNCTIONAL INTEGRITY ──────────────────────────────────────────────────

test('index.html loads all required JS modules (per ARCHITECTURE.md load order)', function () {
  assertContains(src, 'firebase-config.js',      'Must load firebase config');
  assertContains(src, 'security-policy.js',      'Must load security policy');
  assertContains(src, 'firebase-adapter.js',     'Must load Firebase adapter');
  assertContains(src, 'shadow-reaper.js',        'Must load main SR entry point');
  assertContains(src, 'adaptive-brain.js',       'Must load adaptive brain');
  assertContains(src, 'conversation-engine.js',  'Must load conversation engine');
  assertContains(src, 'response-engine.js',      'Must load response engine');
  assertContains(src, 'voice-engine.js',         'Must load voice engine');
  assertContains(src, 'translation-engine.js',   'Must load translation engine');
  // Shadow Edition-only scripts must NOT be present in regular edition
  assertNotContains(src, 'founder-controls.js',  'founder-controls.js is Shadow Edition only');
  assertNotContains(src, 'sr-founder-shadow.js', 'sr-founder-shadow.js is Shadow Edition only');
  assertNotContains(src, 'sr-wake-name.js',      'sr-wake-name.js is Shadow Edition only');
  assertNotContains(src, 'sr-voice-assistant.js','sr-voice-assistant.js is Shadow Edition only');
});

test('index.html loads platform detector (Stage 2)', function () {
  assertContains(src, 'sr-platform-detector.js',  'Must load platform detector');
  assertContains(src, 'sr-capability-manager.js', 'Must load capability manager');
  assertContains(src, 'sr-device-action-router.js','Must load device action router');
  assertContains(src, 'sr-web-adapter.js',         'Must load web adapter');
});

test('index.html loads persistence modules (Stage 3)', function () {
  assertContains(src, 'snx-shadow-conv-history.js', 'Must load conv history');
  assertContains(src, 'snx-shadow-memory.js',       'Must load memory');
  assertContains(src, 'snx-shadow-adaptive.js',     'Must load adaptive');
});

test('index.html loads security modules (Stage 4)', function () {
  assertContains(src, 'web-research-guard.js',  'Must load research guard');
  // sr-founder-security.js is Shadow Edition-only — must NOT be in regular edition
  assertNotContains(src, 'sr-founder-security.js', 'sr-founder-security.js is Shadow Edition only');
});

test('Conversation SR.ask() is called (brain is used for all messages)', function () {
  assertContains(src, 'SR.ask(msg,', 'All messages must go through SR.ask()');
});

test('Settings toggles call SR methods (not bypassed)', function () {
  assertContains(src, 'SR.setHistoryEnabled',  'History toggle must use SR');
  assertContains(src, 'SR.setMemoryEnabled',   'Memory toggle must use SR');
  assertContains(src, 'SR.setAdaptiveEnabled', 'Adaptive toggle must use SR');
});

test('New conversation calls SR.newConversation()', function () {
  assertContains(src, 'SR.newConversation()', 'New conversation must call SR method');
});

// ── SECURITY ──────────────────────────────────────────────────────────────

test('UI does NOT reference SNS Firebase project horr-a08f4', function () {
  assertNotContains(src, 'horr-a08f4', 'Must not reference SNS Firebase project');
});

test('UI does NOT reference SNS globals directly', function () {
  assertNotContains(src, '_snxDbCompat', 'Must not reference SNS DB');
  assertNotContains(src, '_snxCurrentUser', 'Must not reference SNS user');
});

test('No hardcoded credentials or API keys in UI', function () {
  assertNotContains(src, 'apiKey: "A', 'Must not have hardcoded API key');
  assertNotContains(src, 'apiKey: \'A', 'Must not have hardcoded API key');
  // Firebase config is loaded from separate file (firebase-config.js)
});

test('PWA theme-color meta tag is present', function () {
  assertContains(src, 'theme-color', 'PWA theme-color meta must be present');
});

test('Apple mobile web app capable meta is present', function () {
  assertContains(src, 'apple-mobile-web-app-capable', 'iOS PWA meta must be present');
});

// ── ui.html (original) STILL EXISTS AND IS UNMODIFIED ─────────────────────

test('Original ui.html still exists (not replaced)', function () {
  assert(fs.existsSync(path.join(ROOT, 'ui.html')), 'ui.html must still exist');
});

test('Original ui.html still references SR-V2-STAGE4 build', function () {
  var uiSrc = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  assertContains(uiSrc, 'SR-V2-STAGE4', 'Original ui.html should remain unchanged');
});

// ── RESULTS ────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log('  STAGE 5 — UI / COSMETIC TEST RESULTS');
console.log('══════════════════════════════════════════════');
results.forEach(function (r) { console.log(r); });
console.log('\n  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('══════════════════════════════════════════════');

if (FAIL > 0) {
  process.stdout.write('STAGE 5 TEST: FAIL\n');
  process.exit(1);
} else {
  process.stdout.write('STAGE 5 TEST: PASS\n');
  process.exit(0);
}
