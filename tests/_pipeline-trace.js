'use strict';

// Minimal browser shims
if (typeof window === 'undefined') global.window = global;
if (!global.localStorage) {
  global.localStorage = {
    _s: {},
    getItem:    function(k) { return this._s[k] !== undefined ? this._s[k] : null; },
    setItem:    function(k, v) { this._s[k] = String(v); },
    removeItem: function(k) { delete this._s[k]; },
    clear:      function() { this._s = {}; }
  };
}
try {
  if (!global.navigator) {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true }, writable: true, configurable: true
    });
  }
} catch(_) {}

var origWarn = console.warn;
console.warn = function() {};

var fs   = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

function load(f) {
  var code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  new Function('global', 'require', code)(global, require);
}

// Load minimum pipeline — no persistence, no knowledge, no real model
load('platform/sr-platform-detector.js');
load('core/understanding-engine.js');
load('core/context-engine.js');
load('core/conversation-engine.js');
load('core/response-engine.js');
load('core/local-model.js');
load('research/sr-research-router.js');

console.warn = origWarn;

// ─── TRACE 1: Local model state at startup ────────────────────────────────────
var ms = global.SRLocalModel.getStatus();
console.log('\n════════════════════════════════════════════════');
console.log('  PIPELINE TRACE — SR-CLOUD-INTERNET-TEST');
console.log('════════════════════════════════════════════════');
console.log('\n── LOCAL MODEL STATE AT STARTUP ─────────────────');
console.log('state      :', ms.state);
console.log('isReady    :', ms.isReady);
console.log('modelId    :', ms.modelId);
console.log('lastError  :', ms.lastError);

// ─── TRACE 2: Run the three real failing inputs ───────────────────────────────
var INPUTS = [
  "Yo Shadow what you up to?",
  "I've been working on this AI all day and I'm trying to make it understand me better.",
  "What's the weather in Austin?"
];

console.log('\n── ACTUAL RESPONSES FOR FAILING INPUTS ──────────');

INPUTS.forEach(function(msg) {
  // Reset conversation for clean state per message
  global.SRConversation.reset();
  global.SRContext.reset();

  var understood = global.SRUnderstanding.understand(msg);
  var context    = global.SRContext.update(understood, msg);
  global.SRConversation.addTurn('user', msg, understood.intent, understood.tone);

  var routeClass = global.SRResearchRouter ? global.SRResearchRouter.classify(msg) : { route: 'ROUTER_NOT_LOADED', reason: 'n/a' };

  var result = { response: null, source: null };

  global.SRResponse.composeAsync(understood, context, {
    recentTurns:      [],
    adaptiveSnippets: [],
    memorySnippets:   [],
    knowledgeSnippet: null,
    researchSnippet:  null,
    langAnalysis:     null,
    resolvedRef:      null,
    negation:         null,
    concepts:         [],
    unknownWords:     [],
    comprehension:    null,
    idioms:           [],
    questionType:     null,
    sentenceStruct:   null,
    wordSenses:       {},
    personalityCtx:   null,
    assistantName:    'Shadow'
  }, function(response, source) {
    result.response = response;
    result.source   = source;
  });

  // Trace composeAsync decision path manually
  var modelStatus = global.SRLocalModel.getStatus();
  var intent = understood.intent;

  var DETERMINISTIC_INTENTS = new Set([
    'GREETING','GOODBYE','THANKS','USER_CORRECTION','FOLLOW_UP','PROJECT_STATEMENT','WORD_DEFINITION'
  ]);

  var path_taken;
  if (DETERMINISTIC_INTENTS.has(intent)) {
    path_taken = 'DETERMINISTIC_INTENTS shortcut';
  } else if (modelStatus.state !== 'READY') {
    path_taken = 'MODEL_NOT_READY → compose() fallback (state=' + modelStatus.state + ')';
  } else {
    path_taken = 'LOCAL_MODEL.generate()';
  }

  console.log('\nINPUT    : ' + JSON.stringify(msg));
  console.log('INTENT   : ' + understood.intent);
  console.log('TONE     : ' + understood.tone);
  console.log('ROUTE    : ' + routeClass.route + ' (' + routeClass.reason + ')');
  console.log('MODEL    : ' + modelStatus.state);
  console.log('PATH     : ' + path_taken);
  console.log('SOURCE   : ' + result.source);
  console.log('RESPONSE : ' + JSON.stringify(result.response));
});

// ─── TRACE 3: composeAsync branch exhaustive analysis ─────────────────────────
console.log('\n── COMPOSEASYNC BRANCH ANALYSIS ─────────────────');
console.log('Model state: ' + global.SRLocalModel.getStatus().state);
console.log('');
console.log('composeAsync() branch priority (line ~777-896):');
console.log('  1. context._hasPersistentHistory → HISTORY (deterministic)');
console.log('  2. DETERMINISTIC_INTENTS set → DETERMINISTIC');
console.log('  3. intent=QUESTION + _isMetaQuestion → DETERMINISTIC');
console.log('  4. SRKnowledgeLearner.queryForResponse → LEARNED (if answered)');
console.log('  5. model FAILED/NOT_LOADED + adaptiveSnippets → LEARNED');
console.log('  6. !SRLocalModel → ERROR');
console.log('  7. model state=FAILED → ERROR (surfaces error code)');
console.log('  8. model state≠READY → compose() DETERMINISTIC (KEY BRANCH)');
console.log('     ↳ This is the active branch when model=UNINITIALIZED');
console.log('  9. model state=READY → SRLocalModel.generate()');
console.log('');
console.log('FINDING: When model=UNINITIALIZED, branch 8 fires.');
console.log('compose() is the sync response-pool fallback for ALL non-deterministic intents.');
console.log('');
console.log('For GENERAL_CONVERSATION with neutral tone → compose() hits:');
console.log('  if (intent === "GENERAL_CONVERSATION" || intent === "UNKNOWN")');
console.log('    → tone routing (sad/happy/excited/...)');
console.log('    → neutral fallback: pick(POOLS.unknown)');
console.log('    → "I want to follow — what are you saying?"');
console.log('');
console.log('For "I\'ve been working on this AI..." — what does SRUnderstanding return?');

// Manually trace the second input
global.SRConversation.reset();
global.SRContext.reset();
var msg2 = "I've been working on this AI all day and I'm trying to make it understand me better.";
var u2   = global.SRUnderstanding.understand(msg2);
console.log('');
console.log('TRACE for: ' + JSON.stringify(msg2));
console.log('  raw  :', u2.raw);
console.log('  intent:', u2.intent);
console.log('  tone  :', u2.tone);
console.log('  entities:', JSON.stringify(u2.entities));

// What does compose() produce for this?
var ctx2 = global.SRContext.update(u2, msg2);
var sync2 = global.SRResponse.compose(u2, ctx2);
console.log('  compose() output:', JSON.stringify(sync2));

// Check the specific routing that produced the broken output
// The actual broken output was: "this AI all day and I: that. Noted. Anything else?"
// This means compose() triggered FOLLOW_UP with resolvedSubject='this AI all day and I'
console.log('');
console.log('BROKEN RESPONSE ANALYSIS:');
console.log('  "this AI all day and I: that. Noted. Anything else?"');
console.log('  → This comes from POOLS.followUpAcknowledge:');
console.log('    "{{subject}}: {{change}}. Noted. Anything else?"');
console.log('  → fill() substitutes:');
console.log('    {{subject}} = ctx.resolvedSubject || ctx.lastUserSubject || "that"');
console.log('    {{change}}  = ctx.changeDescriptor || "that"');
console.log('  → So intent=FOLLOW_UP fired, and resolvedSubject was garbage text');

// Actually execute the follow-up path to confirm
console.log('');
console.log('Checking SRContext.resolvePronouns for msg2...');
try {
  var rp = global.SRContext.resolvePronouns ? global.SRContext.resolvePronouns(msg2) : 'method not available';
  console.log('  resolvePronouns:', JSON.stringify(rp));
} catch(e) {
  console.log('  resolvePronouns ERROR:', e.message);
}
console.log('  ctx2.resolvedSubject:', ctx2.resolvedSubject);
console.log('  ctx2.lastUserSubject:', ctx2.lastUserSubject);
console.log('  ctx2.changeDescriptor from compose():', ctx2.changeDescriptor);

// ─── TRACE 4: Multi-turn conversation ─────────────────────────────────────────
console.log('\n── MULTI-TURN TRACE (computer running hot) ──────');
global.SRConversation.reset();
global.SRContext.reset();

var turns = [
  "My computer has been running hot lately.",
  "What could cause that?",
  "What should I check first?",
  "I already did that.",
  "What would you try next?"
];

turns.forEach(function(msg, i) {
  var understood = global.SRUnderstanding.understand(msg);
  var context    = global.SRContext.update(understood, msg);
  var route      = global.SRResearchRouter ? global.SRResearchRouter.classify(msg) : { route:'?', reason:'?' };

  var result = { response: null, source: null };
  global.SRResponse.composeAsync(understood, context, {
    recentTurns:      global.SRConversation.getRecentTurns(6),
    adaptiveSnippets: [],
    memorySnippets:   [],
    knowledgeSnippet: null,
    researchSnippet:  null,
    langAnalysis:     null,
    resolvedRef:      null,
    negation:         null,
    concepts:         [],
    unknownWords:     [],
    comprehension:    null,
    personlityCtx:    null,
    assistantName:    'Shadow'
  }, function(r, s) { result.response = r; result.source = s; });

  global.SRConversation.addTurn('user', msg, understood.intent, understood.tone);
  global.SRConversation.addTurn('assistant', result.response, null, null);

  console.log('\nTURN ' + (i+1) + ': ' + JSON.stringify(msg));
  console.log('  intent  :', understood.intent, '| tone:', understood.tone);
  console.log('  route   :', route.route, '(' + route.reason + ')');
  console.log('  source  :', result.source);
  console.log('  response:', JSON.stringify(result.response));
  console.log('  subject :', context.lastUserSubject, '| topic:', context.currentTopic);
});

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════');
console.log('  ROOT CAUSE SUMMARY');
console.log('════════════════════════════════════════════════');
console.log('1. SRLocalModel starts in UNINITIALIZED state.');
console.log('2. loadModel() is NEVER called automatically at page load.');
console.log('3. composeAsync() branch 8: model≠READY → compose() deterministic fallback.');
console.log('4. For GENERAL_CONVERSATION/UNKNOWN intent with no special tone → POOLS.unknown');
console.log('   → "I want to follow — what are you saying?"');
console.log('5. For FOLLOW_UP intent (misclassification) → POOLS.followUpAcknowledge template');
console.log('   with garbage-filled {{subject}} and {{change}} slots');
console.log('   → "this AI all day and I: that. Noted. Anything else?"');
console.log('6. For GREETING intent → POOLS.greeting (this one IS correct as deterministic)');
console.log('7. Weather: classified correctly as WEATHER by SRResearchRouter,');
console.log('   BUT offline fallback handling in shadow-reaper.js calls callback()');
console.log('   with a weather message ONLY when routeResult.ok=false (no internet).');
console.log('   With no SRWeather fetch in the trace, the snippet=null, and compose()');
console.log('   returns UNKNOWN fallback for the weather query since intent may not be');
console.log('   WEATHER-specific in SRUnderstanding — it falls to POOLS.unknown.');
console.log('');
console.log('THE REAL PROBLEM HAS TWO INDEPENDENT ROOT CAUSES:');
console.log('A) SRLocalModel is never auto-loaded. All general conversation hits the');
console.log('   deterministic fallback pools, which were designed as EMERGENCY backups,');
console.log('   not as the primary conversation system.');
console.log('B) SRUnderstanding misclassifies "I\'ve been working on this AI all day..."');
console.log('   as FOLLOW_UP (because "this" is a pronoun and context was mis-resolved),');
console.log('   producing a nonsense template response instead of a model response.');
console.log('════════════════════════════════════════════════\n');
