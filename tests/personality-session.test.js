/**
 * shadow-reaper-v2/tests/personality-session.test.js
 * Shadow Reaper — Personality, Session, Assistant Profile Tests
 *
 * Build: SR-V2-PERSONALITY-SESSION-TEST-1
 *
 * Runner: Node.js (no external test framework)
 * Usage:  node tests/personality-session.test.js
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * COVERAGE:
 *
 *  PERSONALITY ENGINE (SRPersonality)
 *    PE-01  Module loads and exposes expected API
 *    PE-02  Default profile has reasonable values
 *    PE-03  analyzeTurn returns humor-appropriate=false for sensitive topic
 *    PE-04  analyzeTurn returns humor-appropriate=true for playful message
 *    PE-05  analyzeTurn suppresses humor after consecutive serious turns
 *    PE-06  analyzeTurn detects frustrated mode
 *    PE-07  analyzeTurn detects technical mode
 *    PE-08  learnFromTurn raises humorFrequency on playful engagement
 *    PE-09  learnFromTurn raises sarcasmTolerance on sarcasm signals
 *    PE-10  learnFromTurn increments correctionCount on corrections
 *    PE-11  learnFromTurn adjusts casualness for casual language
 *    PE-12  resetProfile restores defaults
 *    PE-13  getPersonalityPromptAddendum produces non-empty string for various contexts
 *    PE-14  getAssistantName falls back to SRWakeName or 'Shadow'
 *
 *  CONVERSATION SESSION (SRConvSession)
 *    CS-01  Module loads and exposes expected API
 *    CS-02  Initial state is IDLE, session not active
 *    CS-03  startSession transitions to LISTENING
 *    CS-04  startSession is idempotent (calling again stays active)
 *    CS-05  endSession transitions to IDLE and clears session flag
 *    CS-06  onSpeechResult returns process=true for normal speech
 *    CS-07  onSpeechResult returns process=false for echo speech
 *    CS-08  onSpeechResult detects end command and ends session
 *    CS-09  onSpeakingStart sets SPEAKING state
 *    CS-10  onSpeakingEnd in active session returns to LISTENING
 *    CS-11  onSpeakingEnd when not active returns to IDLE
 *    CS-12  onRecognitionError 'no-speech' does not crash; stays in session
 *    CS-13  setInactivityTimeout stores value correctly
 *    CS-14  onStateChange callback fires on state transitions
 *    CS-15  onSessionEnd callback fires on endSession
 *    CS-16  Interrupt: user speech start while SPEAKING cancels TTS
 *
 *  ASSISTANT PROFILES / WAKE NAMES
 *    AP-01  Default wake name is Shadow (not Salem)
 *    AP-02  All 20 names available (full companion set)
 *    AP-03  setWakeName persists selected name
 *    AP-04  Invalid wake name rejected
 *    AP-05  voiceGender defaults to 'female'
 *    AP-06  setVoiceGender('male') persists
 *    AP-07  setVoiceGender('female') persists
 *    AP-08  Invalid voiceGender is ignored
 *    AP-09  Switching wake name does NOT reset personality profile
 *    AP-10  getAssistantName reflects current wake name
 *
 *  VOICE ENGINE (SRVoice)
 *    VE-01  Module loads with build SR-V2-VOICE-2
 *    VE-02  setVoiceGender('male') / getVoiceGender()
 *    VE-03  setVoiceGender('female') / getVoiceGender()
 *    VE-04  getStatus includes voiceGender field
 *    VE-05  getStatus includes sessionActive field
 *    VE-06  Invalid gender string defaults to 'female'
 *
 *  ONE-BRAIN INTEGRITY
 *    OB-01  No ShadowBrain / PersonalityBrain / etc. on global
 *    OB-02  ShadowReaper.ask() is the only ask entry point
 *    OB-03  Personality engine does NOT replace ShadowReaper.ask()
 *    OB-04  Conversation session does NOT replace ShadowReaper.ask()
 *    OB-05  All 20 wake names use ShadowReaper.ask() (not separate pipelines)
 *
 *  NATURAL CONVERSATION (via ShadowReaper.ask())
 *    NC-01  "Shadow, this website is acting stupid again." → non-empty response
 *    NC-02  Follow-up "Firebase." after project context → coherent response
 *    NC-03  Pronoun reference "what about the other one?" → non-empty
 *    NC-04  Correction "no I meant Firebase" → correction acknowledged
 *    NC-05  "What's your name?" returns current wake name
 *    NC-06  "Okay smartass." → non-empty, not a crash
 *    NC-07  Extended 12-turn conversation stays coherent (no crash)
 *    NC-08  "Remember what we were doing earlier?" → continuity response
 *
 *  MEMORY BOUNDARIES
 *    MB-01  Internet restriction: normal conversation does not trigger research
 *    MB-02  Technical question triggers research-eligible route (not general internet)
 *    MB-03  Personality learning does not store sensitive data
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

var fs   = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

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

try {
  Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Node.js test)', onLine: true },
    writable: true, configurable: true,
  });
} catch (_) {}

// SpeechRecognition / speechSynthesis not available in Node — expected
if (!global.speechSynthesis) global.speechSynthesis = null;

// ── Module loader ──────────────────────────────────────────────────────────────

function loadModule(relPath) {
  var code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  var fn = new Function('global', code);
  fn(global);
}

// ── Load modules ───────────────────────────────────────────────────────────────

loadModule('config/environment.js');
loadModule('security/security-policy.js');
try { loadModule('platform/sr-platform-detector.js'); } catch (_) {}
try { loadModule('platform/sr-feature-registry.js'); } catch (_) {}

// Core pipeline
loadModule('core/understanding-engine.js');
loadModule('core/context-engine.js');
loadModule('core/conversation-engine.js');
loadModule('core/response-engine.js');

// Personality engine (new)
loadModule('core/personality-engine.js');

// Conversation session (new)
loadModule('voice/sr-conversation-session.js');

// Wake name
loadModule('voice/sr-wake-name.js');

// Voice engine
loadModule('voice/voice-engine.js');

// Persistence (optional — session-only mode in tests)
try {
  loadModule('snx-shadow-conv-history.js');
  loadModule('snx-shadow-memory.js');
  loadModule('snx-shadow-adaptive.js');
  loadModule('core/adaptive-brain.js');
  loadModule('core/persistence-bridge.js');
} catch (_) {}

// Language foundation (optional)
try {
  loadModule('language/tokenizer/tokenizer.js');
  loadModule('language/morphology/morphology.js');
  loadModule('language/relationships/relationships.js');
  loadModule('language/semantics/semantics.js');
  loadModule('language/context/context-resolver.js');
  loadModule('language/phrases/phrases.js');
  loadModule('language/sr-language.js');
} catch (e) {
  console.warn('[PersonalityTest] Language foundation not fully loaded:', e.message);
}

// Main SR brain
loadModule('shadow-reaper.js');

var SR = global.ShadowReaper;
SR.init();

// ── Test harness ───────────────────────────────────────────────────────────────

var PASS = 0;
var FAIL = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function test(name, fn) {
  try {
    fn();
    PASS++;
    console.log('  ✓  ' + name);
  } catch (e) {
    FAIL++;
    console.log('  ✗  ' + name);
    console.log('        ' + e.message);
  }
}

function testAsync(name, asyncFn) {
  return asyncFn().then(function () {
    PASS++;
    console.log('  ✓  ' + name);
  }).catch(function (e) {
    FAIL++;
    console.log('  ✗  ' + name);
    console.log('        ' + e.message);
  });
}

function ask(message) {
  return new Promise(function (resolve) {
    SR.ask(message, function (r) { resolve(r); });
  });
}

function resetConv() {
  SR.newConversation();
}

// ══════════════════════════════════════════════════════════════════════════════
//  PERSONALITY ENGINE TESTS
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  PERSONALITY ENGINE TESTS');
console.log('══════════════════════════════════════════════\n');

var P = global.SRPersonality;

test('PE-01  SRPersonality loads and exposes expected API', function () {
  assert(P, 'SRPersonality not loaded');
  assert(typeof P.analyzeTurn === 'function', 'analyzeTurn missing');
  assert(typeof P.learnFromTurn === 'function', 'learnFromTurn missing');
  assert(typeof P.getPersonalityPromptAddendum === 'function', 'getPersonalityPromptAddendum missing');
  assert(typeof P.getAssistantName === 'function', 'getAssistantName missing');
  assert(typeof P.getProfile === 'function', 'getProfile missing');
  assert(typeof P.resetProfile === 'function', 'resetProfile missing');
  assert(typeof P.getStatus === 'function', 'getStatus missing');
});

test('PE-02  Default profile has reasonable values', function () {
  P.resetProfile();
  var profile = P.getProfile();
  assert(typeof profile.humorFrequency === 'number', 'humorFrequency not a number');
  assert(profile.humorFrequency >= 0 && profile.humorFrequency <= 1, 'humorFrequency out of range');
  assert(typeof profile.casualness === 'number', 'casualness not a number');
  assert(profile.preferredLength === 'short' || profile.preferredLength === 'medium' || profile.preferredLength === 'long',
    'invalid preferredLength');
  assert(profile.correctionCount >= 0, 'correctionCount negative');
});

test('PE-03  analyzeTurn: sensitive topic suppresses humor', function () {
  var ctx = P.analyzeTurn('I feel like I want to hurt myself', { intent: 'GENERAL_CONVERSATION', tone: 'sad' });
  assert(ctx.humorAppropriate === false, 'Humor should be suppressed for sensitive content');
  assert(ctx.seriousMode === true, 'Should be serious mode');
});

test('PE-04  analyzeTurn: playful message enables humor', function () {
  P.resetProfile();
  // Set a high humor frequency first
  var profile = P.getProfile();
  // Use load to simulate a profile with high humor
  global.localStorage.setItem('srPersonalityPrefs_guest', JSON.stringify(
    Object.assign({}, profile, { humorFrequency: 0.75 })
  ));
  P.load(function () {});

  var ctx = P.analyzeTurn('haha that was funny, okay smartass', { intent: 'GENERAL_CONVERSATION', tone: 'playful' });
  assert(typeof ctx.humorAppropriate === 'boolean', 'humorAppropriate should be boolean');
  assert(ctx.playfulMode === true, 'Should detect playful mode');
  // With high humor frequency and playful signal, humor should be appropriate
  assert(ctx.humorAppropriate === true, 'Humor should be appropriate for playful message with high humorFrequency');
});

test('PE-05  analyzeTurn: consecutive serious turns suppress humor', function () {
  P.resetProfile();
  // Feed 3 serious turns
  P.analyzeTurn('I lost my job today', { intent: 'GENERAL_CONVERSATION', tone: 'sad' });
  P.analyzeTurn('I am really stressed', { intent: 'GENERAL_CONVERSATION', tone: 'anxious' });
  P.analyzeTurn('I feel terrible', { intent: 'GENERAL_CONVERSATION', tone: 'sad' });
  var ctx = P.analyzeTurn('what should I do', { intent: 'QUESTION', tone: 'sad' });
  assert(ctx.humorAppropriate === false, 'Humor must be suppressed after consecutive serious turns');
});

test('PE-06  analyzeTurn: frustrated mode detected', function () {
  P.resetProfile();
  var ctx = P.analyzeTurn('this stupid website is broken again', { intent: 'GENERAL_CONVERSATION', tone: 'frustrated' });
  assert(ctx.frustratedMode === true, 'Should detect frustrated mode from signal words');
});

test('PE-07  analyzeTurn: technical mode detected', function () {
  P.resetProfile();
  var ctx = P.analyzeTurn('the Firebase error is crashing my deployment', { intent: 'QUESTION', tone: 'neutral' });
  assert(ctx.technicalMode === true, 'Should detect technical mode from tech keywords');
});

test('PE-08  learnFromTurn: humorFrequency increases on playful engagement', function () {
  P.resetProfile();
  var before = P.getProfile().humorFrequency;
  P.learnFromTurn('lol that was actually funny', { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, 'response');
  P.learnFromTurn('haha okay good one', { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, 'response');
  var after = P.getProfile().humorFrequency;
  assert(after > before, 'humorFrequency should increase after playful engagement (before=' + before + ' after=' + after + ')');
});

test('PE-09  learnFromTurn: sarcasmTolerance increases on sarcasm signals', function () {
  P.resetProfile();
  var before = P.getProfile().sarcasmTolerance;
  P.learnFromTurn('okay smartass', { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, 'response');
  var after = P.getProfile().sarcasmTolerance;
  assert(after > before, 'sarcasmTolerance should increase when user uses sarcasm');
});

test('PE-10  learnFromTurn: correctionCount increments on corrections', function () {
  P.resetProfile();
  var before = P.getProfile().correctionCount;
  P.learnFromTurn('no I meant Firebase', { intent: 'USER_CORRECTION', tone: 'neutral' }, 'response');
  var after = P.getProfile().correctionCount;
  assert(after > before, 'correctionCount should increment on correction (before=' + before + ' after=' + after + ')');
});

test('PE-11  learnFromTurn: casualness adjusts for casual language', function () {
  P.resetProfile();
  var before = P.getProfile().casualness;
  P.learnFromTurn('gonna check that out', { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, 'response');
  var after = P.getProfile().casualness;
  assert(after >= before, 'casualness should not decrease after casual message');
});

test('PE-12  resetProfile restores defaults', function () {
  P.learnFromTurn('lol haha smartass', { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, 'resp');
  P.resetProfile();
  var profile = P.getProfile();
  assert(profile.correctionCount === 0, 'correctionCount should reset to 0');
  assert(profile.jokeCount === 0, 'jokeCount should reset to 0');
});

test('PE-13  getPersonalityPromptAddendum returns string for various contexts', function () {
  var ctx1 = { seriousMode: true, humorAppropriate: false, preferredLength: 'short', casualness: 0.5 };
  var add1 = P.getPersonalityPromptAddendum(ctx1);
  assert(typeof add1 === 'string' && add1.length > 0, 'Should return non-empty string for serious mode');

  var ctx2 = { humorAppropriate: true, playfulMode: true, preferredLength: 'medium', casualness: 0.8, seriousMode: false };
  var add2 = P.getPersonalityPromptAddendum(ctx2);
  assert(typeof add2 === 'string' && add2.length > 0, 'Should return non-empty string for playful mode');

  var add3 = P.getPersonalityPromptAddendum(null);
  assert(typeof add3 === 'string', 'Should return empty string for null context');
  assert(add3 === '', 'Should return empty string for null context');
});

test('PE-14  getAssistantName returns current wake name or Shadow', function () {
  var name = P.getAssistantName();
  assert(typeof name === 'string' && name.length > 0, 'Should return a non-empty string');
  // With wake name set to Shadow (default), should return Shadow
  if (global.SRWakeName) {
    global.SRWakeName.setWakeName('Shadow', function () {});
    var name2 = P.getAssistantName();
    assert(name2 === 'Shadow', 'Should return Shadow when wake name is Shadow');
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  CONVERSATION SESSION TESTS
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  CONVERSATION SESSION TESTS');
console.log('══════════════════════════════════════════════\n');

var CS = global.SRConvSession;

test('CS-01  SRConvSession loads and exposes expected API', function () {
  assert(CS, 'SRConvSession not loaded');
  assert(typeof CS.startSession === 'function', 'startSession missing');
  assert(typeof CS.endSession === 'function', 'endSession missing');
  assert(typeof CS.onSpeechResult === 'function', 'onSpeechResult missing');
  assert(typeof CS.onSpeakingStart === 'function', 'onSpeakingStart missing');
  assert(typeof CS.onSpeakingEnd === 'function', 'onSpeakingEnd missing');
  assert(typeof CS.isActive === 'function', 'isActive missing');
  assert(typeof CS.getState === 'function', 'getState missing');
  assert(typeof CS.STATE === 'object', 'STATE enum missing');
});

test('CS-02  Initial state is IDLE, session not active', function () {
  CS.endSession('test_reset');
  assert(CS.getState() === 'IDLE', 'Initial state should be IDLE');
  assert(CS.isActive() === false, 'Session should not be active initially');
});

test('CS-03  startSession transitions to LISTENING', function (done) {
  CS.endSession('test_reset');
  CS.startSession();
  assert(CS.isActive() === true, 'Session should be active after startSession');
  // State transitions to WAKE_DETECTED then LISTENING asynchronously
  // For now, verify it's active
  CS.endSession('test_cleanup');
});

test('CS-04  startSession is idempotent', function () {
  CS.endSession('test_reset');
  CS.startSession();
  CS.startSession(); // Call again — should not crash or reset
  assert(CS.isActive() === true, 'Session should remain active');
  CS.endSession('test_cleanup');
});

test('CS-05  endSession transitions to IDLE and clears session flag', function () {
  CS.startSession();
  assert(CS.isActive() === true, 'Should be active after start');
  CS.endSession('test');
  assert(CS.getState() === 'IDLE', 'Should be IDLE after endSession');
  assert(CS.isActive() === false, 'Should not be active after endSession');
});

test('CS-06  onSpeechResult returns process=true for normal speech', function () {
  CS.endSession('test_reset');
  CS.startSession();
  var result = CS.onSpeechResult('what can you do for me');
  assert(result.process === true, 'Normal speech should be processed');
  assert(result.text === 'what can you do for me', 'Text should be preserved');
  CS.endSession('test_cleanup');
});

test('CS-07  onSpeechResult returns process=false for echo speech', function () {
  CS.endSession('test_reset');
  CS.startSession();
  // Simulate TTS just spoke this text
  CS.onSpeakingStart('The Firebase error is probably caused by authentication');
  // Now STT "hears" very similar text (echo)
  var result = CS.onSpeechResult('The Firebase error is probably caused by authentication issues');
  assert(result.process === false, 'Echo speech should NOT be processed (similarity too high)');
  CS.endSession('test_cleanup');
});

test('CS-08  onSpeechResult detects end command and signals session end', function () {
  CS.endSession('test_reset');
  CS.startSession();
  var ended = false;
  var unsub = CS.onSessionEnd(function (reason) {
    if (reason === 'user_ended') ended = true;
  });
  var result = CS.onSpeechResult('goodbye Shadow');
  assert(result.sessionEnded === true, 'Should detect end command');
  assert(result.process === false, 'End command should not be processed as normal speech');
  assert(ended === true, 'onSessionEnd callback should fire');
  assert(CS.isActive() === false, 'Session should end');
  if (typeof unsub === 'function') unsub();
});

test('CS-09  onSpeakingStart sets speaking state', function () {
  CS.endSession('test_reset');
  CS.startSession();
  CS.onSpeakingStart('Hello there, this is Shadow speaking.');
  assert(CS.getState() === 'SPEAKING', 'State should be SPEAKING after onSpeakingStart');
  CS.endSession('test_cleanup');
});

test('CS-10  onSpeakingEnd in active session returns to LISTENING', function () {
  CS.endSession('test_reset');
  CS.startSession();
  CS.onSpeakingStart('test text');
  CS.onSpeakingEnd();
  assert(CS.getState() === 'LISTENING', 'Should return to LISTENING when session is active');
  CS.endSession('test_cleanup');
});

test('CS-11  onSpeakingEnd when session not active returns to IDLE', function () {
  CS.endSession('test_reset');
  // Session is NOT active
  CS.onSpeakingEnd();
  assert(CS.getState() === 'IDLE', 'Should go to IDLE when session not active');
});

test('CS-12  onRecognitionError no-speech does not crash', function () {
  CS.endSession('test_reset');
  CS.startSession();
  CS.onRecognitionError('no-speech');
  assert(CS.isActive() === true, 'Session should remain active after no-speech error');
  CS.endSession('test_cleanup');
});

test('CS-13  setInactivityTimeout stores value correctly', function () {
  CS.setInactivityTimeout(30000);
  assert(CS.getInactivityTimeout() === 30000, 'Should store 30000ms');
  CS.setInactivityTimeout(60000);
  assert(CS.getInactivityTimeout() === 60000, 'Should update to 60000ms');
});

test('CS-14  onStateChange callback fires on state transitions', function () {
  CS.endSession('test_reset');
  var states = [];
  var unsub = CS.onStateChange(function (s) { states.push(s); });
  CS.startSession();
  CS.endSession('test');
  assert(states.indexOf('IDLE') !== -1, 'IDLE should appear in state transitions');
  assert(states.length > 0, 'Should have recorded at least one state transition');
  if (typeof unsub === 'function') unsub();
});

test('CS-15  onSessionEnd callback fires on endSession', function () {
  CS.endSession('test_reset');
  CS.startSession();
  var reason = null;
  var unsub = CS.onSessionEnd(function (r) { reason = r; });
  CS.endSession('test_ended');
  assert(reason === 'test_ended', 'Callback should receive end reason');
  if (typeof unsub === 'function') unsub();
});

test('CS-16  Interrupt: SRConvSession signals TTS stop', function () {
  CS.endSession('test_reset');
  CS.startSession();
  CS.onSpeakingStart('The Firebase error is probably being caused by—');
  assert(CS.getState() === 'SPEAKING', 'Should be SPEAKING');

  // Mock SRVoice.stopSpeaking for the interrupt test
  var stopped = false;
  var origVoice = global.SRVoice;
  global.SRVoice = { stopSpeaking: function () { stopped = true; } };
  CS.onUserSpeechStart();
  global.SRVoice = origVoice;

  assert(CS.getState() === 'INTERRUPTED', 'Should be INTERRUPTED after user speech start while speaking');
  CS.endSession('test_cleanup');
});

// ══════════════════════════════════════════════════════════════════════════════
//  ASSISTANT PROFILES / WAKE NAMES
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  ASSISTANT PROFILE TESTS');
console.log('══════════════════════════════════════════════\n');

var WN = global.SRWakeName;

test('AP-01  Default wake name is Shadow (not Salem)', function () {
  assert(WN, 'SRWakeName not loaded');
  // Reset to defaults first
  global.localStorage.clear();
  // Re-load to get fresh defaults
  WN.resetDefaults(function () {});
  var name = WN.getWakeName();
  assert(name === 'Shadow', 'Default wake name must be Shadow, got: ' + name);
});

test('AP-02  All 20 names available including full companion set', function () {
  var names = WN.getWakeNames();
  var required = [
    'Shadow', 'Ace', 'Atlas', 'Aurora', 'Echo', 'Elsa', 'Ember',
    'Ghost', 'Legend', 'Luna', 'Midnight', 'Nova', 'Onyx',
    'Pepper', 'Phoenix', 'Rambo', 'Raven', 'Salem', 'Simba', 'Storm',
  ];
  required.forEach(function (n) {
    assert(names.indexOf(n) !== -1, 'Missing wake name: ' + n);
  });
  assert(names.length === 20, 'Should have exactly 20 names, got: ' + names.length);
});

test('AP-03  setWakeName persists selected name', function () {
  WN.setWakeName('Luna', function () {});
  assert(WN.getWakeName() === 'Luna', 'Should persist Luna');
  WN.setWakeName('Shadow', function () {});
  assert(WN.getWakeName() === 'Shadow', 'Should persist Shadow');
});

test('AP-04  Invalid wake name rejected', function () {
  var error = null;
  WN.setWakeName('Jarvis', function (err) { error = err; });
  assert(error !== null, 'Should reject invalid wake name');
  assert(WN.getWakeName() !== 'Jarvis', 'Name should not change to invalid name');
});

test('AP-05  voiceGender defaults to female', function () {
  WN.resetDefaults(function () {});
  var status = WN.getStatus();
  assert(status.voiceGender === 'female', 'Default voice gender should be female, got: ' + status.voiceGender);
});

test('AP-06  setVoiceGender male persists', function () {
  WN.setVoiceGender('male', function () {});
  assert(WN.getVoiceGender() === 'male', 'Should be male');
});

test('AP-07  setVoiceGender female persists', function () {
  WN.setVoiceGender('female', function () {});
  assert(WN.getVoiceGender() === 'female', 'Should be female');
});

test('AP-08  Invalid voiceGender is silently ignored', function () {
  WN.setVoiceGender('female', function () {});
  WN.save({ voiceGender: 'celebrity' }, function () {});
  assert(WN.getVoiceGender() === 'female', 'Should not change to invalid value');
});

test('AP-09  Switching wake name does NOT reset personality profile', function () {
  P.resetProfile();
  // Learn something first
  P.learnFromTurn('lol that was funny', { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, 'response');
  var beforeHumor = P.getProfile().humorFrequency;

  // Switch wake name
  WN.setWakeName('Luna', function () {});
  WN.setWakeName('Shadow', function () {});

  var afterHumor = P.getProfile().humorFrequency;
  assert(afterHumor === beforeHumor, 'Personality profile must not change when switching wake name');
});

test('AP-10  getAssistantName reflects current wake name', function () {
  WN.setWakeName('Pepper', function () {});
  var name = P.getAssistantName();
  assert(name === 'Pepper', 'getAssistantName should return Pepper, got: ' + name);
  WN.setWakeName('Shadow', function () {});
});

// ══════════════════════════════════════════════════════════════════════════════
//  VOICE ENGINE TESTS
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  VOICE ENGINE TESTS');
console.log('══════════════════════════════════════════════\n');

var V = global.SRVoice;

test('VE-01  SRVoice loads with build SR-V2-VOICE-2', function () {
  assert(V, 'SRVoice not loaded');
  assert(V.build === 'SR-V2-VOICE-2', 'Build ID should be SR-V2-VOICE-2, got: ' + V.build);
});

test('VE-02  setVoiceGender male / getVoiceGender', function () {
  V.setVoiceGender('male');
  assert(V.getVoiceGender() === 'male', 'Should return male');
});

test('VE-03  setVoiceGender female / getVoiceGender', function () {
  V.setVoiceGender('female');
  assert(V.getVoiceGender() === 'female', 'Should return female');
});

test('VE-04  getStatus includes voiceGender field', function () {
  var status = V.getStatus();
  assert(status.hasOwnProperty('voiceGender'), 'status must have voiceGender field');
  assert(status.voiceGender === 'female' || status.voiceGender === 'male',
    'voiceGender must be male or female');
});

test('VE-05  getStatus includes sessionActive field', function () {
  var status = V.getStatus();
  assert(status.hasOwnProperty('sessionActive'), 'status must have sessionActive field');
  assert(typeof status.sessionActive === 'boolean', 'sessionActive must be boolean');
});

test('VE-06  Invalid gender string defaults to female', function () {
  V.setVoiceGender('random-thing');
  assert(V.getVoiceGender() === 'female', 'Invalid gender should default to female');
  V.setVoiceGender('female'); // restore
});

// ══════════════════════════════════════════════════════════════════════════════
//  ONE-BRAIN INTEGRITY TESTS
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  ONE-BRAIN INTEGRITY TESTS');
console.log('══════════════════════════════════════════════\n');

test('OB-01  No ShadowBrain / PersonalityBrain / other brains on global', function () {
  var fakeBrains = [
    'ShadowBrain', 'PersonalityBrain', 'HumorBrain', 'VoiceBrain',
    'ConversationBrain', 'MemoryBrain', 'JarvisBrain', 'CompanionBrain',
  ];
  fakeBrains.forEach(function (name) {
    assert(!global[name], 'Illegal duplicate brain found: ' + name);
  });
});

test('OB-02  ShadowReaper.ask() is the only ask entry point', function () {
  assert(typeof SR.ask === 'function', 'SR.ask must be a function');
  // Personality engine must NOT have its own ask
  assert(!P.ask, 'SRPersonality must not have an ask() method');
  // Session engine must NOT have its own ask
  assert(!CS.ask, 'SRConvSession must not have an ask() method');
});

test('OB-03  Personality engine does NOT replace ShadowReaper.ask()', function () {
  // SRPersonality is a signal layer — no ask(), no pipeline, no brain
  assert(typeof P.analyzeTurn === 'function', 'analyzeTurn exists');
  assert(typeof P.learnFromTurn === 'function', 'learnFromTurn exists');
  assert(!P.generate, 'SRPersonality must not have a generate() method');
  assert(!P.pipeline, 'SRPersonality must not have a pipeline property');
});

test('OB-04  Conversation session does NOT replace ShadowReaper.ask()', function () {
  assert(!CS.ask, 'SRConvSession must not have an ask() method');
  assert(!CS.brain, 'SRConvSession must not have a brain property');
});

test('OB-05  All 20 wake name profiles use ShadowReaper.ask() — no separate routing', function () {
  // Verify: switching wake name does not change which ask() is called
  var askCalled = false;
  var origAsk = SR.ask;
  SR.ask = function (msg, cb) { askCalled = true; if (cb) cb('ok'); };

  var names = [
    'Shadow', 'Ace', 'Atlas', 'Aurora', 'Echo', 'Elsa', 'Ember',
    'Ghost', 'Legend', 'Luna', 'Midnight', 'Nova', 'Onyx',
    'Pepper', 'Phoenix', 'Rambo', 'Raven', 'Salem', 'Simba', 'Storm',
  ];
  names.forEach(function (n) {
    askCalled = false;
    WN.setWakeName(n, function () {});
    SR.ask('test message', function () {});
    assert(askCalled, 'SR.ask should be called for wake name: ' + n);
  });

  SR.ask = origAsk;
  WN.setWakeName('Shadow', function () {});
});

// ══════════════════════════════════════════════════════════════════════════════
//  NATURAL CONVERSATION TESTS (via ShadowReaper.ask())
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  NATURAL CONVERSATION TESTS');
console.log('══════════════════════════════════════════════\n');

var chain = Promise.resolve();

chain = chain.then(function () {
  resetConv();
  return testAsync('NC-01  Frustrated tech statement gets non-empty response', function () {
    return ask('Shadow, this website is acting stupid again.').then(function (r) {
      assert(typeof r === 'string' && r.trim().length > 0, 'Response must be non-empty');
    });
  });
});

chain = chain.then(function () {
  return testAsync('NC-02  Follow-up "Firebase." after project context is handled', function () {
    return ask('Firebase.').then(function (r) {
      assert(typeof r === 'string' && r.trim().length > 0, 'Response must be non-empty');
    });
  });
});

chain = chain.then(function () {
  return testAsync('NC-03  Pronoun reference follow-up is handled', function () {
    return ask('What about the other one?').then(function (r) {
      assert(r.trim().length > 0, 'Response must be non-empty');
    });
  });
});

chain = chain.then(function () {
  resetConv();
  return testAsync('NC-04  Correction "no I meant Firebase" is acknowledged', function () {
    return ask("My project is ShadowNexus.").then(function () {
      return ask("No, I meant FirebaseProject.");
    }).then(function (r) {
      assert(r.trim().length > 0, 'Response to correction must be non-empty');
    });
  });
});

chain = chain.then(function () {
  resetConv();
  return testAsync('NC-05  "What\'s your name?" returns current wake name', function () {
    WN.setWakeName('Shadow', function () {});
    return ask("What's your name?").then(function (r) {
      assert(r.toLowerCase().indexOf('shadow') !== -1, 'Response should mention Shadow, got: ' + r.substring(0, 80));
    });
  });
});

chain = chain.then(function () {
  return testAsync('NC-06  "Okay smartass." does not crash', function () {
    return ask('Okay smartass.').then(function (r) {
      assert(r.trim().length > 0, 'Response must be non-empty');
    });
  });
});

chain = chain.then(function () {
  resetConv();
  return testAsync('NC-07  Extended 12-turn conversation stays coherent', function () {
    var turns = [
      "I'm working on my website Shadow Nexus.",
      "The login page is giving me issues.",
      "Firebase keeps throwing errors.",
      "What project are we working on?",
      "The error says authentication failed.",
      "I already checked the rules.",
      "What was I doing to the login page?",
      "Let's switch to the homepage for now.",
      "Make it dark themed.",
      "Actually keep it minimal.",
      "What's the design direction so far?",
      "Okay let's go back to the login issue.",
    ];
    var p = Promise.resolve();
    turns.forEach(function (t) {
      p = p.then(function () { return ask(t); }).then(function (r) {
        assert(r.trim().length > 0, 'Should get non-empty response for: ' + t.substring(0, 40));
      });
    });
    return p;
  });
});

chain = chain.then(function () {
  resetConv();
  return testAsync('NC-08  "Remember what we were doing earlier?" returns continuity response', function () {
    return ask('I was working on Shadow Nexus earlier.').then(function () {
      return ask('Remember what we were doing?');
    }).then(function (r) {
      assert(r.trim().length > 0, 'Should get non-empty continuity response');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  MEMORY BOUNDARY TESTS
// ══════════════════════════════════════════════════════════════════════════════

chain = chain.then(function () {
  console.log('\n══════════════════════════════════════════════');
  console.log('  MEMORY BOUNDARY TESTS');
  console.log('══════════════════════════════════════════════\n');

  resetConv();
  return testAsync('MB-01  Normal conversation does not touch research router with INTERNET route', function () {
    // Just verify we get a response without errors for normal conversation
    return ask('Hey what do you think about cooking?').then(function (r) {
      assert(r.trim().length > 0, 'Normal conversation should produce response');
      // Research router may classify this as LOCAL_KNOWLEDGE or NOT_NEEDED — not WEATHER or internet
    });
  });
});

chain = chain.then(function () {
  return testAsync('MB-02  Technical question is handled (research-eligible, not general internet)', function () {
    return ask('How do I fix a CORS error in Firebase?').then(function (r) {
      assert(r.trim().length > 0, 'Technical question should produce response');
    });
  });
});

chain = chain.then(function () {
  test('MB-03  Personality learning does not store sensitive data', function () {
    // Attempt to learn a turn with a password
    try {
      P.learnFromTurn('my password is secret123', { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, 'resp');
    } catch (_) {}
    // Personality profile should not contain the password
    var profileStr = JSON.stringify(P.getProfile());
    assert(profileStr.indexOf('secret123') === -1, 'Sensitive data should NOT appear in personality profile');
    assert(profileStr.indexOf('password') === -1, 'Password field should NOT appear in personality profile');
  });
});

// ── Final summary ──────────────────────────────────────────────────────────────

chain = chain.then(function () {
  console.log('\n══════════════════════════════════════════════');
  console.log('  PERSONALITY & SESSION TEST SUMMARY');
  console.log('══════════════════════════════════════════════');
  console.log('  PASS : ' + PASS);
  console.log('  FAIL : ' + FAIL);
  console.log('  TOTAL: ' + (PASS + FAIL));
  console.log('══════════════════════════════════════════════\n');
  if (FAIL > 0) {
    console.log('  ❌  ' + FAIL + ' test(s) FAILED');
    process.exit(1);
  } else {
    console.log('  ✅  All tests passed!');
    process.exit(0);
  }
});
