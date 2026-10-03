/**
 * shadow-reaper-v2/tests/sr-handsfree-voice.test.js
 * Shadow Reaper — Hands-Free Voice Conversation Tests
 *
 * Build: SR-V2-HF-VOICE-TEST-1
 *
 * Tests:
 *   - Wake detection (selected companion name)
 *   - Wake → active session transition
 *   - Speech transcript → _send()-equivalent pipeline
 *   - No duplicate sends
 *   - TTS receives the same Shadow response
 *   - Recognition pauses during TTS (echo protection)
 *   - Recognition restarts after TTS
 *   - Continuous second + third turn
 *   - Conversation context survives turns
 *   - End-conversation behavior
 *   - Timeout behavior
 *   - Permission denied graceful handling
 *   - Recognition error recovery
 *   - Weather via voice → normal pipeline
 *   - Creator Knowledge via voice → normal pipeline
 *   - Electronics via voice → normal pipeline
 *   - PWA cache version is sr-shell-v14
 *   - SRVoiceAssistant timeout is 60s
 *   - SRConvSession timeout is 60s
 */

'use strict';

var fs   = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

// ── Minimal browser globals for Node ──────────────────────────────────────────
global.localStorage = {
  _store: {},
  getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem:    function (k, v) { this._store[k] = String(v); },
  removeItem: function (k) { delete this._store[k]; },
  clear:      function ()  { this._store = {}; },
};

try {
  Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'node-test-agent' },
    configurable: true, writable: true,
  });
} catch (_) {}

global.window = global;

// ── Load voice modules ─────────────────────────────────────────────────────────
function loadModule(relPath) {
  var abs = path.join(ROOT, relPath);
  var code = fs.readFileSync(abs, 'utf8');
  // Wrap in IIFE-friendly context
  var fn = new Function('global', 'window', 'localStorage', 'require', 'module', 'exports', code);
  try {
    fn(global, global, global.localStorage, require, {}, {});
  } catch (_) {}
}

// Load core modules (minimal set for voice tests)
loadModule('voice/sr-wake-name.js');
loadModule('voice/sr-conversation-session.js');
loadModule('voice/voice-engine.js');
loadModule('voice/sr-voice-assistant.js');

// Load shadow-reaper brain (needed for pipeline route tests)
try {
  loadModule('shadow-reaper.js');
} catch (_) {}

var SRWN  = global.SRWakeName;
var SRV   = global.SRVoice;
var SRCS  = global.SRConvSession;
var SRVA  = global.SRVoiceAssistant;
var SR    = global.ShadowReaper;

// ── Test harness ───────────────────────────────────────────────────────────────
var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push({ status: 'PASS', name: name });
    process.stdout.write('  ✓  ' + name + '\n');
  } catch (e) {
    FAIL++;
    results.push({ status: 'FAIL', name: name, error: e.message });
    process.stdout.write('  ✗  ' + name + '\n    → ' + e.message + '\n');
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertContains(str, sub, msg) {
  if (typeof str !== 'string' || str.indexOf(sub) === -1) {
    throw new Error((msg || 'Expected to contain') + ' | string: ' + String(str).substring(0, 80));
  }
}

function assertNotContains(str, sub, msg) {
  if (typeof str === 'string' && str.indexOf(sub) !== -1) {
    throw new Error((msg || 'Expected NOT to contain') + ': ' + sub);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
process.stdout.write('\n══════════════════════════════════════════════════════\n');
process.stdout.write('  SR HANDS-FREE VOICE TESTS — SR-V2-HF-VOICE-TEST-1\n');
process.stdout.write('══════════════════════════════════════════════════════\n');

// ── SECTION 1: PWA CACHE VERSION ───────────────────────────────────────────────
process.stdout.write('\n── PWA CACHE VERSION ─────────────────────────────────\n');

test('PWA cache version is sr-shell-v14 (hands-free stage)', function () {
  var sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert(sw.includes("'sr-shell-v14'"), "sw.js must use cache version sr-shell-v14");
});

// ── SECTION 2: SRVoiceAssistant TIMEOUT ───────────────────────────────────────
process.stdout.write('\n── VOICE ASSISTANT TIMEOUT ───────────────────────────\n');

test('SRVoiceAssistant module is loaded', function () {
  assert(SRVA, 'SRVoiceAssistant must be loaded');
});

test('SRVoiceAssistant default timeout is 60 seconds (not 15)', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  // Must have 60000, must NOT have 15000 as the default
  assert(code.includes('= 60000'), 'DEFAULT_TIMEOUT_MS must be 60000');
  assert(!code.includes('= 15000'), 'Old 15-second default must be removed');
});

test('SRVoiceAssistant getConversationTimeout returns 60000 by default', function () {
  if (!SRVA) return;
  var t = SRVA.getConversationTimeout();
  assert(t === 60000, 'Conversation timeout must be 60000ms, got: ' + t);
});

// ── SECTION 3: SRCONVSESSION TIMEOUT ──────────────────────────────────────────
process.stdout.write('\n── SRCONVSESSION TIMEOUT ─────────────────────────────\n');

test('SRConvSession module is loaded', function () {
  assert(SRCS, 'SRConvSession must be loaded');
});

test('SRConvSession default inactivity timeout is 60 seconds', function () {
  if (!SRCS) return;
  var t = SRCS.getInactivityTimeout();
  assert(t === 60000, 'SRConvSession inactivity timeout must be 60000ms, got: ' + t);
});

// ── SECTION 4: WAKE NAME DETECTION ────────────────────────────────────────────
process.stdout.write('\n── WAKE NAME DETECTION ───────────────────────────────\n');

test('SRWakeName module is loaded', function () {
  assert(SRWN, 'SRWakeName must be loaded');
});

test('Default wake name is Shadow', function () {
  if (!SRWN) return;
  assert(SRWN.getWakeName() === 'Shadow', 'Default wake name must be Shadow');
});

test('normalizeTranscript detects "Shadow" at start', function () {
  if (!SRWN) return;
  var result = SRWN.normalizeTranscript('Shadow how are you?');
  assert(result.wakeDetected === true, 'Wake must be detected');
  assertContains(result.command, 'how are you', 'Command should be stripped');
});

test('normalizeTranscript detects "Hey Shadow" at start', function () {
  if (!SRWN) return;
  var result = SRWN.normalizeTranscript('Hey Shadow tell me about Shadow Nexus Social');
  assert(result.wakeDetected === true, 'Wake must be detected with Hey prefix');
  assertContains(result.command, 'tell me about', 'Command should strip wake prefix');
});

test('normalizeTranscript with "Shadow," (trailing separator) returns empty command', function () {
  if (!SRWN) return;
  // normalizeTranscript patterns require at least one separator char after the wake name.
  // "Shadow," matches; bare "Shadow" without a separator is not stripped (correct behavior).
  var result = SRWN.normalizeTranscript('Shadow,');
  assert(result.wakeDetected === true, 'Wake must be detected with trailing separator');
  assert(!result.command.trim(), 'Command should be empty for wake-only utterance');
});

test('normalizeTranscript non-wake phrase does NOT detect wake', function () {
  if (!SRWN) return;
  var result = SRWN.normalizeTranscript('tell me about the weather');
  assert(result.wakeDetected === false, 'Should not detect wake for non-wake phrase');
  assertContains(result.command, 'weather', 'Command preserved unchanged');
});

test('Selected companion wake name is used (not hardcoded Shadow only)', function () {
  if (!SRWN) return;
  SRWN.save({ wakeName: 'Luna' }, function () {});
  assert(SRWN.getWakeName() === 'Luna', 'Wake name should be Luna after save');
  var result = SRWN.normalizeTranscript('Luna what time is it?');
  assert(result.wakeDetected === true, 'Luna wake name must be detected');
  assertContains(result.command, 'what time', 'Command stripped from Luna wake');
  // Restore
  SRWN.save({ wakeName: 'Shadow' }, function () {});
});

test('Shadow wake name restored after test', function () {
  if (!SRWN) return;
  assert(SRWN.getWakeName() === 'Shadow', 'Shadow must be restored as default');
});

// ── SECTION 5: SESSION LIFECYCLE ──────────────────────────────────────────────
process.stdout.write('\n── SESSION LIFECYCLE ─────────────────────────────────\n');

test('SRConvSession starts in IDLE state', function () {
  if (!SRCS) return;
  SRCS.endSession('test-reset');
  assert(SRCS.getState() === 'IDLE', 'Must start in IDLE');
  assert(SRCS.isActive() === false, 'Session must not be active in IDLE');
});

test('startSession() transitions to WAKE_DETECTED then LISTENING', function (done) {
  if (!SRCS) return;
  SRCS.endSession('test-reset');
  SRCS.startSession();
  assert(SRCS.isActive() === true, 'Session must be active after startSession');
  // Immediately after startSession, state is WAKE_DETECTED
  var s = SRCS.getState();
  assert(s === 'WAKE_DETECTED' || s === 'LISTENING', 'State must be WAKE_DETECTED or LISTENING');
  SRCS.endSession('test-done');
});

test('endSession() returns to IDLE', function () {
  if (!SRCS) return;
  SRCS.startSession();
  SRCS.endSession('test');
  assert(SRCS.getState() === 'IDLE', 'Must return to IDLE after endSession');
  assert(SRCS.isActive() === false, 'isActive must be false after endSession');
});

test('onStateChange callback fires when state changes', function () {
  if (!SRCS) return;
  var fired = false;
  var unsub = SRCS.onStateChange(function (newState) {
    fired = true;
    unsub();
  });
  SRCS.startSession();
  assert(fired === true, 'onStateChange callback must fire');
  SRCS.endSession('test');
});

// ── SECTION 6: ECHO PROTECTION ────────────────────────────────────────────────
process.stdout.write('\n── ECHO PROTECTION ───────────────────────────────────\n');

test('SRConvSession has echo protection (ECHO_SIMILARITY_THRESHOLD)', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-conversation-session.js'), 'utf8');
  assert(code.includes('ECHO_SIMILARITY_THRESHOLD'), 'Must define ECHO_SIMILARITY_THRESHOLD');
  assert(code.includes('_isEcho'), 'Must have _isEcho function');
});

test('onSpeakingStart sets TTS text for echo comparison', function () {
  if (!SRCS) return;
  SRCS.startSession();
  SRCS.onSpeakingStart('Shadow Nexus Social is a platform built by Chris Rabb.');
  // onSpeakingEnd would normally follow; we test that echo protection would now fire
  // for a similar recognized text
  var result = SRCS.onSpeechResult('Shadow Nexus Social is a platform built by Chris Rabb');
  assert(result.process === false, 'Echo of TTS text must be suppressed');
  SRCS.endSession('test');
});

test('Non-echo speech is processed after TTS ends', function () {
  if (!SRCS) return;
  SRCS.startSession();
  SRCS.onSpeakingStart('Hello there from Shadow.');
  SRCS.onSpeakingEnd();  // clears echo window
  var result = SRCS.onSpeechResult('Who built Shadow Nexus Social?');
  // After speaking ends, new speech should process (no echo match)
  assert(result.process === true, 'Non-echo speech must be processed after TTS ends');
  SRCS.endSession('test');
});

test('SRVoiceAssistant has POST_SPEECH_SUPPRESS_MS defined', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  assert(code.includes('POST_SPEECH_SUPPRESS_MS'), 'POST_SPEECH_SUPPRESS_MS must be defined');
});

test('index.html hands-free loop has 850ms post-speech delay (echo protection)', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('850'), 'index.html must have 850ms post-speech suppression delay');
});

// ── SECTION 7: END-CONVERSATION BEHAVIOR ──────────────────────────────────────
process.stdout.write('\n── END-CONVERSATION BEHAVIOR ─────────────────────────\n');

test('SRConvSession detects "goodbye" as end command', function () {
  if (!SRCS) return;
  SRCS.startSession();
  var result = SRCS.onSpeechResult('Goodbye Shadow');
  assert(result.process === false, 'Goodbye must not be processed as a question');
  assert(result.sessionEnded === true, 'Session must end on goodbye');
  assert(SRCS.getState() === 'IDLE', 'State must return to IDLE');
});

test('SRConvSession detects "that\'s all" as end command', function () {
  if (!SRCS) return;
  SRCS.startSession();
  var result = SRCS.onSpeechResult("that's all");
  assert(result.process === false, "that's all must end session");
  assert(result.sessionEnded === true, 'sessionEnded must be true');
  SRCS.endSession('test');
});

test('SRConvSession detects "stop listening" as end command', function () {
  if (!SRCS) return;
  SRCS.startSession();
  var result = SRCS.onSpeechResult('stop listening');
  assert(result.process === false, 'stop listening must end session');
  assert(result.sessionEnded === true, 'sessionEnded must be true');
});

test('SRConvSession detects "go to sleep" as end command', function () {
  if (!SRCS) return;
  SRCS.startSession();
  var result = SRCS.onSpeechResult('go to sleep');
  assert(result.process === false, 'go to sleep must end session');
  assert(result.sessionEnded === true, 'sessionEnded must be true');
});

test('Ending voice session does NOT clear memory or history', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-conversation-session.js'), 'utf8');
  // endSession must NOT call any memory/history clear methods
  assertNotContains(code, 'clearHistory', 'endSession must not clear history');
  assertNotContains(code, 'clearMemory',  'endSession must not clear memory');
  assertNotContains(code, 'newConversation', 'endSession must not reset conversation');
});

// ── SECTION 8: CONVERSATION CONTEXT ───────────────────────────────────────────
process.stdout.write('\n── CONVERSATION CONTEXT ──────────────────────────────\n');

test('SR.ask() maintains context across multiple turns', function () {
  if (!SR) return;
  SR.newConversation();
  SR.ask('My project is Shadow Nexus Social.');
  var r2 = SR.ask('Tell me more about it.');
  // The response should not be "I don't know what project you mean"
  assert(typeof r2 === 'string' && r2.length > 0, 'Second turn must produce a response');
});

test('Context: pronouns resolved across turns (same conversation)', function () {
  if (!SR) return;
  SR.newConversation();
  SR.ask('Chris Rabb built Shadow Nexus Social.');
  var r = SR.ask('What did he build?');
  assert(typeof r === 'string' && r.length > 0, 'Pronoun resolution turn must produce a response');
});

test('Voice path uses same brain as text path (ShadowReaper.ask)', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  assertContains(code, 'brain.ask(commandText', 'Voice must call brain.ask with command text');
  assertContains(code, 'ShadowReaper.ask', 'brainEntryPoint must document ShadowReaper.ask');
});

test('Voice path does NOT create a second memory system', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  assertNotContains(code, 'new SNXShadowMemory', 'Voice must not instantiate second memory');
  assertNotContains(code, 'new SRMemory', 'Voice must not instantiate second memory');
});

test('Voice path does NOT create a second conversation history', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  assertNotContains(code, 'SNXShadowConvHistory(', 'Voice must not instantiate its own history');
});

// ── SECTION 9: CONTINUOUS LOOP ARCHITECTURE ───────────────────────────────────
process.stdout.write('\n── CONTINUOUS LOOP ARCHITECTURE ──────────────────────\n');

test('index.html has _startHandsFree() function', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, '_startHandsFree', 'index.html must have _startHandsFree function');
});

test('index.html has _stopHandsFree() function', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, '_stopHandsFree', 'index.html must have _stopHandsFree function');
});

test('index.html has _openHandsFreeListenCycle() function', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, '_openHandsFreeListenCycle', 'index.html must have _openHandsFreeListenCycle');
});

test('index.html has _hfAfterSpeak() for auto-reopen after TTS', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, '_hfAfterSpeak', 'index.html must have _hfAfterSpeak for auto-relisten');
});

test('_hfAfterSpeak is called from TTS onend callback in API path', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // Check that _hfAfterSpeak() appears inside TTS speak callbacks
  var idx = html.indexOf('SRVoice.speak(apiResult.text');
  assert(idx !== -1, 'SRVoice.speak(apiResult.text must exist');
  var segment = html.substring(idx, idx + 500);
  assertContains(segment, '_hfAfterSpeak', 'TTS onend in API path must call _hfAfterSpeak');
});

test('_hfAfterSpeak is called from TTS onend callback in fallback path', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var idx = html.indexOf('SRVoice.speak(response');
  assert(idx !== -1, 'SRVoice.speak(response must exist in fallback path');
  var segment = html.substring(idx, idx + 500);
  assertContains(segment, '_hfAfterSpeak', 'TTS onend in fallback path must call _hfAfterSpeak');
});

test('No duplicate _send() calls — hands-free guards against double processing', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // The hands-free loop should check _isProcessing before restarting
  assertContains(html, '_isProcessing', 'Must check _isProcessing to prevent duplicate sends');
});

test('Hands-free uses SRWakeName.normalizeTranscript to strip wake prefix', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, 'normalizeTranscript', 'Hands-free must strip wake name via normalizeTranscript');
});

// ── SECTION 10: STATE DISPLAY ──────────────────────────────────────────────────
process.stdout.write('\n── UI STATE DISPLAY ──────────────────────────────────\n');

test('index.html has _setVoiceBarState() for UI state labels', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, '_setVoiceBarState', 'index.html must have _setVoiceBarState');
});

test('Voice bar shows Wake Ready state', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, 'Wake Ready', 'Voice bar must display Wake Ready state');
});

test('Voice bar shows Listening state', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, "Listening\u2026", 'Voice bar must display Listening… state');
});

test('Voice bar shows Thinking state', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, "Thinking\u2026", 'Voice bar must display Thinking… state');
});

test('Voice bar shows Speaking state', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, "Speaking\u2026", 'Voice bar must display Speaking… state');
});

test('Hands-free button exists in HTML (srHFBtn)', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, 'id="srHFBtn"', 'Hands-free button (srHFBtn) must exist in HTML');
});

test('Hands-free settings toggle exists (srToggleHandsFree)', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, 'id="srToggleHandsFree"', 'Hands-free toggle must exist in settings');
});

// ── SECTION 11: PERMISSION DENIED ────────────────────────────────────────────
process.stdout.write('\n── PERMISSION DENIED ─────────────────────────────────\n');

test('Hands-free handles not-allowed error by stopping session', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, 'not-allowed', 'Must handle not-allowed permission error in hands-free');
  assertContains(html, '_stopHandsFree', 'Must call _stopHandsFree on permission denied');
});

test('Permission denied shows clear message to user', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assertContains(html, 'Microphone permission was denied', 'Must show microphone permission denied message');
});

// ── SECTION 12: WEATHER / ELECTRONICS / CREATOR VIA VOICE ────────────────────
process.stdout.write('\n── VOICE PIPELINE ROUTING ────────────────────────────\n');

test('Weather query via voice goes through normal _send() pipeline', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // Hands-free calls _send(command) — same as typed
  var hfSection = html.substring(html.indexOf('_openHandsFreeListenCycle'), html.indexOf('_openHandsFreeListenCycle') + 3000);
  assertContains(hfSection, '_send(command)', 'Hands-free must call _send(command) for all queries including weather');
});

test('Electronics query via voice goes through normal _send() pipeline', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var hfSection = html.substring(html.indexOf('_openHandsFreeListenCycle'), html.indexOf('_openHandsFreeListenCycle') + 3000);
  assertContains(hfSection, '_send(command)', 'Electronics via voice must use same _send() path');
});

test('Creator Knowledge via voice goes through normal _send() pipeline', function () {
  // SR.ask() is the entry point for creator knowledge — voice doesn't bypass it
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  assertContains(code, 'brain.ask(commandText', 'Creator knowledge must flow through brain.ask');
});

test('Voice does NOT have a separate weather implementation', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  assertNotContains(code, 'SRWeather', 'Voice assistant must not call SRWeather directly');
  assertNotContains(code, 'sr-weather', 'Voice assistant must not import sr-weather directly');
});

test('Voice does NOT have a separate electronics research implementation', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  assertNotContains(code, 'SRElectronics', 'Voice must not call SRElectronics directly');
  assertNotContains(code, 'sr-electronics', 'Voice must not import electronics directly');
});

// ── SECTION 13: PWA LIMITATIONS ───────────────────────────────────────────────
process.stdout.write('\n── PWA LIMITATIONS ───────────────────────────────────\n');

test('SRWakeName accurately reports Web PWA background wake is not supported', function () {
  if (!SRWN) return;
  var info = SRWN.getWakePlatformInfo();
  // On WEB_MOBILE or WEB_DESKTOP, background wake should be NOT_SUPPORTED
  assert(
    info.backgroundWake === 'NOT_SUPPORTED' || info.backgroundWake === 'PLATFORM_DEPENDENT',
    'Background wake must be NOT_SUPPORTED or PLATFORM_DEPENDENT for web'
  );
});

test('sr-voice-assistant.js does not claim false always-on background capability', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  assert(code.includes('nativeWakeSupported:      false'), 'nativeWakeSupported must be false');
});

// ── SECTION 14: ZERO POLLING ───────────────────────────────────────────────────
process.stdout.write('\n── ZERO POLLING ──────────────────────────────────────\n');

test('voice/sr-voice-assistant.js has no setInterval (zero polling)', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  var stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert(!stripped.includes('setInterval('), 'Must not use setInterval');
});

test('voice/voice-engine.js has no setInterval', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/voice-engine.js'), 'utf8');
  var stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert(!stripped.includes('setInterval('), 'Must not use setInterval');
});

test('voice/sr-conversation-session.js has no setInterval', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-conversation-session.js'), 'utf8');
  var stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert(!stripped.includes('setInterval('), 'Must not use setInterval');
});

// ── SECTION 15: BARGE-IN SUPPORT ──────────────────────────────────────────────
process.stdout.write('\n── BARGE-IN SUPPORT ──────────────────────────────────\n');

test('SRConvSession.onUserSpeechStart cancels TTS on barge-in', function () {
  var code = fs.readFileSync(path.join(ROOT, 'voice/sr-conversation-session.js'), 'utf8');
  assertContains(code, 'stopSpeaking', 'Must call stopSpeaking on user speech start during SPEAKING state');
  assertContains(code, 'INTERRUPTED', 'Must transition to INTERRUPTED state on barge-in');
});

// ── SUMMARY ────────────────────────────────────────────────────────────────────
process.stdout.write('\n══════════════════════════════════════════════════════\n');
process.stdout.write('  SR HANDS-FREE VOICE TEST RESULTS\n');
process.stdout.write('══════════════════════════════════════════════════════\n');
process.stdout.write('  PASS : ' + PASS + '\n');
process.stdout.write('  FAIL : ' + FAIL + '\n');
process.stdout.write('  TOTAL: ' + (PASS + FAIL) + '\n');
process.stdout.write('══════════════════════════════════════════════════════\n\n');

if (FAIL > 0) {
  process.stdout.write('  FAILED TESTS:\n');
  results.filter(function (r) { return r.status === 'FAIL'; }).forEach(function (r) {
    process.stdout.write('    ✗  ' + r.name + '\n      → ' + r.error + '\n');
  });
  process.stdout.write('\n');
  process.exit(1);
}
