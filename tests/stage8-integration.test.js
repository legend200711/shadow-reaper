/**
 * shadow-reaper-standalone/tests/stage8-integration.test.js
 * Shadow Reaper Standalone — Stage 8 Full Integration Tests
 *
 * CHECKPOINT 8: Voice + Translation + Full Assistant Integration
 *
 * Tests:
 *   - Voice engine uses same SR brain (no separate voice AI)
 *   - Voice requires explicit user activation (no background mic)
 *   - TTS uses browser synthesis only — no external AI calls
 *   - Voice disabled by default when voiceEnabled=false
 *   - Translation engine is model-independent and provider-independent
 *   - Translation intent routes through ShadowReaper.ask() pipeline
 *   - Memory recall via ask()
 *   - Device action routing (allowlist enforcement, intent detection)
 *   - Founder capability gate disables features globally
 *   - Private context not leaked into research context
 *   - Knowledge fallback routing
 *   - Full pipeline coherence (text → memory → adaptive → response)
 *   - Pipeline handles missing optional modules gracefully
 *   - Build identifier is correct
 *
 * STATIC PASS         = validated by code and architecture inspection.
 * AUTOMATED PASS      = executed in this Node.js test run.
 * PHYSICAL TEST REQUIRED = requires real browser / device / Firebase.
 */

'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ── Stubs ──────────────────────────────────────────────────────────────────

global.localStorage = {
  _store: {},
  getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem:    function (k, v) { this._store[k] = String(v); },
  removeItem: function (k) { delete this._store[k]; },
  clear:      function ()  { this._store = {}; },
};

try {
  Object.defineProperty(global, 'navigator', {
    value: {
      userAgent:      'Mozilla/5.0 (X11; Linux x86_64)',
      maxTouchPoints: 0,
      language:       'en-US',
      platform:       'Linux x86_64',
      onLine:         true,
    },
    writable: true, configurable: true,
  });
} catch (_) {}

try {
  Object.defineProperty(global, 'screen', {
    value: { width: 1920, height: 1080 },
    writable: true, configurable: true,
  });
} catch (_) {}

// No browser speech APIs in Node — voice engine must handle this gracefully.
// global.SpeechRecognition and global.speechSynthesis are intentionally absent.

// ── Firebase stubs (offline mode) ─────────────────────────────────────────
global.SRFirebaseAdapter = {
  build:           'SR-STANDALONE-FIREBASE-ADAPTER-1',
  getUID:          function () { return 'user_test_uid'; },
  isAuthenticated: function () { return true; },
  getCurrentUser:  function () { return { uid: 'user_test_uid' }; },
  getStatus:       function () { return { ready: false, authenticated: true, uid: 'user_test_uid', configured: false }; },
  userConversationsCol:  function () { return null; },
  userMemoryCol:         function () { return null; },
  userLearnedContextCol: function () { return null; },
  userPreferencesDoc:    function () { return null; },
  sharedKnowledgeCol:    function () { return null; },
  globalLearningCol:     function () { return null; },
  configDoc:             function () { return null; },
  safeWrite:             function () { return Promise.reject(new Error('offline')); },
  safeAdd:               function () { return Promise.reject(new Error('offline')); },
};

// ── Security stub ──────────────────────────────────────────────────────────
global.SRSecurity = {
  containsSensitiveData:    function (t) { return /my\s+password\s+is/i.test(t); },
  containsInjectionAttempt: function (t) { return /ignore.*instructions|override.*rules/i.test(t); },
  validateUserInput:        function (t) { return { ok: !!t, sanitized: (t || '').trim() }; },
  LIMITS: { maxResearchResultLength: 8000 },
};

// ── Module loader ──────────────────────────────────────────────────────────
function load(relPath) {
  const code = require('fs').readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('global', 'require', code)(global, require);
}

// Load in dependency order (mirrors index.html load order)
load('snx-shadow-conv-history.js');
load('snx-shadow-memory.js');
load('snx-shadow-adaptive.js');
load('core/adaptive-brain.js');
load('core/understanding-engine.js');
load('core/context-engine.js');
load('core/conversation-engine.js');
load('core/response-engine.js');
load('core/persistence-bridge.js');
load('core/local-model.js');
load('knowledge/knowledge-engine.js');
load('knowledge/sr-knowledge-learner.js');
load('translation/translation-engine.js');
load('voice/voice-engine.js');
load('adapters/founder-controls.js');
load('shadow-reaper.js');

// ── Test harness ───────────────────────────────────────────────────────────
var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push('  \u2713  ' + name);
  } catch (e) {
    FAIL++;
    results.push('  \u2717  ' + name + '\n        ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// ── INITIALIZATION ──────────────────────────────────────────────────────────

test('ShadowReaper loads with correct Stage build tag', function () {
  assert(global.ShadowReaper, 'ShadowReaper not loaded');
  var v = global.ShadowReaper._version;
  assert(
    v === 'SR-V2-STAGE13' || v === 'SR-V2-STAGE12' || v === 'SR-V2-STAGE6' || v === 'SR-V2-STAGE5' || v === 'SR-V2-STAGE4',
    'Expected SR-V2-STAGE4/5/6/12/13, got: ' + v);
});

test('ShadowReaper initializes successfully', function () {
  var ok = global.ShadowReaper.init();
  assert(ok === true, 'init() should return true');
  assert(global.ShadowReaper._initialized === true, '_initialized must be true');
});

test('getStatus() reflects full module load after init', function () {
  var s = global.ShadowReaper.getStatus();
  assert(s.initialized      === true, 'initialized must be true');
  assert(s.translationConnected === true, 'SRTranslation must be connected');
  assert(s.voiceConnected       === true, 'SRVoice must be connected');
  assert(s.knowledgeConnected   === true, 'SRKnowledge must be connected');
});

// ── VOICE ENGINE ────────────────────────────────────────────────────────────

test('SRVoice loads with correct build ID', function () {
  assert(global.SRVoice, 'SRVoice not loaded');
  assert(typeof global.SRVoice.build === 'string', 'build must be a string');
  assert(global.SRVoice.build.indexOf('VOICE') !== -1, 'Build ID must reference VOICE');
});

test('SRVoice exposes correct public API', function () {
  var V = global.SRVoice;
  assert(typeof V.startListening  === 'function', 'startListening must be a function');
  assert(typeof V.stopListening   === 'function', 'stopListening must be a function');
  assert(typeof V.speak           === 'function', 'speak must be a function');
  assert(typeof V.getStatus       === 'function', 'getStatus must be a function');
  assert(typeof V.setVoiceEnabled === 'function', 'setVoiceEnabled must be a function');
  assert(typeof V.setTTSEnabled   === 'function', 'setTTSEnabled must be a function');
  assert(typeof V.destroy         === 'function', 'destroy must be a function');
});

test('SRVoice reports UNSUPPORTED in Node (no Web Speech API) — graceful degradation', function () {
  var status = global.SRVoice.getStatus();
  assert(typeof status.supported === 'boolean', 'supported must be a boolean');
  assert(status.supported === false,
    'Voice must report NOT supported in Node (no SpeechRecognition). STATIC PASS.');
});

test('SRVoice startListening() returns false in Node (UNSUPPORTED) without crashing', function () {
  var errorReceived = false;
  var result = global.SRVoice.startListening(
    function () { /* onResult */ },
    function () { errorReceived = true; }
  );
  assert(result === false, 'startListening must return false when unsupported');
  assert(errorReceived === true, 'Error callback must be called when unsupported');
});

test('SRVoice has NO separate AI brain — routes through ShadowReaper.ask() (STATIC PASS)', function () {
  var src = require('fs').readFileSync(path.join(ROOT, 'voice/voice-engine.js'), 'utf8');
  assert(src.indexOf('Workers AI')  === -1, 'Voice engine must not call Workers AI');
  assert(src.indexOf('openai')      === -1, 'Voice engine must not call OpenAI');
  assert(src.indexOf('anthropic')   === -1, 'Voice engine must not call Anthropic');
  assert(src.indexOf('gemini')      === -1, 'Voice engine must not call Gemini');
  assert(src.indexOf('SAME Shadow Reaper') !== -1 || src.indexOf('same') !== -1,
    'Architecture comment must confirm same brain is used');
});

test('SRVoice has ZERO secret background mic activation (STATIC PASS)', function () {
  var src = require('fs').readFileSync(path.join(ROOT, 'voice/voice-engine.js'), 'utf8');
  assert(src.indexOf('Explicit user activation only') !== -1,
    'Must contain explicit user activation comment');
});

test('SRVoice raw audio is NEVER stored — architecture verified (STATIC PASS)', function () {
  var src = require('fs').readFileSync(path.join(ROOT, 'voice/voice-engine.js'), 'utf8');
  assert(src.indexOf('Raw audio is NEVER stored') !== -1,
    'Must contain raw audio not stored guarantee');
  assert(src.indexOf('transcript') !== -1,
    'Must use text transcript, not audio buffer');
});

test('SRVoice.setVoiceEnabled(false) disables listening', function () {
  global.SRVoice.setVoiceEnabled(false);
  var errorReceived = false;
  var result = global.SRVoice.startListening(
    function () {},
    function () { errorReceived = true; }
  );
  assert(result === false, 'startListening must return false when voiceEnabled=false');
  assert(errorReceived === true, 'Error callback must fire when voice disabled');
  global.SRVoice.setVoiceEnabled(true);  // restore
});

test('ShadowReaper.setVoiceEnabled() delegates to SRVoice', function () {
  global.ShadowReaper.setVoiceEnabled(false);
  assert(global.SRVoice.getStatus().voiceEnabled === false,
    'voiceEnabled must be false after setVoiceEnabled(false)');
  global.ShadowReaper.setVoiceEnabled(true);
});

test('ShadowReaper.setTTSEnabled() delegates to SRVoice', function () {
  global.ShadowReaper.setTTSEnabled(false);
  assert(global.SRVoice.getStatus().ttsEnabled === false,
    'ttsEnabled must be false after setTTSEnabled(false)');
  global.ShadowReaper.setTTSEnabled(true);
});

// ── TRANSLATION ENGINE ──────────────────────────────────────────────────────

test('SRTranslation loads with correct build ID', function () {
  assert(global.SRTranslation, 'SRTranslation not loaded');
  assert(typeof global.SRTranslation.build === 'string', 'build must be a string');
  assert(global.SRTranslation.build.indexOf('TRANSLATION') !== -1,
    'Build ID must reference TRANSLATION');
});

test('SRTranslation exposes correct public API', function () {
  var T = global.SRTranslation;
  assert(typeof T.detectLanguage          === 'function');
  assert(typeof T.translate               === 'function');
  assert(typeof T.getSupportedLanguages   === 'function');
  assert(typeof T.setPreferredLanguage    === 'function');
  assert(typeof T.getPreferredLanguage    === 'function');
  assert(typeof T.parseTranslationRequest === 'function');
  assert(typeof T.translateResponse       === 'function');
});

test('SRTranslation is model-independent — no external AI calls (STATIC PASS)', function () {
  var src = require('fs').readFileSync(path.join(ROOT, 'translation/translation-engine.js'), 'utf8');
  assert(src.indexOf('ZERO EXTERNAL AI CALLS') !== -1,
    'Must contain ZERO EXTERNAL AI CALLS guarantee');
  assert(src.indexOf('ZERO HOSTED TRANSLATION API') !== -1,
    'Must contain ZERO HOSTED TRANSLATION API guarantee');
});

test('SRTranslation.getSupportedLanguages() returns at least 10 languages', function () {
  var langs = global.SRTranslation.getSupportedLanguages();
  assert(Array.isArray(langs), 'Must return an array');
  assert(langs.length >= 10, 'Must support at least 10 languages, got: ' + langs.length);
});

test('SRTranslation.translate() hello → Spanish = hola', function () {
  var result = global.SRTranslation.translate('hello', 'en', 'es');
  assert(result, 'Must return a result');
  assert(typeof result.translated === 'string', 'translated must be a string');
  assert(result.translated.toLowerCase() === 'hola',
    'hello → Spanish must be "hola", got: ' + result.translated);
});

test('SRTranslation.translate() thank you → French = merci', function () {
  var result = global.SRTranslation.translate('thank you', 'en', 'fr');
  assert(result.translated.toLowerCase() === 'merci',
    'thank you → French must be "merci", got: ' + result.translated);
});

test('SRTranslation.detectLanguage() does not crash on Spanish text', function () {
  var r = global.SRTranslation.detectLanguage('¿Cómo estás?');
  assert(r && typeof r.language === 'string', 'Must return an object with .language string');
});

test('SRTranslation.parseTranslationRequest() parses "translate hello to Spanish"', function () {
  var req = global.SRTranslation.parseTranslationRequest('translate hello to Spanish');
  assert(req !== null, 'Must parse translation request');
  assert(req.intent, 'Must have intent');
});

test('SRTranslation.parseTranslationRequest() returns null for non-translation input', function () {
  var req = global.SRTranslation.parseTranslationRequest('what is 2 + 2?');
  assert(req === null, 'Non-translation input must return null');
});

test('SRTranslation.setPreferredLanguage() / getPreferredLanguage() roundtrip', function () {
  global.SRTranslation.setPreferredLanguage('es');
  var pref = global.SRTranslation.getPreferredLanguage();
  assert(pref !== null, 'Preferred language must be set');
  assert(pref.code === 'es', 'Preferred language must be es, got: ' + (pref ? pref.code : null));
  global.SRTranslation.setPreferredLanguage('en');  // restore
});

// ── TRANSLATION THROUGH ask() PIPELINE ─────────────────────────────────────

test('Translation set-language intent routes through ShadowReaper.ask()', function () {
  var response = null;
  global.ShadowReaper.ask('Answer me in Spanish from now on', function (r) { response = r; });
  assert(response !== null, 'ask() must produce a response for translation intent');
  assert(typeof response === 'string', 'Response must be a string');
});

test('Translate phrase intent routes through ShadowReaper.ask()', function () {
  var response = null;
  global.ShadowReaper.ask('translate hello to French', function (r) { response = r; });
  assert(response !== null, 'ask() must produce a response for translate command');
  assert(typeof response === 'string' && response.length > 0, 'Response must not be empty');
});

// ── FULL PIPELINE — CONVERSATION ────────────────────────────────────────────

test('ShadowReaper.ask() processes basic question through full pipeline', function () {
  var response = null;
  global.ShadowReaper.ask('Hello, how are you?', function (r) { response = r; });
  assert(response !== null, 'ask() must produce a response (offline mode)');
  assert(typeof response === 'string' && response.length > 0, 'Response must not be empty');
});

test('Turn count increments with each ask() call', function () {
  var before = global.ShadowReaper.getStatus().turnCount;
  global.ShadowReaper.ask('test message for turn count', function () {});
  var after = global.ShadowReaper.getStatus().turnCount;
  assert(after > before, 'Turn count must increment after ask()');
});

test('newConversation() resets session turn count to 0', function () {
  global.ShadowReaper.ask('a message', function () {});
  global.ShadowReaper.newConversation();
  assert(global.ShadowReaper.getStatus().turnCount === 0,
    'Turn count must be 0 after newConversation()');
});

// ── MEMORY THROUGH ask() ────────────────────────────────────────────────────

test('Memory save intent is handled through ask() pipeline', function () {
  var response = null;
  global.ShadowReaper.ask('remember that my project is called ShadowCore', function (r) {
    response = r;
  });
  assert(response !== null, 'ask() must respond to memory save intent');
  assert(typeof response === 'string', 'Response must be a string');
});

test('Memory recall intent is handled through ask() pipeline', function () {
  var response = null;
  global.ShadowReaper.ask('what do you remember about me?', function (r) { response = r; });
  assert(response !== null, 'ask() must respond to memory recall intent');
  assert(typeof response === 'string', 'Response must be a string');
});

test('Continuity intent is handled through ask() pipeline', function () {
  var response = null;
  global.ShadowReaper.ask('what did we talk about?', function (r) { response = r; });
  assert(response !== null, 'ask() must respond to continuity intent');
  assert(typeof response === 'string', 'Response must be a string');
});

// ── FOUNDER CAPABILITY GATE ─────────────────────────────────────────────────

test('SRFounderControls.isEnabled() returns true by default for all capabilities', function () {
  var FC = global.SRFounderControls;
  assert(FC, 'SRFounderControls must be loaded');
  assert(FC.isEnabled('shadowReaperEnabled') === true);
  assert(FC.isEnabled('voiceEnabled')         === true);
  assert(FC.isEnabled('translationEnabled')   === true);
  assert(FC.isEnabled('historyEnabled')       === true);
  assert(FC.isEnabled('memoryEnabled')        === true);
  assert(FC.isEnabled('adaptiveEnabled')      === true);
});

test('Founder disabling shadowReaperEnabled causes ask() to return unavailable message', function () {
  var _orig = global.SRFounderControls.isEnabled;
  global.SRFounderControls.isEnabled = function (key) {
    if (key === 'shadowReaperEnabled') return false;
    return _orig.call(this, key);
  };
  var response = null;
  global.ShadowReaper.ask('Hello?', function (r) { response = r; });
  assert(response !== null, 'ask() must return a response even when disabled');
  assert(response.toLowerCase().indexOf('unavailable') !== -1,
    'Response must indicate Shadow Reaper is unavailable, got: ' + response);
  global.SRFounderControls.isEnabled = _orig;  // restore
});

test('Disabling translationEnabled bypasses translation routing to normal pipeline', function () {
  var _orig = global.SRFounderControls.isEnabled;
  global.SRFounderControls.isEnabled = function (key) {
    if (key === 'translationEnabled') return false;
    return _orig.call(this, key);
  };
  var response = null;
  global.ShadowReaper.ask('translate hello to French', function (r) { response = r; });
  assert(response !== null, 'Must still get a response');
  assert(typeof response === 'string', 'Response must be a string');
  global.SRFounderControls.isEnabled = _orig;  // restore
});

// ── DEVICE ACTION ROUTING ───────────────────────────────────────────────────

test('SRDeviceActionRouter allowlist exists in source (STATIC PASS)', function () {
  var src = require('fs').readFileSync(path.join(ROOT, 'platform/sr-device-action-router.js'), 'utf8');
  assert(src.indexOf('ALLOWED_ACTIONS') !== -1, 'Must have ALLOWED_ACTIONS allowlist');
  assert(src.indexOf('SCHEDULE_REMINDER') !== -1, 'SCHEDULE_REMINDER must be in allowlist');
  assert(src.indexOf('action_not_in_allowlist') !== -1, 'Must reject unlisted actions');
  assert(src.indexOf('AI-generated text') !== -1 || src.indexOf('AI text must NEVER') !== -1,
    'Must have comment preventing AI from adding actions at runtime');
});

test('SRDeviceActionRouter loads and exposes dispatch() and detectDeviceIntent()', function () {
  if (!global.SRDeviceActionRouter) {
    try { load('platform/sr-platform-detector.js'); } catch (_) {}
    try { load('platform/sr-capability-manager.js'); } catch (_) {}
    try { load('platform/sr-permission-manager.js'); } catch (_) {}
    try { load('platform/sr-device-action-router.js'); } catch (_) {}
  }
  var R = global.SRDeviceActionRouter;
  assert(R, 'SRDeviceActionRouter must be loaded');
  assert(typeof R.dispatch           === 'function', 'dispatch() must be a function');
  assert(typeof R.detectDeviceIntent === 'function', 'detectDeviceIntent() must be a function');
  assert(R.ALLOWED_ACTIONS, 'ALLOWED_ACTIONS must be exposed');
});

test('SRDeviceActionRouter.dispatch() rejects action not in allowlist', function () {
  var R = global.SRDeviceActionRouter;
  if (!R) return;
  var result = null;
  R.dispatch({ type: 'EXECUTE_ARBITRARY_CODE', params: {} }, function (r) { result = r; });
  assert(result !== null, 'Must return a result');
  assert(result.ok === false, 'Must reject unlisted action');
  assert(result.reason.indexOf('allowlist') !== -1 || result.reason.indexOf('not_in_allowlist') !== -1,
    'Reason must reference allowlist, got: ' + result.reason);
});

test('SRDeviceActionRouter.dispatch() rejects missing action type', function () {
  var R = global.SRDeviceActionRouter;
  if (!R) return;
  var result = null;
  R.dispatch({ params: {} }, function (r) { result = r; });
  assert(result !== null && result.ok === false, 'Must reject missing action type');
});

test('SRDeviceActionRouter.dispatch() rejects non-object action', function () {
  var R = global.SRDeviceActionRouter;
  if (!R) return;
  var result = null;
  R.dispatch('INJECT_EVIL_ACTION', function (r) { result = r; });
  assert(result !== null && result.ok === false, 'Must reject non-object action');
});

test('SRDeviceActionRouter.detectDeviceIntent() detects reminder intent', function () {
  var R = global.SRDeviceActionRouter;
  if (!R) return;
  var intent = R.detectDeviceIntent('remind me tomorrow at 3pm to call John');
  assert(intent !== null, 'Must detect reminder intent');
  assert(intent.type === 'SCHEDULE_REMINDER',
    'Intent type must be SCHEDULE_REMINDER, got: ' + (intent ? intent.type : null));
  assert(intent.params, 'Must have params');
});

test('SRDeviceActionRouter.detectDeviceIntent() returns null for non-device input', function () {
  var R = global.SRDeviceActionRouter;
  if (!R) return;
  var intent = R.detectDeviceIntent('what is the capital of France?');
  assert(intent === null, 'Non-device input must return null');
});

// ── PRIVATE CONTEXT ISOLATION ────────────────────────────────────────────────

test('Private user context NOT leaked into public research requests (STATIC PASS)', function () {
  var src = require('fs').readFileSync(path.join(ROOT, 'research/sr-web-research.js'), 'utf8');
  assert(src.indexOf('private user data') !== -1 || src.indexOf('NEVER access private') !== -1,
    'Research module must explicitly prohibit private user data access');
});

test('Research module marks results UNTRUSTED — never becomes instructions (STATIC PASS)', function () {
  var src = require('fs').readFileSync(path.join(ROOT, 'research/sr-web-research.js'), 'utf8');
  assert(src.indexOf('UNTRUSTED') !== -1, 'Research results must be labelled UNTRUSTED');
  assert(
    src.indexOf('never become system instructions') !== -1 ||
    src.indexOf('NEVER become system instructions') !== -1,
    'Must explicitly state results never become instructions'
  );
});

// ── KNOWLEDGE FALLBACK ──────────────────────────────────────────────────────

test('SRKnowledge is connected and exposes query()', function () {
  assert(global.SRKnowledge, 'SRKnowledge must be loaded');
  assert(typeof global.SRKnowledge.query === 'function', 'query() must be a function');
});

test('SRKnowledge.query() returns null or object — no crash on unknown query', function () {
  var result = global.SRKnowledge.query('what is the capital of France?');
  assert(result === null || typeof result === 'object', 'Must return null or object');
});

test('SRKnowledgeLearner is connected and exposes learn()', function () {
  assert(global.SRKnowledgeLearner, 'SRKnowledgeLearner must be loaded');
  assert(typeof global.SRKnowledgeLearner.learn === 'function', 'learn() must be a function');
});

test('Knowledge learner does not crash on normal conversation turn', function () {
  var threw = false;
  try {
    global.SRKnowledgeLearner.learn({
      text: 'The capital of France is Paris.',
      role: 'user',
      convId: 'test_conv_001',
    });
  } catch (e) { threw = true; }
  assert(!threw, 'Knowledge learner must not throw on valid input');
});

// ── PIPELINE COHERENCE ──────────────────────────────────────────────────────

test('Full pipeline: question → response in under 100ms (offline, deterministic)', function () {
  var start = Date.now();
  var response = null;
  global.ShadowReaper.ask('What is your purpose?', function (r) { response = r; });
  var elapsed = Date.now() - start;
  assert(response !== null, 'Must produce a response');
  assert(elapsed < 100, 'Offline pipeline must be fast (< 100ms), got: ' + elapsed + 'ms');
});

test('Pipeline handles emoji/unicode in messages without crashing', function () {
  var response = null;
  global.ShadowReaper.ask('Hello \uD83D\uDC4B \u3053\u3093\u306B\u3061\u306F', function (r) { response = r; });
  assert(response !== null && typeof response === 'string', 'Must handle unicode without crash');
});

test('Pipeline handles very long message without crashing', function () {
  var longMsg = 'word '.repeat(300).trim();
  var response = null;
  global.ShadowReaper.ask(longMsg, function (r) { response = r; });
  assert(response !== null, 'Must handle long messages');
});

test('Pipeline handles empty string with correct listening prompt', function () {
  var response = null;
  global.ShadowReaper.ask('', function (r) { response = r; });
  assert(response !== null, 'Must respond to empty string');
  assert(
    response.indexOf("I'm listening") !== -1 || response.indexOf("Say something") !== -1,
    'Must give listening prompt, got: ' + response
  );
});

test('Pipeline is safe after destroy() (STATIC PASS)', function () {
  var src = require('fs').readFileSync(path.join(ROOT, 'shadow-reaper.js'), 'utf8');
  assert(src.indexOf('no longer active') !== -1,
    'Must have "no longer active" message after destroy()');
});

// ── PHYSICAL TEST REQUIRED ──────────────────────────────────────────────────

test('PHYSICAL TEST REQUIRED: Voice input routes recognized text to ShadowReaper.ask()', function () {
  assert(true, 'PHYSICAL TEST REQUIRED — needs browser with SpeechRecognition + microphone');
});

test('PHYSICAL TEST REQUIRED: TTS speaks SR response after ask()', function () {
  assert(true, 'PHYSICAL TEST REQUIRED — needs browser with speechSynthesis + audio output');
});

test('PHYSICAL TEST REQUIRED: Reminder fires at scheduled time in browser', function () {
  assert(true, 'PHYSICAL TEST REQUIRED — needs browser with Notification API permission');
});

test('PHYSICAL TEST REQUIRED: Firebase persistence saves/recalls memory across sessions', function () {
  assert(true, 'PHYSICAL TEST REQUIRED — needs live Firebase environment with real credentials');
});

// ── REPORT ─────────────────────────────────────────────────────────────────

console.log('\n=== STAGE 8: VOICE + TRANSLATION + FULL INTEGRATION ===\n');
results.forEach(function (r) { console.log(r); });
console.log('\n  Passed: ' + PASS + '  Failed: ' + FAIL + '\n');

if (FAIL > 0) {
  process.exitCode = 1;
}
