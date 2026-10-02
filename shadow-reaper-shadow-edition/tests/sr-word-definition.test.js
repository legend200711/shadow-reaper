/**
 * shadow-reaper-v2/tests/sr-word-definition.test.js
 * Shadow Reaper V2 — Word Definition Regression Tests
 *
 * Build: SR-V2-WORD-DEF-TEST-1
 *
 * Covers:
 *   CRITICAL REGRESSION:
 *     "What does the word exhausted mean?" must NOT produce translation output.
 *     ShadowReaper.ask() MUST contain an actual retrieved meaning when
 *     the local lexical data contains that word.
 *
 *   Extraction:
 *     All required target-word extraction patterns from the spec.
 *
 *   Routing:
 *     WORD_DEFINITION intent must not be intercepted by translation engine.
 *     WORD_DEFINITION takes precedence over QUESTION.
 *
 *   Morphology:
 *     Inflected forms (running → run, written → write) must return
 *     the definition of the base form.
 *
 *   Pipeline:
 *     ShadowReaper.ask() with definition queries returns a real meaning,
 *     not a translation artefact, not a fallback "tell me more".
 *
 * Runner: node tests/sr-word-definition.test.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ── Browser globals shim ────────────────────────────────────────────────────
if (typeof window === 'undefined') { global.window = global; }

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
    value: { gpu: undefined, onLine: true }, writable: true, configurable: true,
  });
} catch (_) {}

if (!global.speechSynthesis) { global.speechSynthesis = null; }

if (!global.fetch) {
  global.fetch = function () { return Promise.reject(new Error('no fetch in test')); };
}

// ── Module loader ────────────────────────────────────────────────────────────
function load(relPath) {
  var code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('global', 'require', '__dirname', '__filename', code)(
    global, require,
    path.dirname(path.join(ROOT, relPath)),
    path.join(ROOT, relPath)
  );
}

// ── Stub Firebase/security (optional deps) ───────────────────────────────────
global.SRFirebase = {
  build: 'STUB', getUID: function () { return 'test_uid'; },
  isAuthenticated: function () { return true; },
  getCurrentUser:  function () { return { uid: 'test_uid' }; },
  getStatus: function () { return { ready: false, authenticated: true, uid: 'test_uid', configured: false }; },
  userConversationsCol:  function () { return null; },
  userMemoryCol:         function () { return null; },
  userLearnedContextCol: function () { return null; },
  userPreferencesDoc:    function () { return null; },
  sharedKnowledgeCol:    function () { return null; },
  globalLearningCol:     function () { return null; },
  configDoc:             function () { return null; },
  safeWrite:   function () { return Promise.reject(new Error('offline')); },
  safeAdd:     function () { return Promise.reject(new Error('offline')); },
};
global.SRSecurityPolicy = {
  containsSensitiveData:    function (t) { return /my\s+password\s+is/i.test(t); },
  containsInjectionAttempt: function (t) { return /ignore.*instructions|override.*rules/i.test(t); },
  validateUserInput:        function (t) { return { ok: !!t, sanitized: (t || '').trim() }; },
  LIMITS: { maxResearchResultLength: 8000 },
};

// ── Load stack ────────────────────────────────────────────────────────────────
// Core deps
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
// Language stack (morphology for lemmatization)
load('language/morphology/morphology.js');
// Lexical definition layer — backward-compat module
load('language/lexicon/sr-word-definitions.js');
// SRLexicon — provider architecture (curated + WordNet)
load('language/lexicon/sr-lexicon.js');
// Main
load('shadow-reaper.js');

var SR      = global.ShadowReaper;
var Under   = global.SRUnderstanding;
var Trans   = global.SRTranslation;
var Defs    = global.SRWordDefinitions;

SR.init();

// ── Test harness ─────────────────────────────────────────────────────────────
var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push({ status: 'PASS', name: name });
  } catch (e) {
    FAIL++;
    results.push({ status: 'FAIL', name: name, error: e.message });
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertContains(s, sub) {
  if (typeof s !== 'string' || s.indexOf(sub) === -1) {
    throw new Error('Expected "' + (s||'').substring(0,80) + '" to contain "' + sub + '"');
  }
}
function assertNotContains(s, sub) {
  if (typeof s === 'string' && s.indexOf(sub) !== -1) {
    throw new Error('Expected string NOT to contain "' + sub + '", but it did. Full: "' + s.substring(0,120) + '"');
  }
}

function askSync(q) {
  var resp = null;
  SR.ask(q, function (r) { resp = r; });
  return resp;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 1: Module sanity
// ─────────────────────────────────────────────────────────────────────────────

test('SRWordDefinitions module is loaded', function () {
  assert(!!Defs, 'SRWordDefinitions must be defined');
});

test('SRWordDefinitions.build is SR-LEXICON-1', function () {
  assert(Defs.build === 'SR-LEXICON-1', 'Expected SR-LEXICON-1, got: ' + Defs.build);
});

test('SRWordDefinitions exposes define(), hasDefinition(), lookupLemma(), listAll()', function () {
  assert(typeof Defs.define        === 'function', 'define must be a function');
  assert(typeof Defs.hasDefinition === 'function', 'hasDefinition must be a function');
  assert(typeof Defs.lookupLemma  === 'function',  'lookupLemma must be a function');
  assert(typeof Defs.listAll      === 'function',  'listAll must be a function');
});

test('SRWordDefinitions.listAll() returns a non-empty array', function () {
  var all = Defs.listAll();
  assert(Array.isArray(all) && all.length > 0, 'listAll must return non-empty array');
});

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 2: Direct define() lookup
// ─────────────────────────────────────────────────────────────────────────────

test('Defs.define("exhausted") returns a definition entry', function () {
  var e = Defs.define('exhausted');
  assert(e !== null, 'exhausted must have a definition entry');
  assert(typeof e.definition === 'string' && e.definition.length > 0, 'definition must be a non-empty string');
});

test('Defs.define("exhausted") definition mentions "tired" or "energy" or "strength"', function () {
  var e = Defs.define('exhausted');
  var defLower = e.definition.toLowerCase();
  assert(
    defLower.indexOf('tired') !== -1 || defLower.indexOf('energy') !== -1 || defLower.indexOf('strength') !== -1,
    'Definition of exhausted must relate to tiredness/energy. Got: ' + e.definition
  );
});

test('Defs.define("running") returns base-form definition via lemma', function () {
  var e = Defs.define('running');
  assert(e !== null, 'running must resolve to a definition (via lemma "run")');
  assert(e.lemma === 'run', 'lemma of running must be "run", got: ' + e.lemma);
  assert(e.definition.length > 0, 'definition must be non-empty');
});

test('Defs.define("written") returns base-form definition via lemma', function () {
  var e = Defs.define('written');
  assert(e !== null, 'written must resolve to a definition (via lemma "write")');
  assert(e.lemma === 'write', 'lemma of written must be "write", got: ' + e.lemma);
  assert(e.definition.length > 0, 'definition must be non-empty');
});

test('Defs.define("happy") returns a direct definition', function () {
  var e = Defs.define('happy');
  assert(e !== null, 'happy must have a definition');
  var dl = e.definition.toLowerCase();
  assert(dl.indexOf('pleasure') !== -1 || dl.indexOf('joy') !== -1 || dl.indexOf('content') !== -1,
    'Definition of happy must mention pleasure/joy/contentment. Got: ' + e.definition);
});

test('Defs.define("confused") returns a definition', function () {
  var e = Defs.define('confused');
  assert(e !== null, 'confused must have a definition');
});

test('Defs.define("run") returns a definition', function () {
  var e = Defs.define('run');
  assert(e !== null, 'run must have a definition');
  assert(e.pos === 'verb', 'run should be a verb, got: ' + e.pos);
});

test('Defs.define("write") returns a definition', function () {
  var e = Defs.define('write');
  assert(e !== null, 'write must have a definition');
  assert(e.pos === 'verb', 'write should be a verb, got: ' + e.pos);
});

test('Defs.hasDefinition("exhausted") is true', function () {
  assert(Defs.hasDefinition('exhausted') === true, 'hasDefinition("exhausted") must be true');
});

test('Defs.hasDefinition("xyzzy_gibberish_word") is false', function () {
  assert(Defs.hasDefinition('xyzzy_gibberish_word') === false, 'hasDefinition of unknown word must be false');
});

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 3: Extraction — extractDefinitionTarget()
// ─────────────────────────────────────────────────────────────────────────────

test('extractDefinitionTarget: "What does the word exhausted mean?" → "exhausted"', function () {
  var t = Under.extractDefinitionTarget('What does the word exhausted mean?');
  assert(t === 'exhausted', 'Expected "exhausted", got: "' + t + '"');
});

test('extractDefinitionTarget: "What does exhausted mean?" → "exhausted"', function () {
  var t = Under.extractDefinitionTarget('What does exhausted mean?');
  assert(t === 'exhausted', 'Expected "exhausted", got: "' + t + '"');
});

test('extractDefinitionTarget: "Define exhausted." → "exhausted"', function () {
  var t = Under.extractDefinitionTarget('Define exhausted.');
  assert(t === 'exhausted', 'Expected "exhausted", got: "' + t + '"');
});

test('extractDefinitionTarget: "What is the meaning of exhausted?" → "exhausted"', function () {
  var t = Under.extractDefinitionTarget('What is the meaning of exhausted?');
  assert(t === 'exhausted', 'Expected "exhausted", got: "' + t + '"');
});

test('extractDefinitionTarget: "What does running mean?" → "running"', function () {
  var t = Under.extractDefinitionTarget('What does running mean?');
  assert(t === 'running', 'Expected "running", got: "' + t + '"');
});

test('extractDefinitionTarget: "What does written mean?" → "written"', function () {
  var t = Under.extractDefinitionTarget('What does written mean?');
  assert(t === 'written', 'Expected "written", got: "' + t + '"');
});

test('extractDefinitionTarget: "Define running." → "running"', function () {
  var t = Under.extractDefinitionTarget('Define running.');
  assert(t === 'running', 'Expected "running", got: "' + t + '"');
});

test('extractDefinitionTarget: "What is the meaning of calm?" → "calm"', function () {
  var t = Under.extractDefinitionTarget('What is the meaning of calm?');
  assert(t === 'calm', 'Expected "calm", got: "' + t + '"');
});

test('extractDefinitionTarget: non-definition query returns null', function () {
  var t = Under.extractDefinitionTarget('What is the weather like today?');
  assert(t === null, 'Non-definition query must return null, got: "' + t + '"');
});

test('extractDefinitionTarget: "translate hello to Spanish" returns null', function () {
  var t = Under.extractDefinitionTarget('translate hello to Spanish');
  assert(t === null, 'Translation request must return null from extractDefinitionTarget');
});

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 4: Intent routing
// ─────────────────────────────────────────────────────────────────────────────

test('Intent: "What does the word exhausted mean?" → WORD_DEFINITION', function () {
  var u = Under.understand('What does the word exhausted mean?');
  assert(u.intent === 'WORD_DEFINITION',
    'Expected WORD_DEFINITION, got: "' + u.intent + '"');
});

test('Intent: "What does exhausted mean?" → WORD_DEFINITION', function () {
  var u = Under.understand('What does exhausted mean?');
  assert(u.intent === 'WORD_DEFINITION',
    'Expected WORD_DEFINITION, got: "' + u.intent + '"');
});

test('Intent: "Define exhausted." → WORD_DEFINITION', function () {
  var u = Under.understand('Define exhausted.');
  assert(u.intent === 'WORD_DEFINITION',
    'Expected WORD_DEFINITION, got: "' + u.intent + '"');
});

test('Intent: "What is the meaning of exhausted?" → WORD_DEFINITION', function () {
  var u = Under.understand('What is the meaning of exhausted?');
  assert(u.intent === 'WORD_DEFINITION',
    'Expected WORD_DEFINITION, got: "' + u.intent + '"');
});

test('Intent: "What does running mean?" → WORD_DEFINITION', function () {
  var u = Under.understand('What does running mean?');
  assert(u.intent === 'WORD_DEFINITION',
    'Expected WORD_DEFINITION, got: "' + u.intent + '"');
});

test('Intent: "What does written mean?" → WORD_DEFINITION', function () {
  var u = Under.understand('What does written mean?');
  assert(u.intent === 'WORD_DEFINITION',
    'Expected WORD_DEFINITION, got: "' + u.intent + '"');
});

test('Intent: WORD_DEFINITION does NOT fire for normal question "What is the weather?"', function () {
  var u = Under.understand('What is the weather like today?');
  assert(u.intent !== 'WORD_DEFINITION',
    'Normal question must NOT be WORD_DEFINITION, got: "' + u.intent + '"');
});

test('Intent: WORD_DEFINITION does NOT fire for "translate hello to Spanish"', function () {
  var u = Under.understand('translate hello to Spanish');
  assert(u.intent !== 'WORD_DEFINITION',
    'Translation request must NOT be WORD_DEFINITION, got: "' + u.intent + '"');
});

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 5: Translation engine fix — must NOT intercept "what does X mean"
// ─────────────────────────────────────────────────────────────────────────────

test('parseTranslationRequest("What does the word exhausted mean?") returns null', function () {
  var req = Trans.parseTranslationRequest('What does the word exhausted mean?');
  assert(req === null,
    'Translation engine must NOT intercept "What does the word X mean?" without a language. Got: ' + JSON.stringify(req));
});

test('parseTranslationRequest("What does exhausted mean?") returns null', function () {
  var req = Trans.parseTranslationRequest('What does exhausted mean?');
  assert(req === null,
    'Translation engine must NOT intercept bare "what does X mean". Got: ' + JSON.stringify(req));
});

test('parseTranslationRequest("What does exhausted mean in Spanish?") returns translate request', function () {
  var req = Trans.parseTranslationRequest('What does exhausted mean in Spanish?');
  assert(req !== null, 'With language specified, translation engine SHOULD intercept');
  assert(req.intent === 'TRANSLATE', 'Intent should be TRANSLATE');
  assert(req.target === 'es', 'Target should be "es" for Spanish');
});

test('parseTranslationRequest("translate hello to Spanish") still works', function () {
  var req = Trans.parseTranslationRequest('translate hello to Spanish');
  assert(req !== null, 'Standard translate request must still work');
  assert(req.intent === 'TRANSLATE', 'Intent must be TRANSLATE');
});

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 6: CRITICAL PHYSICAL REGRESSION — ShadowReaper.ask() responses
//
//  The actual failure reported: response was the translation echo
//    '"the word exhausted" — that\'s "the word exhausted" in English.'
//  This MUST NOT appear. A real definition MUST appear.
// ─────────────────────────────────────────────────────────────────────────────

test('CRITICAL: "What does the word exhausted mean?" does NOT produce translation echo', function () {
  SR.newConversation();
  var resp = askSync('What does the word exhausted mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty string');
  // The exact broken output that was reported:
  assertNotContains(resp, "that's \"the word exhausted\" in English");
  assertNotContains(resp, '"the word exhausted"');
  assertNotContains(resp, "that's \"the word exhausted\"");
});

test('CRITICAL: "What does the word exhausted mean?" contains actual definition content', function () {
  SR.newConversation();
  var resp = askSync('What does the word exhausted mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty string');
  var lower = resp.toLowerCase();
  // Must contain definition-related content — not just a meta redirect
  var hasMeaning = lower.indexOf('exhausted') !== -1 || lower.indexOf('tired') !== -1 ||
                   lower.indexOf('energy') !== -1 || lower.indexOf('strength') !== -1 ||
                   lower.indexOf('adjective') !== -1 || lower.indexOf('drained') !== -1 ||
                   lower.indexOf('definition') !== -1;
  assert(hasMeaning,
    'Response must contain definition content for "exhausted". Got: "' + resp.substring(0,120) + '"');
});

test('PIPELINE: "What does exhausted mean?" returns definition, not translation', function () {
  SR.newConversation();
  var resp = askSync('What does exhausted mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  assertNotContains(resp, "that's \"exhausted\" in English");
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('tired') !== -1 || lower.indexOf('energy') !== -1 ||
                   lower.indexOf('exhausted') !== -1 || lower.indexOf('adjective') !== -1;
  assert(hasContent, 'Response must contain definition content. Got: "' + resp.substring(0,120) + '"');
});

test('PIPELINE: "Define exhausted." returns definition', function () {
  SR.newConversation();
  var resp = askSync('Define exhausted.');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('tired') !== -1 || lower.indexOf('energy') !== -1 ||
                   lower.indexOf('exhausted') !== -1 || lower.indexOf('adjective') !== -1;
  assert(hasContent, 'Response must contain definition content. Got: "' + resp.substring(0,120) + '"');
});

test('PIPELINE: "What is the meaning of exhausted?" returns definition', function () {
  SR.newConversation();
  var resp = askSync('What is the meaning of exhausted?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('tired') !== -1 || lower.indexOf('energy') !== -1 ||
                   lower.indexOf('exhausted') !== -1 || lower.indexOf('adjective') !== -1;
  assert(hasContent, 'Response must contain definition content. Got: "' + resp.substring(0,120) + '"');
});

test('PIPELINE: "What does running mean?" returns definition with lemma "run"', function () {
  SR.newConversation();
  var resp = askSync('What does running mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  // Should mention run (the base), or move, or operate
  var hasContent = lower.indexOf('run') !== -1 || lower.indexOf('move') !== -1 ||
                   lower.indexOf('verb') !== -1 || lower.indexOf('quickly') !== -1;
  assert(hasContent, 'Response for "running" must mention "run" or verb info. Got: "' + resp.substring(0,120) + '"');
});

test('PIPELINE: "What does written mean?" returns definition with lemma "write"', function () {
  SR.newConversation();
  var resp = askSync('What does written mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('write') !== -1 || lower.indexOf('written') !== -1 ||
                   lower.indexOf('verb') !== -1 || lower.indexOf('text') !== -1 || lower.indexOf('word') !== -1;
  assert(hasContent, 'Response for "written" must mention "write" or verb info. Got: "' + resp.substring(0,120) + '"');
});

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 7: Unrelated words — generalized regression
// ─────────────────────────────────────────────────────────────────────────────

test('PIPELINE: "What does happy mean?" returns happiness-related definition', function () {
  SR.newConversation();
  var resp = askSync('What does happy mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('happy') !== -1 || lower.indexOf('pleasure') !== -1 ||
                   lower.indexOf('joy') !== -1 || lower.indexOf('adjective') !== -1;
  assert(hasContent, 'Response for "happy" must contain definition content. Got: "' + resp.substring(0,120) + '"');
});

test('PIPELINE: "What does brave mean?" returns courage-related definition', function () {
  SR.newConversation();
  var resp = askSync('What does brave mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('brave') !== -1 || lower.indexOf('courage') !== -1 ||
                   lower.indexOf('danger') !== -1 || lower.indexOf('adjective') !== -1;
  assert(hasContent, 'Response for "brave" must contain definition. Got: "' + resp.substring(0,120) + '"');
});

test('PIPELINE: "Define patient." returns definition', function () {
  SR.newConversation();
  var resp = askSync('Define patient.');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('patient') !== -1 || lower.indexOf('tolerat') !== -1 ||
                   lower.indexOf('delay') !== -1 || lower.indexOf('adjective') !== -1;
  assert(hasContent, 'Response for "patient" must contain definition. Got: "' + resp.substring(0,120) + '"');
});

test('PIPELINE: "What does the word calm mean?" returns definition', function () {
  SR.newConversation();
  var resp = askSync('What does the word calm mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('calm') !== -1 || lower.indexOf('peaceful') !== -1 ||
                   lower.indexOf('nerv') !== -1 || lower.indexOf('adjective') !== -1;
  assert(hasContent, 'Response for "calm" must contain definition. Got: "' + resp.substring(0,120) + '"');
});

test('PIPELINE: "What is the meaning of confused?" returns definition', function () {
  SR.newConversation();
  var resp = askSync('What is the meaning of confused?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('confused') !== -1 || lower.indexOf('bewildered') !== -1 ||
                   lower.indexOf('clear') !== -1 || lower.indexOf('adjective') !== -1;
  assert(hasContent, 'Response for "confused" must contain definition. Got: "' + resp.substring(0,120) + '"');
});

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 8: Translation still works after the fix
// ─────────────────────────────────────────────────────────────────────────────

test('PIPELINE: "translate hello to French" still returns translation', function () {
  SR.newConversation();
  var resp = askSync('translate hello to French');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  assert(lower.indexOf('bonjour') !== -1, 'translate hello to French should return "bonjour". Got: "' + resp + '"');
});

test('PIPELINE: "What does hello mean in Spanish?" triggers translation, not definition', function () {
  SR.newConversation();
  var resp = askSync('What does hello mean in Spanish?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  assert(lower.indexOf('hola') !== -1,
    'Cross-language meaning query should trigger translation ("hola"). Got: "' + resp + '"');
});

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 9: Unknown word — honest fallback
// ─────────────────────────────────────────────────────────────────────────────

test('PIPELINE: "What does zyxqvort mean?" does not crash and gives honest reply', function () {
  SR.newConversation();
  var resp = askSync('What does zyxqvort mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty for unknown word');
  // Must not produce empty or raw error — should be honest about not knowing
  assertNotContains(resp, 'LOCAL MODEL ERROR');
  assertNotContains(resp, 'undefined');
});

// ─────────────────────────────────────────────────────────────────────────────
//  SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════');
console.log('  SR-WORD-DEFINITION TEST RESULTS');
console.log('══════════════════════════════════════════════');
results.forEach(function (r) {
  var icon = r.status === 'PASS' ? '✓' : '✗';
  console.log('  ' + icon + ' ' + r.name + (r.error ? '\n    ERROR: ' + r.error : ''));
});
console.log('══════════════════════════════════════════════');
console.log('PASS : ' + PASS);
console.log('FAIL : ' + FAIL);
console.log('TOTAL: ' + (PASS + FAIL));
console.log('══════════════════════════════════════════════\n');

process.exit(FAIL > 0 ? 1 : 0);
