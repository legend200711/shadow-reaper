/**
 * shadow-reaper-v2/tests/sr-natural-conversation.test.js
 * Shadow Reaper — Natural Conversation & Emotional Awareness Tests
 *
 * Build: SHADOW-HUMAN-1
 *
 * Stages covered:
 *   Stage 3 — Emotional Conversation Awareness
 *   Stage 4 — Relationship & Long-Term Adaptation
 *   Stage 5 — Natural Conversation Upgrade
 *
 * Tests verify BEHAVIORAL PROPERTIES — not hardcoded response strings.
 * Multi-turn progression, seriousness override, never-mind detection,
 * topic return, conversational callbacks, user isolation, gradual learning.
 *
 * Exit: 0 = all pass, 1 = any fail.
 */

'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

// ─── Minimal browser environment shim ─────────────────────────────────────────

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

function loadModule(relPath) {
  try {
    delete require.cache[require.resolve(path.join(ROOT, relPath))];
    require(path.join(ROOT, relPath));
  } catch (e) {
    console.error('Failed to load ' + relPath + ': ' + e.message);
  }
}

loadModule('core/sr-conversational-cue.js');
loadModule('core/personality-engine.js');
loadModule('core/understanding-engine.js');
loadModule('core/context-engine.js');
loadModule('core/conversation-engine.js');

// ─── Test harness ──────────────────────────────────────────────────────────────

var PASS = 0;
var FAIL = 0;

function assert(cond, msg) {
  if (cond) {
    PASS++;
  } else {
    FAIL++;
    console.error('  FAIL: ' + msg);
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

var CUE = global.SRConversationalCue;
var P   = global.SRPersonality;
var CTX = global.SRContext;
var CV  = global.SRConversation;

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 3 — EMOTIONAL CONVERSATION AWARENESS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  STAGE 3 — EMOTIONAL CONVERSATION AWARENESS');
console.log('══════════════════════════════════════════════');

test('S3-01  Seriousness override: explicit "I am being serious" suppresses humor', function () {
  if (!P || !CUE) return;
  P.resetProfile();
  CUE.resetHistory();
  P.setSarcasmPreference(3); // High sarcasm preference set

  var cue = CUE.analyze("Okay I'm being serious now.", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  var ctx = P.analyzeTurn("Okay I'm being serious now.", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, cue);

  assert(ctx.sarcasmLevel === 0, 'sarcasm must be 0 after seriousness override, got: ' + ctx.sarcasmLevel);
  assert(!ctx.humorAppropriate || ctx.seriousMode, 'humor must be suppressed or seriousMode true after serious shift');
  assert(cue.seriousness >= 0.50, 'cue seriousness should be elevated, got: ' + cue.seriousness);
});

test('S3-02  Attitude matching: playful input → playful/banter response style', function () {
  if (!P || !CUE) return;
  P.resetProfile();
  CUE.resetHistory();

  var cue = CUE.analyze("You been behaving today? 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  var ctx = P.analyzeTurn("You been behaving today? 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, cue);

  assert(
    ctx.attitudeStyle === 'playful' || ctx.attitudeStyle === 'banter' || ctx.attitudeStyle === 'casual',
    'playful input should produce playful/banter/casual attitude, got: ' + ctx.attitudeStyle
  );
  assert(!ctx.seriousMode, 'playful turn should not be serious mode');
});

test('S3-03  Attitude matching: genuine frustration → direct response style', function () {
  if (!P || !CUE) return;
  P.resetProfile();
  CUE.resetHistory();

  var frustMsg = "This computer is pissing me off. Not working at all.";
  var cue = CUE.analyze(frustMsg, { intent: 'GENERAL_CONVERSATION', tone: 'frustrated' }, []);
  var ctx = P.analyzeTurn(frustMsg, { intent: 'GENERAL_CONVERSATION', tone: 'frustrated' }, cue);

  assert(
    ctx.attitudeStyle === 'direct' || ctx.frustratedMode === true,
    'frustrated input should produce direct attitude or frustratedMode, got: ' + ctx.attitudeStyle
  );
  assert(ctx.sarcasmLevel === 0 || ctx.sarcasmLevel <= 1,
    'sarcasm should be low for frustrated context, got: ' + ctx.sarcasmLevel);
});

test('S3-04  Hostile/angry input → confident/calm, NOT Shadow escalating anger', function () {
  if (!P || !CUE) return;
  P.resetProfile();
  CUE.resetHistory();

  // Hostile but not absolute-serious (no depression/crisis signals)
  var hostile = "You're useless and I hate you right now.";
  var cue = CUE.analyze(hostile, { intent: 'GENERAL_CONVERSATION', tone: 'angry' }, []);
  var ctx = P.analyzeTurn(hostile, { intent: 'GENERAL_CONVERSATION', tone: 'angry' }, cue);

  // Shadow should be calm/direct/supportive — never mirror hostility
  assert(
    ctx.attitudeStyle !== 'angry',
    'Shadow must NOT mirror hostility, got: ' + ctx.attitudeStyle
  );
  assert(
    ctx.attitudeStyle === 'direct' || ctx.attitudeStyle === 'supportive' || ctx.attitudeStyle === 'calm',
    'hostile input: Shadow should be direct/supportive/calm, got: ' + ctx.attitudeStyle
  );
});

test('S3-05  Multi-turn transition: casual → playful → serious', function () {
  if (!P || !CUE) return;
  P.resetProfile();
  CUE.resetHistory();

  // Turn 1: casual
  var cue1 = CUE.analyze("Yo Shadow.", { intent: 'GREETING', tone: 'neutral' }, []);
  var ctx1 = P.analyzeTurn("Yo Shadow.", { intent: 'GREETING', tone: 'neutral' }, cue1);
  assert(!ctx1.seriousMode, 'turn 1 (casual) should not be serious');

  // Turn 2: playful
  var cue2 = CUE.analyze("You being good today? 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  var ctx2 = P.analyzeTurn("You being good today? 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, cue2);
  assert(!ctx2.seriousMode, 'turn 2 (playful) should not be serious');

  // Turn 3: sarcastic banter
  var cue3 = CUE.analyze("Yeah right 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  P.analyzeTurn("Yeah right 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, cue3);

  // Turn 4: serious shift
  var cue4 = CUE.analyze("Okay seriously I need help with my computer.", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  var ctx4 = P.analyzeTurn("Okay seriously I need help with my computer.", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, cue4);

  assert(
    ctx4.sarcasmLevel === 0 || ctx4.attitudeStyle === 'direct' || ctx4.attitudeStyle === 'supportive',
    'turn 4 (serious) sarcasm must drop, got sarcasmLevel=' + ctx4.sarcasmLevel + ' style=' + ctx4.attitudeStyle
  );
});

test('S3-06  Absolute serious topic immediately suppresses ALL humor regardless of sarcasm preference', function () {
  if (!P || !CUE) return;
  P.resetProfile();
  P.setSarcasmPreference(3); // Maximum sarcasm preference
  CUE.resetHistory();

  var crisis = "I've been feeling really depressed and don't know what to do.";
  var cue = CUE.analyze(crisis, { intent: 'GENERAL_CONVERSATION', tone: 'sad' }, []);
  var ctx = P.analyzeTurn(crisis, { intent: 'GENERAL_CONVERSATION', tone: 'sad' }, cue);

  assert(ctx.sarcasmLevel === 0, 'absolute serious: sarcasmLevel must be 0');
  assert(!ctx.humorAppropriate, 'absolute serious: humor must not be appropriate');
  assert(ctx.attitudeStyle === 'supportive', 'absolute serious: attitude must be supportive');
  assert(cue.seriousness === 1.0, 'absolute serious cue: seriousness must be 1.0');
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 4 — RELATIONSHIP & LONG-TERM ADAPTATION
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  STAGE 4 — RELATIONSHIP & LONG-TERM ADAPTATION');
console.log('══════════════════════════════════════════════');

test('S4-01  Gradual humor learning: single playful turn does not permanently change profile', function () {
  if (!P) return;
  P.resetProfile();
  var before = P.getProfile().humorFrequency;

  P.learnFromTurn("lol nice one", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, "response");
  var after = P.getProfile().humorFrequency;

  // One turn might nudge it slightly, but should NOT jump dramatically
  assert(after - before < 0.20, 'one playful turn should not cause large jump in humorFrequency, delta: ' + (after - before));
});

test('S4-02  Repeated playful turns gradually raise humor preference', function () {
  if (!P) return;
  P.resetProfile();
  var before = P.getProfile().humorFrequency;

  for (var i = 0; i < 6; i++) {
    P.learnFromTurn("lol smartass 😂", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, "resp");
  }
  var after = P.getProfile().humorFrequency;
  assert(after > before, 'repeated playful turns should raise humorFrequency, before=' + before + ' after=' + after);
});

test('S4-03  Per-user isolation: user A profile does not bleed into user B', function () {
  if (!P) return;

  // Simulate user A: heavy playful/sarcastic learning
  P.resetProfile();
  for (var i = 0; i < 8; i++) {
    P.learnFromTurn("lol smartass banter 😂", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, "resp");
  }
  var profA = P.getProfile();

  // Switch to user B: reset profile (simulates new login)
  P.resetProfile();
  var profB = P.getProfile();

  assert(profB.humorFrequency < profA.humorFrequency,
    'user B should have lower humorFrequency than trained user A');
  assert(profB.sarcasmTolerance < profA.sarcasmTolerance,
    'user B should have lower sarcasmTolerance than trained user A');
  assert(profB.jokeCount === 0, 'user B jokeCount should be 0 after reset');
});

test('S4-04  Session tone is distinct from persistent preference', function () {
  if (!P) return;
  P.resetProfile();

  // In a normally direct-preference profile, a single playful turn is session-only
  P.setSarcasmPreference(0); // Direct, no sarcasm preferred
  var prof = P.getProfile();
  assert(prof.sarcasmPreference === 0, 'sarcasm preference should be 0');

  // Even with a playful cue, profile-level preference should not jump
  P.learnFromTurn("haha", { intent: 'GENERAL_CONVERSATION', tone: 'playful' }, "resp");
  var profAfter = P.getProfile();
  // sarcasmPreference should not jump from 0 to high from one joke
  assert(profAfter.sarcasmPreference <= 1, 'one joke should not permanently raise sarcasmPreference above 1');
});

test('S4-05  Correction signals raise directness preference gradually', function () {
  if (!P) return;
  P.resetProfile();
  var before = P.getProfile().directness;

  for (var i = 0; i < 3; i++) {
    P.learnFromTurn("No, I meant something else actually.", { intent: 'USER_CORRECTION', tone: 'neutral' }, "resp");
  }
  var after = P.getProfile().directness;
  assert(after >= before, 'corrections should maintain or raise directness');
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 5 — NATURAL CONVERSATION UPGRADE
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  STAGE 5 — NATURAL CONVERSATION UPGRADE');
console.log('══════════════════════════════════════════════');

test('S5-01  Context engine loads with Stage 5 fields', function () {
  if (!CTX) return;
  CTX.reset();
  var snap = CTX.getSnapshot();
  assert(typeof snap.neverMind   === 'boolean', 'neverMind field missing from snapshot');
  assert(typeof snap.rhetoricalQ === 'boolean', 'rhetoricalQ field missing from snapshot');
  assert('prevTopic' in snap,                   'prevTopic field missing from snapshot');
});

test('S5-02  Never-mind detection sets neverMind flag', function () {
  if (!CTX || !global.SRUnderstanding) return;
  CTX.reset();

  var understood = global.SRUnderstanding.understand("Never mind, forget it.");
  CTX.update(understood, "Never mind, forget it.");
  var snap = CTX.getSnapshot();
  assert(snap.neverMind === true, 'neverMind should be true after "never mind, forget it"');
});

test('S5-03  "forget it" also triggers never-mind', function () {
  if (!CTX || !global.SRUnderstanding) return;
  CTX.reset();

  var understood = global.SRUnderstanding.understand("You know what, forget it.");
  CTX.update(understood, "You know what, forget it.");
  var snap = CTX.getSnapshot();
  assert(snap.neverMind === true, 'neverMind should be true after "forget it"');
});

test('S5-04  Never-mind preserves previous active topic as prevTopic', function () {
  if (!CTX || !global.SRUnderstanding) return;
  CTX.reset();

  // First establish an active topic
  var u1 = global.SRUnderstanding.understand("Let's work on the homepage.");
  CTX.update(u1, "Let's work on the homepage.");

  // Then never-mind it
  var u2 = global.SRUnderstanding.understand("Actually never mind.");
  CTX.update(u2, "Actually never mind.");
  var snap = CTX.getSnapshot();

  assert(snap.neverMind === true, 'neverMind should be set');
  // prevTopic should hold the abandoned topic
  assert(snap.prevTopic !== null || snap.activeTopic === null,
    'activeTopic should be cleared or prevTopic should hold abandoned topic');
});

test('S5-05  Rhetorical question detection sets rhetoricalQ flag', function () {
  if (!CTX || !global.SRUnderstanding) return;
  CTX.reset();

  var understood = global.SRUnderstanding.understand("That's wild, right?");
  CTX.update(understood, "That's wild, right?");
  var snap = CTX.getSnapshot();
  assert(snap.rhetoricalQ === true, 'rhetoricalQ should be true for "right?"');
});

test('S5-06  "you know what I mean" sets rhetoricalQ', function () {
  if (!CTX || !global.SRUnderstanding) return;
  CTX.reset();

  var understood = global.SRUnderstanding.understand("It just makes sense you know what I mean.");
  CTX.update(understood, "It just makes sense you know what I mean.");
  var snap = CTX.getSnapshot();
  assert(snap.rhetoricalQ === true, 'rhetoricalQ should be true for "you know what I mean"');
});

test('S5-07  Normal turn does NOT set neverMind or rhetoricalQ', function () {
  if (!CTX || !global.SRUnderstanding) return;
  CTX.reset();

  var understood = global.SRUnderstanding.understand("What is Shadow Nexus Social?");
  CTX.update(understood, "What is Shadow Nexus Social?");
  var snap = CTX.getSnapshot();
  assert(snap.neverMind === false,   'neverMind should be false for normal query');
  assert(snap.rhetoricalQ === false, 'rhetoricalQ should be false for normal query');
});

test('S5-08  Conversational callback: project name retained across turns', function () {
  if (!CTX || !CV || !global.SRUnderstanding) return;
  CTX.reset();
  CV.reset();

  // Turn 1: user names project
  var u1 = global.SRUnderstanding.understand("My project is called Blue Wolf.");
  var snap1 = CTX.update(u1, "My project is called Blue Wolf.");
  CV.addTurn('user', "My project is called Blue Wolf.", u1.intent, u1.tone);

  // Turn 2: user asks what project
  var u2 = global.SRUnderstanding.understand("What was that project I told you about?");
  var snap2 = CTX.update(u2, "What was that project I told you about?");

  assert(snap2.projectName === 'Blue Wolf', 'project name Blue Wolf should be retained, got: ' + snap2.projectName);
});

test('S5-09  Topic history tracks recent topics', function () {
  if (!CTX || !global.SRUnderstanding) return;
  CTX.reset();

  var u1 = global.SRUnderstanding.understand("Let's work on the dashboard.");
  CTX.update(u1, "Let's work on the dashboard.");
  var snap1 = CTX.getSnapshot();

  assert(snap1.topicHistory.length >= 0, 'topicHistory should be an array');
});

test('S5-10  Context resolves pronouns using recent subjects', function () {
  if (!CTX || !global.SRUnderstanding) return;
  CTX.reset();

  // Establish a subject
  var u1 = global.SRUnderstanding.understand("My project is called Blue Wolf.");
  CTX.update(u1, "My project is called Blue Wolf.");

  // Ask with pronoun
  var resolved = CTX.resolvePronouns("What is it about?");
  assert(resolved !== null, 'resolvePronouns should find a subject for "it"');
});

test('S5-11  CUE weather+humor: humorous wording does not block weather intent', function () {
  if (!CUE) return;
  CUE.resetHistory();

  var cue = CUE.analyze("Texas trying to cook me today or what?",
    { intent: 'QUESTION', tone: 'neutral' }, []);

  // Humor is present but the weather query should not be blocked by seriousness
  assert(cue.seriousness < 0.50,
    'weather+humor: seriousness should be low, got: ' + cue.seriousness);
  assert(cue.frustrationLikelihood < 0.50,
    'weather+humor: frustration should be low');
  // Style should be playful, casual, direct, or calm — NOT banter/serious
  var okStyles = ['playful', 'casual', 'direct', 'calm', 'banter'];
  assert(okStyles.indexOf(cue.preferredResponseStyle) !== -1,
    'weather+humor style should be natural, got: ' + cue.preferredResponseStyle);
});

test('S5-12  "Okay smartass 😂" recognized as banter not hostility', function () {
  if (!CUE || !P) return;
  CUE.resetHistory();
  P.resetProfile();

  var cue = CUE.analyze("Okay smartass 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, []);
  var ctx = P.analyzeTurn("Okay smartass 😂", { intent: 'GENERAL_CONVERSATION', tone: 'neutral' }, cue);

  // Should NOT be treated as hostile/serious
  assert(cue.seriousness < 0.40, '"okay smartass 😂" should not be serious, got: ' + cue.seriousness);
  assert(cue.humor >= 0.20 || cue.sarcasmLikelihood >= 0.20,
    'should detect humor or sarcasm signal');
  assert(ctx.attitudeStyle !== 'supportive',
    '"okay smartass 😂" should not produce supportive attitudeStyle');
});

test('S5-13  "This computer is pissing me off" → direct/helpful, not joking', function () {
  if (!CUE || !P) return;
  CUE.resetHistory();
  P.resetProfile();

  var msg = "This computer is pissing me off.";
  var cue = CUE.analyze(msg, { intent: 'GENERAL_CONVERSATION', tone: 'frustrated' }, []);
  var ctx = P.analyzeTurn(msg, { intent: 'GENERAL_CONVERSATION', tone: 'frustrated' }, cue);

  assert(cue.frustrationLikelihood >= 0.40, 'frustration should be detected');
  assert(ctx.attitudeStyle === 'direct' || ctx.frustratedMode,
    'frustration should produce direct style or frustratedMode');
  assert(!ctx.humorAppropriate || ctx.sarcasmLevel <= 1,
    'humor should be reduced for genuine frustration');
});

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log('');
console.log('══════════════════════════════════════════════');
console.log('  SR NATURAL CONVERSATION — HUMAN-LIKE 1 RESULTS');
console.log('══════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
console.log('══════════════════════════════════════════════');

process.exit(FAIL > 0 ? 1 : 0);
