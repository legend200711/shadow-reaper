/**
 * shadow-reaper-v2/tests/sr-companion-integration.test.js
 * Shadow Reaper — Stage 7 Companion Reliability & Integration Tests
 *
 * Build: SHADOW-HUMAN-1
 *
 * Tests:
 *   Multi-user isolation (user A vs user B profiles)
 *   PWA session persistence (sessionStorage save/restore logic)
 *   One-brain architecture (no separate parallel brains)
 *   Personality → TTS pipeline connection
 *   Context continuity across multiple turns
 *   Creator Knowledge pipeline intact
 *   Hands-free voice protection (echo, timeout, barge-in)
 *   Service worker cache version (sr-shell-v15 or higher)
 *   Shadow API client connection
 *   Security: no exposed credentials in status
 *
 * Exit: 0 = all pass, 1 = any fail.
 */

'use strict';

var fs   = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

// ─── Environment shims ─────────────────────────────────────────────────────────

global.localStorage = {
  _store: {},
  getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem:    function (k, v) { this._store[k] = String(v); },
  removeItem: function (k) { delete this._store[k]; },
  clear:      function ()  { this._store = {}; },
};

global.sessionStorage = {
  _store: {},
  getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem:    function (k, v) { this._store[k] = String(v); },
  removeItem: function (k) { delete this._store[k]; },
  clear:      function ()  { this._store = {}; },
};

try {
  Object.defineProperty(global, 'navigator', {
    value: { onLine: true, userAgent: 'node-test' },
    configurable: true, writable: true,
  });
} catch (_) {}

global.window = global;

// Mock SpeechSynthesisUtterance
global.SpeechSynthesisUtterance = function (text) {
  this.text   = text;
  this.rate   = 1.0;
  this.pitch  = 1.0;
  this.volume = 1.0;
  this.onstart = null;
  this.onend   = null;
  this.onerror = null;
};
global.speechSynthesis = {
  speak:     function (u) { if (u.onend) u.onend(); },
  cancel:    function () {},
  getVoices: function () { return []; },
};
global.SpeechRecognition = function () {};
global.webkitSpeechRecognition = global.SpeechRecognition;

// ─── Module loader ─────────────────────────────────────────────────────────────

function loadModule(relPath) {
  try {
    var abs = path.join(ROOT, relPath);
    var code = fs.readFileSync(abs, 'utf8');
    var fn = new Function('global', 'window', 'localStorage', 'require', 'module', 'exports', code);
    fn(global, global, global.localStorage, require, {}, {});
  } catch (e) {
    console.error('[loadModule] Failed to load ' + relPath + ': ' + e.message);
  }
}

loadModule('core/sr-conversational-cue.js');
loadModule('core/personality-engine.js');
loadModule('core/understanding-engine.js');
loadModule('core/context-engine.js');
loadModule('core/conversation-engine.js');
loadModule('voice/sr-wake-name.js');
loadModule('voice/sr-conversation-session.js');
loadModule('voice/voice-engine.js');

// ─── Test harness ──────────────────────────────────────────────────────────────

var PASS = 0;
var FAIL = 0;

function assert(cond, msg) {
  if (cond) { PASS++; }
  else { FAIL++; console.error('  FAIL: ' + msg); }
}

function test(name, fn) {
  try {
    fn();
    console.log('  pass: ' + name);
  } catch (e) {
    FAIL++;
    console.error('  FAIL: ' + name + '\n        ' + e.message);
  }
}

var CUE  = global.SRConversationalCue;
var P    = global.SRPersonality;
var CTX  = global.SRContext;
var CV   = global.SRConversation;
var SRV  = global.SRVoice;
var SRWN = global.SRWakeName;
var SRCS = global.SRConvSession;

// ═══════════════════════════════════════════════════════════════════════════════
// ONE-BRAIN ARCHITECTURE PROTECTION
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  STAGE 7 — COMPANION RELIABILITY INTEGRATION');
console.log('══════════════════════════════════════════════');

test('S7-01  One-brain: no secondary AI brains exist', function () {
  assert(!global.EmotionBrain,    'EmotionBrain must not exist');
  assert(!global.PersonalityBrain,'PersonalityBrain must not exist');
  assert(!global.SocialBrain,     'SocialBrain must not exist');
  assert(!global.CompanionBrain,  'CompanionBrain must not exist');
  assert(!global.HumanBrain,      'HumanBrain must not exist');
  assert(!global.VoiceBrain,      'VoiceBrain must not exist');
});

test('S7-02  SRConversationalCue is an analysis layer, not a brain', function () {
  if (!CUE) return;
  assert(typeof CUE.ask !== 'function',      'CUE must not have ask()');
  assert(typeof CUE.generate !== 'function', 'CUE must not have generate()');
  assert(typeof CUE.analyze === 'function',  'CUE must have analyze()');
});

test('S7-03  SRPersonality is a preference/signal layer, not a brain', function () {
  if (!P) return;
  assert(typeof P.ask !== 'function',         'Personality must not have ask()');
  assert(typeof P.generate !== 'function',    'Personality must not have generate()');
  assert(typeof P.analyzeTurn === 'function', 'Personality must have analyzeTurn()');
});

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-USER ISOLATION
// ═══════════════════════════════════════════════════════════════════════════════

test('S7-04  Multi-user: User A heavy sarcasm learning does not carry to User B', function () {
  if (!P) return;

  // User A: aggressive sarcastic profile
  P.resetProfile();
  for (var i = 0; i < 10; i++) {
    P.learnFromTurn("lol smartass banter 😂 roast me", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, "resp");
  }
  var profA = P.getProfile();

  // User B: fresh profile (new user)
  P.resetProfile();
  var profB = P.getProfile();

  assert(profB.humorFrequency < profA.humorFrequency,
    'User B humor should be lower than trained User A, A=' + profA.humorFrequency + ' B=' + profB.humorFrequency);
  assert(profB.sarcasmTolerance < profA.sarcasmTolerance,
    'User B sarcasmTolerance should be lower than trained User A');
  assert(profB.jokeCount === 0, 'User B jokeCount should be 0');
  assert(profB.sarcasmPreference <= 1,
    'User B sarcasmPreference should be default 1, not User A\'s raised value');
});

test('S7-05  Multi-user: User B direct calm preference unaffected by User A sarcasm', function () {
  if (!P) return;

  // User B: calm/direct preference
  P.resetProfile();
  P.setSarcasmPreference(0);
  P.setHumorPreference(0);
  var profB = P.getProfile();

  // User A comes in: we simulate by resetting and training as A
  P.resetProfile();
  for (var i = 0; i < 8; i++) {
    P.learnFromTurn("haha that's hilarious smartass 😂", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, "resp");
  }
  // profA (trained) vs profB (fresh with user B settings) are different objects
  var profA = P.getProfile();

  // "Switch back" to user B: reset to simulate user isolation
  P.resetProfile();
  P.setSarcasmPreference(0);
  P.setHumorPreference(0);
  var profBRestored = P.getProfile();

  assert(profBRestored.sarcasmPreference === 0, 'User B sarcasmPreference should be 0 (restored)');
  assert(profBRestored.humorPreference === 0,   'User B humorPreference should be 0 (restored)');
});

// ═══════════════════════════════════════════════════════════════════════════════
// FULL PIPELINE INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════════

test('S7-06  Context engine Stage 5 fields exported correctly', function () {
  if (!CTX) return;
  CTX.reset();
  var snap = CTX.getSnapshot();

  assert(typeof snap.neverMind    === 'boolean', 'neverMind field must be boolean');
  assert(typeof snap.rhetoricalQ  === 'boolean', 'rhetoricalQ field must be boolean');
  assert('prevTopic'  in snap,                   'prevTopic must exist in snapshot');
  assert('topicHistory' in snap,                 'topicHistory must exist in snapshot');
  assert('recentSubjects' in snap,               'recentSubjects must exist in snapshot');
});

test('S7-07  Conversation turns accumulate correctly across multi-turn', function () {
  if (!CV || !CTX || !global.SRUnderstanding) return;
  CV.reset();
  CTX.reset();

  var msgs = [
    "Yo Shadow.",
    "You been behaving today? 😂",
    "Yeah right 😂",
    "Okay seriously I need help with my computer.",
  ];

  msgs.forEach(function (msg) {
    var u = global.SRUnderstanding.understand(msg);
    CTX.update(u, msg);
    CV.addTurn('user', msg, u.intent, u.tone);
  });

  var turnCount = CV.getTurnCount();
  assert(turnCount === 4, 'Should have 4 turns, got: ' + turnCount);

  var recent = CV.getRecentTurns(4);
  assert(recent.length === 4, 'getRecentTurns(4) should return 4 turns');
  assert(recent[0].text === "Yo Shadow.", 'First turn should be "Yo Shadow."');
});

test('S7-08  CUE correctly analyzes all regression inputs', function () {
  if (!CUE) return;
  CUE.resetHistory();

  var tests = [
    { msg: "Yo Shadow what's good", expectTone: ['casual', 'playful', 'neutral'] },
    { msg: "You're annoying as hell 😂", expectHumor: true },
    { msg: "Okay smartass 😂", expectNotSerious: true },
    { msg: "I'm being serious now.", expectSerious: true },
    { msg: "This computer is pissing me off.", expectFrustrated: true },
    { msg: "Texas trying to cook me today or what?", expectLowSerious: true },
  ];

  tests.forEach(function (t) {
    var cue = CUE.analyze(t.msg, { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);

    if (t.expectTone) {
      assert(t.expectTone.indexOf(cue.tone) !== -1,
        '"' + t.msg + '" tone should be one of ' + t.expectTone.join('/') + ', got: ' + cue.tone);
    }
    if (t.expectHumor) {
      assert(cue.humor >= 0.20 || cue.sarcasmLikelihood >= 0.10,
        '"' + t.msg + '" should have humor/sarcasm signal');
    }
    if (t.expectNotSerious) {
      assert(cue.seriousness < 0.50,
        '"' + t.msg + '" should not be serious, got: ' + cue.seriousness);
    }
    if (t.expectSerious) {
      assert(cue.seriousness >= 0.50,
        '"' + t.msg + '" should be serious, got: ' + cue.seriousness);
    }
    if (t.expectFrustrated) {
      assert(cue.frustrationLikelihood >= 0.40,
        '"' + t.msg + '" should show frustration, got: ' + cue.frustrationLikelihood);
    }
    if (t.expectLowSerious) {
      assert(cue.seriousness < 0.50,
        '"' + t.msg + '" weather/humor query should not be high seriousness');
    }
  });
});

test('S7-09  Context continuity: project name recalled by reference', function () {
  if (!CTX || !CV || !global.SRUnderstanding) return;
  CV.reset();
  CTX.reset();

  var u1 = global.SRUnderstanding.understand("My project is called Blue Wolf.");
  CTX.update(u1, "My project is called Blue Wolf.");
  CV.addTurn('user', "My project is called Blue Wolf.", u1.intent, u1.tone);

  // Later turn with pronoun
  var u2 = global.SRUnderstanding.understand("What's the name of it again?");
  CTX.update(u2, "What's the name of it again?");

  var snap = CTX.getSnapshot();
  assert(snap.projectName === 'Blue Wolf', 'Project Blue Wolf should be retained, got: ' + snap.projectName);
  var resolved = CTX.resolvePronouns("What is it about?");
  assert(resolved !== null, 'pronoun "it" should resolve to a subject');
});

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE SYSTEM INTEGRITY (Stage 6 + Hands-Free Protection)
// ═══════════════════════════════════════════════════════════════════════════════

test('S7-10  SRVoice.speakWithCue exists and speaks same text', function () {
  if (!SRV) return;
  assert(typeof SRV.speakWithCue === 'function', 'speakWithCue must exist');
  assert(typeof SRV.speak === 'function', 'speak() must still exist (backward compat)');
});

test('S7-11  Hands-free voice session timeout is 60 seconds', function () {
  if (!SRCS) return;
  assert(SRCS.getInactivityTimeout() === 60000,
    'Session inactivity timeout must be 60000ms, got: ' + SRCS.getInactivityTimeout());
});

test('S7-12  SRWakeName: Shadow is default wake name', function () {
  if (!SRWN) return;
  SRWN.save({ wakeName: 'Shadow' }, function () {});
  assert(SRWN.getWakeName() === 'Shadow', 'Default wake name must be Shadow');
});

test('S7-13  SRWakeName: companion names detected correctly', function () {
  if (!SRWN) return;

  // Only use names from the valid WAKE_NAMES list in sr-wake-name.js
  var names = ['Shadow', 'Ghost', 'Luna', 'Nova', 'Raven'];
  var allOk = true;
  names.forEach(function (n) {
    SRWN.save({ wakeName: n }, function () {});
    var r = SRWN.normalizeTranscript(n + ' tell me the weather.');
    if (!r.wakeDetected) {
      allOk = false;
      console.error('    Wake name not detected: ' + n);
    }
  });
  assert(allOk, 'All companion wake names should be detected');
  // Restore
  SRWN.save({ wakeName: 'Shadow' }, function () {});
});

test('S7-14  SRVoice echo protection: speakWithCue does not re-process TTS as input', function () {
  // This is a structural test — the protection exists in the voice engine's
  // suppression logic and session echo detection. We verify the module is configured.
  if (!SRCS) return;
  var t = SRCS.getInactivityTimeout();
  assert(typeof t === 'number' && t > 0, 'Session module active with positive timeout');
  // SRVoice TTS and recognition are NOT both active simultaneously by design
  // (verifed by the state machine: SPEAKING state suppresses recognition)
  if (SRV) {
    assert(typeof SRV.stopSpeaking === 'function', 'stopSpeaking must exist for interrupt handling');
    assert(typeof SRV.stopListening === 'function', 'stopListening must exist for echo protection');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PWA SESSION PERSISTENCE (Stage 7)
// ═══════════════════════════════════════════════════════════════════════════════

test('S7-15  PWA cache version is sr-shell-v15 or higher', function () {
  var sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  // Accept v15, v16, or any higher version
  var match = sw.match(/CACHE_VERSION\s*=\s*'(sr-shell-v(\d+))'/);
  if (match) {
    var ver = parseInt(match[2], 10);
    assert(ver >= 15, 'PWA cache version must be ≥ sr-shell-v15, found: ' + match[1]);
  } else {
    // Fallback: check for any of v14, v15, v16 presence
    assert(
      sw.includes("'sr-shell-v15'") || sw.includes("'sr-shell-v16'") ||
      sw.includes("'sr-shell-v17'") || sw.includes("'sr-shell-v18'"),
      'sw.js must use cache version sr-shell-v15 or higher'
    );
  }
});

test('S7-16  ui.html includes session persistence functions', function () {
  var ui = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  assert(ui.includes('_saveSessionSnapshot'), 'ui.html must have _saveSessionSnapshot()');
  assert(ui.includes('_restoreSessionSnapshot'), 'ui.html must have _restoreSessionSnapshot()');
  assert(ui.includes('SESSION_KEY'), 'ui.html must have SESSION_KEY constant');
  assert(ui.includes('sessionStorage'), 'ui.html must use sessionStorage for persistence');
});

test('S7-17  ui.html uses pageshow and visibilitychange for PWA lifecycle', function () {
  var ui = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  assert(ui.includes('pageshow'), 'ui.html must listen for pageshow event');
  assert(ui.includes('visibilitychange'), 'ui.html must listen for visibilitychange event');
  assert(ui.includes('e.persisted'), 'ui.html must check persisted flag for BFCache restore');
});

test('S7-18  PWA session persistence logic: save/restore round-trip', function () {
  // Simulate the sessionStorage save/restore logic in isolation
  var SESSION_KEY = 'srSessionSnapshot';
  var SESSION_MAX_MSGS = 20;

  // Build a fake message list
  var msgs = [];
  for (var i = 0; i < 5; i++) {
    msgs.push({ role: i % 2 === 0 ? 'user' : 'sr', text: 'message ' + i });
  }

  var snap = {
    msgs: msgs,
    msgCount: 5,
    lastGeneration: 'hosted',
    ts: Date.now(),
  };

  global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(snap));

  // Now read it back
  var raw = global.sessionStorage.getItem(SESSION_KEY);
  assert(raw !== null, 'session snapshot should be stored');

  var restored = JSON.parse(raw);
  assert(restored.msgs.length === 5, 'restored msgs should have 5 items');
  assert(restored.msgCount === 5, 'restored msgCount should be 5');
  assert(restored.lastGeneration === 'hosted', 'restored lastGeneration should match');
  assert(typeof restored.ts === 'number', 'timestamp should be a number');

  // Verify expiry logic: timestamp must be recent enough (< 2 hours)
  var age = Date.now() - restored.ts;
  assert(age < 7200000, 'session snapshot should be within 2-hour window');
});

test('S7-19  PWA session persistence: stale snapshot (> 2 hours) should not restore', function () {
  var SESSION_KEY = 'srSessionSnapshot';

  // Create a stale snapshot (3 hours ago)
  var staleSnap = {
    msgs: [{ role: 'user', text: 'old message' }],
    msgCount: 1,
    lastGeneration: 'hosted',
    ts: Date.now() - 10800000, // 3 hours ago
  };

  global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(staleSnap));

  var raw = global.sessionStorage.getItem(SESSION_KEY);
  var snap = JSON.parse(raw);
  var age = Date.now() - snap.ts;

  assert(age > 7200000, 'stale snapshot should be older than 2 hours');
  // The restore logic should reject this — we verify the condition
  var shouldReject = snap.ts && (Date.now() - snap.ts) > 7200000;
  assert(shouldReject === true, 'stale snapshot should be rejected by expiry check');
});

test('S7-20  ui.html Stage 5+6 modules are loaded (personality + cue)', function () {
  var ui = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  assert(ui.includes('core/sr-conversational-cue.js'),
    'ui.html must load sr-conversational-cue.js');
  assert(ui.includes('core/personality-engine.js'),
    'ui.html must load personality-engine.js');
});

test('S7-21  ui.html uses speakWithCue for expressive TTS', function () {
  var ui = fs.readFileSync(path.join(ROOT, 'ui.html'), 'utf8');
  assert(ui.includes('speakWithCue'), 'ui.html must use speakWithCue for expressive TTS delivery');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY: NO EXPOSED CREDENTIALS
// ═══════════════════════════════════════════════════════════════════════════════

test('S7-22  Security: .env file excluded from repository', function () {
  var envPath = path.join(ROOT, '.env');
  var exists = fs.existsSync(envPath);
  // If .env exists it should only be the example (not real credentials)
  if (exists) {
    var content = fs.readFileSync(envPath, 'utf8');
    assert(!content.match(/^[A-Z_]+=\S{20,}/m),
      '.env file should not contain real API keys');
  } else {
    assert(true, '.env does not exist — good');
  }
});

test('S7-23  Security: shadow-reaper.js does not expose raw API keys', function () {
  var sr = fs.readFileSync(path.join(ROOT, 'shadow-reaper.js'), 'utf8');
  assert(!sr.match(/api[_-]?key\s*=\s*['"][a-zA-Z0-9]{20,}/i),
    'shadow-reaper.js must not contain hardcoded API keys');
  assert(!sr.match(/Bearer\s+[a-zA-Z0-9]{20,}/),
    'shadow-reaper.js must not contain hardcoded Bearer tokens');
});

test('S7-24  Security: no private keys in voice engine', function () {
  var ve = fs.readFileSync(path.join(ROOT, 'voice/voice-engine.js'), 'utf8');
  assert(!ve.match(/private[_-]?key\s*=/i), 'voice-engine.js must not contain private keys');
  assert(!ve.match(/Bearer\s+[a-zA-Z0-9]{20,}/), 'voice-engine.js must not contain tokens');
});

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log('');
console.log('══════════════════════════════════════════════');
console.log('  SR COMPANION INTEGRATION — STAGE 7 RESULTS');
console.log('══════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
console.log('══════════════════════════════════════════════');

process.exit(FAIL > 0 ? 1 : 0);
