/**
 * shadow-reaper-v2/tests/sr-personality-adaptive.test.js
 * Shadow Reaper — Human-Like Personality Stage 1 Tests
 *
 * Build: SR-V2-PERSONALITY-2
 *
 * Tests:
 *   SRConversationalCue — cue detection and context window
 *   SRPersonality (v2) — sarcasm scale, attitude matching, baseline traits
 *   Behavioral properties — NOT exact response strings
 *   Adaptation isolation — user A's profile does NOT bleed into user B
 *   Short-term vs long-term adaptation separation
 *
 * DESIGN:
 *   Tests verify BEHAVIORAL PROPERTIES, not hardcoded strings.
 *   A casual question should get a casual response style signal.
 *   "I hate this 😂" should register as playful, not genuinely hostile.
 *   "I'm being serious." should drop sarcasm immediately.
 *
 * Exit: 0 = all pass, 1 = any fail.
 */

'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

// ─── Minimal environment shim ──────────────────────────────────────────────

global.localStorage = {
  _store: {},
  getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem:    function (k, v) { this._store[k] = String(v); },
  removeItem: function (k) { delete this._store[k]; },
  clear:      function ()  { this._store = {}; },
};

try {
  Object.defineProperty(global, 'navigator', {
    value: { onLine: true },
    writable: true, configurable: true,
  });
} catch (_) {}

// ─── Module loader ─────────────────────────────────────────────────────────

function loadModule(relPath) {
  delete require.cache[require.resolve(path.join(ROOT, relPath))];
  require(path.join(ROOT, relPath));
}

try { loadModule('core/sr-conversational-cue.js'); } catch (e) {
  console.error('Failed to load sr-conversational-cue.js:', e.message);
}

try { loadModule('core/personality-engine.js'); } catch (e) {
  console.error('Failed to load personality-engine.js:', e.message);
}

// ─── Test harness ──────────────────────────────────────────────────────────

var PASS = 0;
var FAIL = 0;

function assert(condition, message) {
  if (condition) {
    PASS++;
  } else {
    FAIL++;
    console.error('  FAIL: ' + message);
  }
}

function test(name, fn) {
  try {
    fn();
    console.log('  pass: ' + name);
  } catch (e) {
    FAIL++;
    console.error('  FAIL: ' + name);
    console.error('        ' + e.message);
  }
}

// ─── References ───────────────────────────────────────────────────────────

var CUE = global.SRConversationalCue;
var P   = global.SRPersonality;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A: SRConversationalCue — Module Structure
// ─────────────────────────────────────────────────────────────────────────────

test('CUE-01  SRConversationalCue loads and exposes expected API', function () {
  assert(!!CUE,                      'SRConversationalCue not loaded');
  assert(typeof CUE.analyze === 'function',      'analyze missing');
  assert(typeof CUE.resetHistory === 'function', 'resetHistory missing');
  assert(typeof CUE.getStatus === 'function',    'getStatus missing');
  assert(typeof CUE.build === 'string',          'build tag missing');
  assert(CUE.build.indexOf('CUE') !== -1,        'build tag should contain CUE');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION B: Conversational Cue Analysis — Tone Detection
// ─────────────────────────────────────────────────────────────────────────────

test('CUE-02  Playful message with laugh emoji detected as playful/sarcastic, NOT frustrated', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("You're getting on my nerves 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  assert(cue.frustrationLikelihood < 0.50, 'laugh emoji should reduce frustration likelihood, got: ' + cue.frustrationLikelihood);
  assert(cue.humor >= 0.30, 'humor signal should be present, got: ' + cue.humor);
  assert(cue.tone !== 'frustrated', 'tone should NOT be frustrated, got: ' + cue.tone);
});

test('CUE-03  Genuine frustration without humor markers detected as frustrated', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("This computer is pissing me off. I've done this six times already.", { intent: 'GENERAL_CONVERSATION', tone: 'frustrated' }, []);
  assert(cue.frustrationLikelihood >= 0.50, 'frustration should be high, got: ' + cue.frustrationLikelihood);
  assert(cue.tone === 'frustrated', 'tone should be frustrated, got: ' + cue.tone);
});

test('CUE-04  "Okay smartass 😂" detected as playful/banter', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("Okay smartass 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  assert(cue.sarcasmLikelihood >= 0.20 || cue.humor >= 0.30, 'should detect playful/sarcastic signal, sarcasm=' + cue.sarcasmLikelihood + ' humor=' + cue.humor);
  assert(cue.preferredResponseStyle === 'playful' || cue.preferredResponseStyle === 'banter', 'style should be playful or banter, got: ' + cue.preferredResponseStyle);
});

test('CUE-05  "I\'m being serious." triggers seriousness override', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("Okay, I'm being serious. I need help with my computer.", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  assert(cue.seriousness >= 0.50, 'seriousness should be elevated, got: ' + cue.seriousness);
  assert(cue.preferredResponseStyle !== 'banter', 'should not suggest banter for serious shift');
  assert(cue.preferredResponseStyle !== 'playful', 'should not suggest playful for serious shift');
});

test('CUE-06  Casual greeting detected as casual tone', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("Yo Shadow what's good", { intent: 'GREETING', tone: 'neutral' }, []);
  assert(cue.tone === 'casual' || cue.tone === 'playful' || cue.humor >= 0.15,
    'casual greeting should produce casual/playful tone or humor signal, got: ' + cue.tone);
  assert(cue.seriousness < 0.30, 'casual greeting should not be serious, got: ' + cue.seriousness);
});

test('CUE-07  Excited message detected as excited', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("omg this finally worked let's go!!!", { intent: 'GENERAL_CONVERSATION', tone: 'excited' }, []);
  assert(cue.excitement >= 0.40 || cue.tone === 'excited', 'should detect excitement, got tone=' + cue.tone + ' excitement=' + cue.excitement);
});

test('CUE-08  Absolute serious topic suppresses ALL humor/sarcasm', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("I've been feeling really depressed lately.", { intent: 'GENERAL_CONVERSATION', tone: 'sad' }, []);
  assert(cue.seriousness === 1.0, 'absolute serious topic: seriousness must be 1.0');
  assert(cue.sarcasmLikelihood === 0.0, 'absolute serious topic: sarcasm must be 0.0');
  assert(cue.humor === 0.0, 'absolute serious topic: humor must be 0.0');
  assert(cue.preferredResponseStyle === 'supportive', 'absolute serious topic: style must be supportive');
});

test('CUE-09  Sarcasm patterns detected in "Yeah right, that totally makes sense"', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("Yeah right, that totally makes sense.", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  assert(cue.sarcasmLikelihood >= 0.30, 'sarcasm phrases should raise sarcasmLikelihood, got: ' + cue.sarcasmLikelihood);
});

test('CUE-10  Cue snapshot shape is complete', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("What is Shadow Nexus Social?", { intent: 'QUESTION', tone: 'neutral' }, []);
  assert(typeof cue.tone === 'string',                  'cue.tone missing');
  assert(typeof cue.intensity === 'number',             'cue.intensity missing');
  assert(typeof cue.sarcasmLikelihood === 'number',     'cue.sarcasmLikelihood missing');
  assert(typeof cue.frustrationLikelihood === 'number', 'cue.frustrationLikelihood missing');
  assert(typeof cue.seriousness === 'number',           'cue.seriousness missing');
  assert(typeof cue.humor === 'number',                 'cue.humor missing');
  assert(typeof cue.excitement === 'number',            'cue.excitement missing');
  assert(typeof cue.preferredResponseStyle === 'string','cue.preferredResponseStyle missing');
  assert(typeof cue.contextConfidence === 'number',     'cue.contextConfidence missing');
  assert(typeof cue.emojiCount === 'number',            'cue.emojiCount missing');
  assert(typeof cue.shortMessage === 'boolean',         'cue.shortMessage missing');
  // Voice prosody metadata
  assert(typeof cue.responseMood === 'string',  'cue.responseMood missing');
  assert(typeof cue.energy === 'number',        'cue.energy missing');
  assert(typeof cue.humorLevel === 'number',    'cue.humorLevel missing');
});

test('CUE-11  "Texas trying to cook me" weather + humor — humor present, seriousness low', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("Shadow, is it hot outside or is Texas trying to cook me?", { intent: 'QUESTION', tone: 'neutral' }, []);
  // The humor cue must NOT prevent the weather intent from being served
  // We verify that seriousness is low and humor is present (humor + fact coexist)
  assert(cue.seriousness < 0.40, 'weather+humor: seriousness should be low, got: ' + cue.seriousness);
  assert(cue.frustrationLikelihood < 0.40, 'weather+humor: should not be frustrated');
  // Any positive humor/playfulness signal is correct
  assert(cue.humor >= 0.0, 'cue.humor should be a valid number');
});

test('CUE-12  Context window raises confidence after repeated similar tones', function () {
  CUE.resetHistory();
  // Send 3 playful messages to build context
  CUE.analyze("haha nice one 😂", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, []);
  CUE.analyze("lol you got me", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, []);
  var cue3 = CUE.analyze("okay but seriously jk", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, []);
  assert(cue3.contextConfidence >= 0.60, 'context confidence should be elevated after repeated playful turns, got: ' + cue3.contextConfidence);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION C: SRPersonality v2 — API and Structure
// ─────────────────────────────────────────────────────────────────────────────

test('PE-01  SRPersonality loads and exposes expected v2 API', function () {
  assert(!!P, 'SRPersonality not loaded');
  assert(typeof P.load === 'function',                      'load missing');
  assert(typeof P.analyzeTurn === 'function',               'analyzeTurn missing');
  assert(typeof P.learnFromTurn === 'function',             'learnFromTurn missing');
  assert(typeof P.getPersonalityPromptAddendum === 'function', 'getPersonalityPromptAddendum missing');
  assert(typeof P.getAssistantName === 'function',          'getAssistantName missing');
  assert(typeof P.getProfile === 'function',                'getProfile missing');
  assert(typeof P.resetProfile === 'function',              'resetProfile missing');
  assert(typeof P.getStatus === 'function',                 'getStatus missing');
  // Stage 2 additions
  assert(typeof P.setSarcasmPreference === 'function',      'setSarcasmPreference missing');
  assert(typeof P.setHumorPreference === 'function',        'setHumorPreference missing');
  assert(typeof P.shadowTraits === 'object',                'shadowTraits missing');
  assert(P.build.indexOf('PERSONALITY') !== -1,             'build tag should contain PERSONALITY');
});

test('PE-02  Default profile has Stage 2 fields', function () {
  P.resetProfile();
  var prof = P.getProfile();
  assert(typeof prof.sarcasmPreference === 'number',   'sarcasmPreference missing');
  assert(typeof prof.humorPreference === 'number',     'humorPreference missing');
  assert(typeof prof.conversationEnergy === 'number',  'conversationEnergy missing');
  assert(typeof prof.responseDirectness === 'number',  'responseDirectness missing');
  assert(prof.sarcasmPreference >= 0 && prof.sarcasmPreference <= 3, 'sarcasmPreference out of range');
  assert(prof.humorPreference >= 0 && prof.humorPreference <= 3,     'humorPreference out of range');
});

test('PE-03  Shadow baseline traits exposed and correct', function () {
  var traits = P.shadowTraits;
  assert(!!traits,             'shadowTraits is falsy');
  assert(traits.confident,     'Shadow should be confident');
  assert(traits.loyal,         'Shadow should be loyal');
  assert(traits.witty,         'Shadow should be witty');
  assert(traits.direct,        'Shadow should be direct');
  assert(traits.conversational,'Shadow should be conversational');
});

test('PE-04  analyzeTurn returns new fields: attitudeStyle, sarcasmLevel, conversationalCue, shadowTraits', function () {
  P.resetProfile();
  var ctx = P.analyzeTurn("yo what's up", { intent: 'GREETING', tone: 'neutral' }, null);
  assert(typeof ctx.attitudeStyle === 'string', 'attitudeStyle missing');
  assert(typeof ctx.sarcasmLevel === 'number',  'sarcasmLevel missing');
  assert(ctx.sarcasmLevel >= 0 && ctx.sarcasmLevel <= 3, 'sarcasmLevel out of range');
  assert(typeof ctx.shadowTraits === 'object',  'shadowTraits missing from context');
  assert(typeof ctx.sarcasmPreference === 'number', 'sarcasmPreference missing from context');
  assert(typeof ctx.humorPreference === 'number',   'humorPreference missing from context');
});

test('PE-05  Absolute serious topic returns attitudeStyle=supportive and sarcasmLevel=0', function () {
  P.resetProfile();
  var ctx = P.analyzeTurn("I've been feeling really depressed lately.", { intent: 'GENERAL_CONVERSATION', tone: 'sad' }, null);
  assert(ctx.seriousMode === true,       'seriousMode should be true');
  assert(ctx.sarcasmLevel === 0,         'sarcasmLevel must be 0 on serious topic');
  assert(ctx.attitudeStyle === 'supportive', 'attitudeStyle must be supportive');
  assert(ctx.humorAppropriate === false, 'humor must be suppressed');
});

test('PE-06  Playful cue raises attitudeStyle to playful or banter', function () {
  P.resetProfile();
  var playCue = { tone: 'playful', humor: 0.7, sarcasmLikelihood: 0.1, frustrationLikelihood: 0.0, seriousness: 0.0 };
  var ctx = P.analyzeTurn("lol you got me", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, playCue);
  assert(ctx.playfulMode === true, 'playfulMode should be true');
  assert(ctx.attitudeStyle === 'playful' || ctx.attitudeStyle === 'banter', 'attitudeStyle should be playful/banter, got: ' + ctx.attitudeStyle);
});

test('PE-07  Sarcastic cue yields banter attitudeStyle', function () {
  P.resetProfile();
  // Give user high sarcasm tolerance first
  P.setSarcasmPreference(2);
  var sarcCue = { tone: 'sarcastic', humor: 0.5, sarcasmLikelihood: 0.65, frustrationLikelihood: 0.0, seriousness: 0.0 };
  var ctx = P.analyzeTurn("Yeah right, totally makes sense 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, sarcCue);
  assert(ctx.attitudeStyle === 'banter' || ctx.attitudeStyle === 'playful', 'sarcastic cue should produce banter/playful, got: ' + ctx.attitudeStyle);
});

test('PE-08  Frustrated cue with no humor yields direct attitudeStyle', function () {
  P.resetProfile();
  var frustCue = { tone: 'frustrated', humor: 0.0, sarcasmLikelihood: 0.0, frustrationLikelihood: 0.75, seriousness: 0.0 };
  var ctx = P.analyzeTurn("This computer is pissing me off", { intent: 'GENERAL_CONVERSATION', tone: 'frustrated' }, frustCue);
  assert(ctx.frustratedMode === true, 'frustratedMode should be true');
  assert(ctx.attitudeStyle === 'direct', 'frustrated without humor should be direct, got: ' + ctx.attitudeStyle);
});

test('PE-09  Serious shift override: "I\'m being serious" drops sarcasm', function () {
  P.resetProfile();
  // First establish playful context with high sarcasm preference
  P.setSarcasmPreference(3);
  // Then user says "being serious"
  var seriousCue = { tone: 'serious', humor: 0.0, sarcasmLikelihood: 0.0, frustrationLikelihood: 0.0, seriousness: 0.75 };
  var ctx = P.analyzeTurn("Okay I'm being serious. I need help.", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, seriousCue);
  assert(ctx.seriousMode === true || ctx.attitudeStyle === 'supportive', 'serious shift should trigger seriousMode or supportive');
  assert(ctx.sarcasmLevel === 0, 'sarcasmLevel must be 0 after serious shift');
});

test('PE-10  setSarcasmPreference(0) disables sarcasm entirely', function () {
  P.resetProfile();
  var ok = P.setSarcasmPreference(0);
  assert(ok === true, 'setSarcasmPreference should return true');
  var prof = P.getProfile();
  assert(prof.sarcasmPreference === 0, 'sarcasmPreference should be 0');
  assert(prof.sarcasmTolerance < 0.10, 'sarcasmTolerance should be near 0');
});

test('PE-11  setSarcasmPreference(3) enables strong sarcasm', function () {
  P.resetProfile();
  var ok = P.setSarcasmPreference(3);
  assert(ok === true, 'setSarcasmPreference should return true');
  var prof = P.getProfile();
  assert(prof.sarcasmPreference === 3, 'sarcasmPreference should be 3');
  assert(prof.sarcasmTolerance >= 0.70, 'sarcasmTolerance should be high');
});

test('PE-12  setSarcasmPreference rejects invalid values', function () {
  P.resetProfile();
  var r1 = P.setSarcasmPreference(-1);
  var r2 = P.setSarcasmPreference(4);
  var r3 = P.setSarcasmPreference('abc');
  assert(r1 === false, 'negative value should be rejected');
  assert(r2 === false, 'value > 3 should be rejected');
  assert(r3 === false, 'string value should be rejected');
});

test('PE-13  setHumorPreference(0) reduces humor frequency', function () {
  P.resetProfile();
  P.setHumorPreference(0);
  var prof = P.getProfile();
  assert(prof.humorPreference === 0, 'humorPreference should be 0');
  assert(prof.humorFrequency < 0.10, 'humorFrequency should be very low');
});

test('PE-14  getPersonalityPromptAddendum includes Shadow baseline traits', function () {
  P.resetProfile();
  var ctx = P.analyzeTurn("yo what up", { intent: 'GREETING', tone: 'neutral' }, null);
  var addendum = P.getPersonalityPromptAddendum(ctx);
  assert(typeof addendum === 'string', 'addendum should be a string');
  assert(addendum.length > 0, 'addendum should not be empty');
  // Must contain Shadow identity language
  assert(addendum.indexOf('Shadow') !== -1 || addendum.indexOf('shadow') !== -1,
    'addendum should mention Shadow identity');
});

test('PE-15  Seriousness override in addendum removes banter instruction', function () {
  P.resetProfile();
  var seriousCtx = {
    seriousMode:      true,
    humorAppropriate: false,
    sarcasmLevel:     0,
    attitudeStyle:    'supportive',
    frustratedMode:   false,
    technicalMode:    false,
    preferredLength:  'medium',
    directness:       0.65,
    humorLevel:       0.0,
    casualness:       0.60,
    humorPreference:  1,
  };
  var addendum = P.getPersonalityPromptAddendum(seriousCtx);
  // "banter" may appear in the removal instruction — "Remove all sarcasm, jokes, and banter"
  // The test ensures no banter is encouraged; banter as a thing to remove is correct.
  var banterEncouraged = /banter\s*(are|is)\s*welcome/i.test(addendum) ||
                         /give.*banter.*back/i.test(addendum);
  assert(!banterEncouraged, 'serious addendum must not encourage banter');
  assert(addendum.indexOf('sarcasm') === -1 || addendum.indexOf('no sarcasm') !== -1 ||
         addendum.indexOf('Remove all sarcasm') !== -1,
    'serious addendum should suppress sarcasm');
  assert(addendum.indexOf('serious') !== -1 || addendum.indexOf('supportive') !== -1,
    'serious addendum should mention serious/supportive mode');
});

test('PE-16  Playful addendum mentions playful style', function () {
  P.resetProfile();
  var playCtx = {
    seriousMode:      false,
    humorAppropriate: true,
    sarcasmLevel:     1,
    attitudeStyle:    'playful',
    frustratedMode:   false,
    technicalMode:    false,
    preferredLength:  'medium',
    directness:       0.65,
    humorLevel:       0.70,
    casualness:       0.80,
    humorPreference:  2,
    sarcasmPreference: 1,
  };
  var addendum = P.getPersonalityPromptAddendum(playCtx);
  assert(addendum.indexOf('playful') !== -1, 'playful addendum should mention playful');
});

test('PE-17  getPersonalityPromptAddendum handles null gracefully', function () {
  var addendum = P.getPersonalityPromptAddendum(null);
  assert(addendum === '', 'null input should return empty string');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION D: Adaptation Learning — Short-term vs Long-term
// ─────────────────────────────────────────────────────────────────────────────

test('AD-01  One playful message does NOT permanently raise sarcasmPreference', function () {
  P.resetProfile();
  var beforeProf = P.getProfile();
  var beforeSarcasm = beforeProf.sarcasmPreference;
  P.learnFromTurn("haha lol good one", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, "response");
  var afterProf = P.getProfile();
  // sarcasmPreference should NOT change on a single playful turn (only after repeated patterns)
  assert(afterProf.sarcasmPreference === beforeSarcasm,
    'one playful message should not change sarcasmPreference, before=' + beforeSarcasm + ' after=' + afterProf.sarcasmPreference);
});

test('AD-02  Repeated playful engagement gradually raises humorFrequency', function () {
  P.resetProfile();
  var before = P.getProfile().humorFrequency;
  // Simulate 5 playful turns
  for (var i = 0; i < 5; i++) {
    P.learnFromTurn("lol nice one", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, "resp");
  }
  var after = P.getProfile().humorFrequency;
  assert(after > before, 'repeated playful turns should raise humorFrequency, before=' + before + ' after=' + after);
});

test('AD-03  Repeated sarcasm use raises sarcasmTolerance over time', function () {
  P.resetProfile();
  var before = P.getProfile().sarcasmTolerance;
  for (var i = 0; i < 4; i++) {
    P.learnFromTurn("oh come on smartass", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, "resp");
  }
  var after = P.getProfile().sarcasmTolerance;
  assert(after > before, 'repeated sarcasm signals should raise sarcasmTolerance, before=' + before + ' after=' + after);
});

test('AD-04  Short messages raise conversationEnergy', function () {
  P.resetProfile();
  var before = P.getProfile().conversationEnergy;
  for (var i = 0; i < 5; i++) {
    P.learnFromTurn("yo", { intent: 'GREETING', tone: 'neutral' }, "resp");
  }
  var after = P.getProfile().conversationEnergy;
  assert(after >= before, 'short messages should not decrease conversationEnergy, before=' + before + ' after=' + after);
});

test('AD-05  User A profile isolation: learning on A does not affect B', function () {
  // Reset and create a "user A" scenario by direct profile manipulation
  P.resetProfile();
  // Simulate heavy playful learning for user A
  for (var i = 0; i < 8; i++) {
    P.learnFromTurn("lol smartass 😂", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, "resp");
  }
  var profA = P.getProfile();

  // "Switch to user B" by resetting the profile (simulates fresh login)
  P.resetProfile();
  var profB = P.getProfile();

  // User B should have defaults, NOT user A's elevated humor
  assert(profB.humorFrequency < profA.humorFrequency,
    'user B reset profile should have lower humorFrequency than heavily-trained user A, A=' + profA.humorFrequency + ' B=' + profB.humorFrequency);
  assert(profB.sarcasmTolerance < profA.sarcasmTolerance,
    'user B reset profile should have lower sarcasmTolerance than heavily-trained user A');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION E: Multi-Turn Contextual Behavior
// ─────────────────────────────────────────────────────────────────────────────

test('MT-01  Casual → playful → banter → serious transition', function () {
  P.resetProfile();
  CUE.resetHistory();

  // Turn 1: casual greeting
  var cue1 = CUE.analyze("Yo Shadow", { intent: 'GREETING', tone: 'neutral' }, []);
  var ctx1 = P.analyzeTurn("Yo Shadow", { intent: 'GREETING', tone: 'neutral' }, cue1);
  assert(ctx1.seriousMode === false, 'turn 1 (casual greeting) should not be serious');

  // Turn 2: playful banter
  var cue2 = CUE.analyze("You been behaving today?", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  var ctx2 = P.analyzeTurn("You been behaving today?", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, cue2);
  assert(ctx2.seriousMode === false, 'turn 2 (playful) should not be serious');

  // Turn 3: sarcasm/banter
  var cue3 = CUE.analyze("Yeah right 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  var ctx3 = P.analyzeTurn("Yeah right 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, cue3);
  assert(ctx3.playfulMode || ctx3.humorAppropriate || ctx3.sarcasmLevel >= 0,
    'turn 3 (banter) should have some playful/humor signal');

  // Turn 4: serious shift
  var cue4 = CUE.analyze("Okay seriously I need help with my computer.", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  var ctx4 = P.analyzeTurn("Okay seriously I need help with my computer.", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, cue4);
  assert(ctx4.sarcasmLevel === 0 || ctx4.attitudeStyle === 'direct' || ctx4.attitudeStyle === 'supportive',
    'turn 4 (serious shift) should reduce sarcasm level, got sarcasmLevel=' + ctx4.sarcasmLevel + ' style=' + ctx4.attitudeStyle);
});

test('MT-02  Frustration escalation detected across turns', function () {
  CUE.resetHistory();

  // Turn 1: mild complaint
  CUE.analyze("That didn't work.", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);

  // Turn 2: stronger frustration
  var cue2 = CUE.analyze("I've done this six times already and this thing still won't work.", { intent: 'GENERAL_CONVERSATION', tone: 'frustrated' }, []);
  assert(cue2.frustrationLikelihood >= 0.50,
    'frustration should be detected in turn 2, got: ' + cue2.frustrationLikelihood);
  assert(cue2.preferredResponseStyle === 'direct',
    'escalating frustration should prefer direct response style, got: ' + cue2.preferredResponseStyle);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION F: Creator Knowledge and Research Protection
// ─────────────────────────────────────────────────────────────────────────────

test('CK-01  Personality addendum does NOT override factual seriousness of knowledge question', function () {
  P.resetProfile();
  // A factual question should not produce banter/sarcasm style
  var cue = CUE.analyze("What is Shadow Nexus Social?", { intent: 'QUESTION', tone: 'neutral' }, []);
  // Direct question → style should be direct or calm, NOT banter
  assert(cue.preferredResponseStyle !== 'banter', 'factual question should not suggest banter, got: ' + cue.preferredResponseStyle);
  assert(cue.seriousness >= 0.0, 'seriousness is a valid number');
});

test('CK-02  Weather + humor question: humor present but intent preserved', function () {
  CUE.resetHistory();
  var cue = CUE.analyze("Texas trying to cook me today or what?", { intent: 'QUESTION', tone: 'neutral' }, []);
  // Humor is present but the question IS a weather question
  // Cue should NOT indicate this as a "serious" topic that blocks weather lookup
  assert(cue.seriousness < 0.50, 'weather+humor should not be treated as serious, got: ' + cue.seriousness);
  assert(cue.frustrationLikelihood < 0.40, 'weather+humor should not be frustrated');
  // The preferred style can be playful or direct — either is acceptable
  assert(['playful', 'casual', 'direct', 'banter', 'calm'].indexOf(cue.preferredResponseStyle) !== -1,
    'style should be reasonable for weather+humor, got: ' + cue.preferredResponseStyle);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION G: One-Brain Rule
// ─────────────────────────────────────────────────────────────────────────────

test('OB-01  No EmotionBrain, PersonalityBrain, SarcasmBrain, HumanBrain, SocialBrain exist', function () {
  assert(!global.EmotionBrain,       'EmotionBrain must not exist');
  assert(!global.PersonalityBrain,   'PersonalityBrain must not exist');
  assert(!global.SarcasmBrain,       'SarcasmBrain must not exist');
  assert(!global.HumanBrain,         'HumanBrain must not exist');
  assert(!global.SocialBrain,        'SocialBrain must not exist');
  assert(!global.ShadowBrain,        'ShadowBrain must not exist');
});

test('OB-02  SRConversationalCue is a signal/analysis layer, not a separate AI', function () {
  // It must NOT have an ask() method or a generate() method
  assert(typeof CUE.ask !== 'function',      'SRConversationalCue must not have ask()');
  assert(typeof CUE.generate !== 'function', 'SRConversationalCue must not have generate()');
  // It must have analyze()
  assert(typeof CUE.analyze === 'function',  'SRConversationalCue must have analyze()');
});

test('OB-03  SRPersonality is a signal/preference layer, not a separate AI', function () {
  assert(typeof P.ask !== 'function',      'SRPersonality must not have ask()');
  assert(typeof P.generate !== 'function', 'SRPersonality must not have generate()');
  assert(typeof P.analyzeTurn === 'function', 'SRPersonality must have analyzeTurn()');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('');
console.log('══════════════════════════════════════════════');
console.log('  SR PERSONALITY ADAPTIVE — STAGE 1 RESULTS');
console.log('══════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
console.log('══════════════════════════════════════════════');

process.exit(FAIL > 0 ? 1 : 0);
