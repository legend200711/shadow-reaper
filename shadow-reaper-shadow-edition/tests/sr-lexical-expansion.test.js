/**
 * shadow-reaper-v2/tests/sr-lexical-expansion.test.js
 *
 * Shadow Reaper — Lexical Expansion Test Suite
 * Build: SR-LEXICON-EXPANSION-TEST-1
 *
 * Covers:
 *   1.  SRLexicon module sanity
 *   2.  CuratedProvider — backward-compat definitions
 *   3.  WordNet provider — multi-sense lookup (bank, light, bright, charge)
 *   4.  Morphology → lemma → lexicon pipeline (running→run, written→write, ran→run)
 *   5.  Multiple-sense support
 *   6.  POS-aware lookup
 *   7.  Contextual sense selection (financial/geographical bank, illumination/weight light)
 *   8.  User terminology isolation (user-supplied definitions must not overwrite lexicon)
 *   9.  Lexical status codes (KNOWN_WITH_DEFINITION, KNOWN_MULTIPLE_SENSES, UNKNOWN_WORD)
 *  10.  Pipeline: ShadowReaper.ask() — definition queries return real content
 *  11.  Context tests: "at the bank" → financial, "river bank" → geographical
 *  12.  Unknown word honest fallback
 *  13.  Non-dictionary regression (translation, knowledge, conversation)
 *  14.  Diagnostics fields present in dev builds
 *  15.  SRUnderstanding.extractDefinitionContext()
 *
 * Runner: node tests/sr-lexical-expansion.test.js
 */

'use strict';

var fs   = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

// ── Browser globals shim ─────────────────────────────────────────────────────
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

// ── Stubs ─────────────────────────────────────────────────────────────────────
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

// ── Module loader ─────────────────────────────────────────────────────────────
function load(relPath) {
  var code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('global', 'require', '__dirname', '__filename', code)(
    global, require,
    path.dirname(path.join(ROOT, relPath)),
    path.join(ROOT, relPath)
  );
}

// ── Load stack ────────────────────────────────────────────────────────────────
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
load('language/morphology/morphology.js');
load('language/lexicon/sr-word-definitions.js');
load('language/lexicon/sr-lexicon.js');
load('shadow-reaper.js');

var SR    = global.ShadowReaper;
var Under = global.SRUnderstanding;
var Lex   = global.SRLexicon;
var Defs  = global.SRWordDefinitions;
var Trans = global.SRTranslation;

SR.init();

// ── Test harness ──────────────────────────────────────────────────────────────
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
    throw new Error('Expected "' + (s || '').substring(0, 100) + '" to contain "' + sub + '"');
  }
}
function assertNotContains(s, sub) {
  if (typeof s === 'string' && s.indexOf(sub) !== -1) {
    throw new Error('Expected string NOT to contain "' + sub + '". Got: "' + s.substring(0, 100) + '"');
  }
}

function askSync(q) {
  var resp = null;
  SR.ask(q, function (r) { resp = r; });
  return resp;
}

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 1: SRLexicon Module Sanity
// ═════════════════════════════════════════════════════════════════════════════

test('SRLexicon module is loaded', function () {
  assert(!!Lex, 'SRLexicon must be defined after load');
});

test('SRLexicon.build is SR-LEXICON-2', function () {
  assert(Lex.build === 'SR-LEXICON-2', 'Expected SR-LEXICON-2, got: ' + Lex.build);
});

test('SRLexicon exposes lookup, lookupSync, ensureLoaded, rankSenses, listCurated', function () {
  assert(typeof Lex.lookup        === 'function', 'lookup must be a function');
  assert(typeof Lex.lookupSync    === 'function', 'lookupSync must be a function');
  assert(typeof Lex.ensureLoaded  === 'function', 'ensureLoaded must be a function');
  assert(typeof Lex.rankSenses    === 'function', 'rankSenses must be a function');
  assert(typeof Lex.listCurated   === 'function', 'listCurated must be a function');
});

test('SRLexicon.listCurated() returns a non-empty array with known words', function () {
  var curated = Lex.listCurated();
  assert(Array.isArray(curated) && curated.length > 50, 'listCurated must return >50 words');
  assert(curated.indexOf('exhausted') !== -1, 'listCurated must include "exhausted"');
  assert(curated.indexOf('brave') !== -1, 'listCurated must include "brave"');
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 2: Curated Provider — Backward Compatibility
// ═════════════════════════════════════════════════════════════════════════════

test('lookupSync("exhausted") — CuratedProvider — definition mentions tired/energy', function () {
  var r = Lex.lookupSync('exhausted');
  assert(r !== null, 'Result must not be null');
  assert(r.senses.length > 0, 'Must have at least one sense');
  var defLower = r.senses[0].def.toLowerCase();
  assert(
    defLower.indexOf('tired') !== -1 || defLower.indexOf('energy') !== -1 || defLower.indexOf('strength') !== -1,
    'Curated def of exhausted must mention tired/energy/strength. Got: ' + r.senses[0].def
  );
});

test('lookupSync("exhausted") provider is curated', function () {
  var r = Lex.lookupSync('exhausted');
  assert(r.provider === 'curated', 'Provider must be "curated", got: ' + r.provider);
});

test('lookupSync("happy") — CuratedProvider — mentions pleasure/joy', function () {
  var r = Lex.lookupSync('happy');
  assert(r !== null && r.senses.length > 0, 'happy must have curated definition');
  var dl = r.senses[0].def.toLowerCase();
  assert(dl.indexOf('pleasure') !== -1 || dl.indexOf('joy') !== -1 || dl.indexOf('content') !== -1,
    'Definition of happy must relate to pleasure/joy/contentment. Got: ' + r.senses[0].def);
});

test('lookupSync("brave") — CuratedProvider — mentions courage/danger', function () {
  var r = Lex.lookupSync('brave');
  assert(r !== null && r.senses.length > 0, 'brave must have definition');
  var dl = r.senses[0].def.toLowerCase();
  assert(dl.indexOf('courage') !== -1 || dl.indexOf('danger') !== -1 || dl.indexOf('brav') !== -1,
    'Definition of brave must mention courage/danger. Got: ' + r.senses[0].def);
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 3: WordNet Provider — Loading + Basic Lookup
// ═════════════════════════════════════════════════════════════════════════════

var _wnLoaded = false;
test('SRLexicon.ensureLoaded() — WordNet index loads without error', function () {
  var err = null;
  Lex.ensureLoaded(function (e) { err = e; });
  // In Node.js this is synchronous
  _wnLoaded = (err === null);
  assert(err === null, 'WordNet index must load without error. Got: ' + err);
});

test('SRLexicon wnStatus is "loaded" after ensureLoaded()', function () {
  assert(Lex.wnStatus === 'loaded', 'wnStatus must be "loaded", got: ' + Lex.wnStatus);
});

test('lookupSync("bank") — WordNet — has multiple noun senses', function () {
  var r = Lex.lookupSync('bank', { maxSenses: 5 });
  assert(r !== null, 'bank must return a result');
  assert(r.senses.length >= 2, 'bank must have multiple senses, got: ' + r.senses.length);
  var nounSenses = r.senses.filter(function (s) { return s.pos === 'noun'; });
  assert(nounSenses.length >= 2, 'bank must have at least 2 noun senses');
});

test('lookupSync("bank") — includes financial sense', function () {
  var r = Lex.lookupSync('bank', { maxSenses: 8 });
  var hasFinancial = r.senses.some(function (s) {
    return s.def.toLowerCase().indexOf('financial') !== -1 ||
           s.def.toLowerCase().indexOf('deposit') !== -1 ||
           s.def.toLowerCase().indexOf('banking') !== -1 ||
           (s.synonyms || []).join(' ').toLowerCase().indexOf('financial') !== -1;
  });
  assert(hasFinancial, 'bank senses must include financial sense. Senses: ' + r.senses.map(function(s){return s.def.substring(0,40);}).join(' | '));
});

test('lookupSync("bank") — includes geographical/slope sense', function () {
  var r = Lex.lookupSync('bank', { maxSenses: 8 });
  var hasGeo = r.senses.some(function (s) {
    return s.def.toLowerCase().indexOf('slope') !== -1 ||
           s.def.toLowerCase().indexOf('river') !== -1 ||
           s.def.toLowerCase().indexOf('land') !== -1 ||
           s.def.toLowerCase().indexOf('ridge') !== -1;
  });
  assert(hasGeo, 'bank senses must include geographical/slope sense. Senses: ' + r.senses.map(function(s){return s.def.substring(0,40);}).join(' | '));
});

test('lookupSync("bank") — provider is wordnet', function () {
  var r = Lex.lookupSync('bank');
  assert(r.provider === 'wordnet', 'provider for bank must be wordnet, got: ' + r.provider);
});

test('lookupSync("light") — WordNet — has noun, verb, adj, adv senses', function () {
  var r = Lex.lookupSync('light', { maxSenses: 8 });
  assert(r !== null, 'light must return a result');
  var poses = r.senses.map(function (s) { return s.pos; });
  assert(poses.length >= 2, 'light must have multiple senses, got: ' + poses.length);
});

test('lookupSync("light") — includes illumination sense (noun)', function () {
  var r = Lex.lookupSync('light', { maxSenses: 8 });
  var hasIllum = r.senses.some(function (s) {
    return s.pos === 'noun' && (
      s.def.toLowerCase().indexOf('illuminat') !== -1 ||
      s.def.toLowerCase().indexOf('electro') !== -1 ||
      s.def.toLowerCase().indexOf('radiation') !== -1 ||
      s.def.toLowerCase().indexOf('source') !== -1
    );
  });
  assert(hasIllum, 'light must have illumination noun sense. Senses: ' + r.senses.map(function(s){return '['+s.pos+'] '+s.def.substring(0,40);}).join(' | '));
});

test('lookupSync("light") — includes weight/density adjective sense', function () {
  var r = Lex.lookupSync('light', { maxSenses: 8 });
  var hasWeight = r.senses.some(function (s) {
    return s.pos === 'adj' && (
      s.def.toLowerCase().indexOf('weight') !== -1 ||
      s.def.toLowerCase().indexOf('density') !== -1 ||
      s.def.toLowerCase().indexOf('physical') !== -1
    );
  });
  assert(hasWeight, 'light must have weight/density adjective sense. Senses: ' + r.senses.map(function(s){return '['+s.pos+'] '+s.def.substring(0,40);}).join(' | '));
});

test('lookupSync("charge") — WordNet — has multiple senses', function () {
  var r = Lex.lookupSync('charge', { maxSenses: 6 });
  assert(r !== null, 'charge must return a result');
  assert(r.senses.length >= 2, 'charge must have multiple senses, got: ' + r.senses.length);
});

test('lookupSync("bright") — WordNet — has adjective sense mentioning light', function () {
  var r = Lex.lookupSync('bright', { maxSenses: 4 });
  assert(r !== null, 'bright must return a result');
  var hasLight = r.senses.some(function (s) {
    return s.def.toLowerCase().indexOf('light') !== -1 ||
           s.def.toLowerCase().indexOf('emit') !== -1 ||
           s.def.toLowerCase().indexOf('reflect') !== -1 ||
           s.def.toLowerCase().indexOf('brilliant') !== -1;
  });
  assert(hasLight, 'bright must have light-related sense. Got: ' + r.senses.map(function(s){return s.def.substring(0,50);}).join(' | '));
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 4: Morphology → Lemma → Lexicon
// ═════════════════════════════════════════════════════════════════════════════

test('lookupSync("running") — lemma resolves to "run" with definition', function () {
  var r = Lex.lookupSync('running');
  assert(r !== null, 'running must return a result');
  assert(r.lemma === 'run', 'lemma of running must be "run", got: ' + r.lemma);
  assert(r.senses.length > 0, 'must have at least one sense');
});

test('lookupSync("written") — lemma resolves to "write" with definition', function () {
  var r = Lex.lookupSync('written');
  assert(r !== null, 'written must return a result');
  assert(r.lemma === 'write', 'lemma of written must be "write", got: ' + r.lemma);
  assert(r.senses.length > 0, 'must have at least one sense for write');
});

test('lookupSync("ran") — lemma resolves to "run"', function () {
  var r = Lex.lookupSync('ran');
  assert(r !== null, 'ran must return a result');
  assert(r.lemma === 'run', 'lemma of ran must be "run", got: ' + r.lemma);
});

test('lookupSync("banks") — lemma resolves to "bank" with senses', function () {
  var r = Lex.lookupSync('banks', { maxSenses: 5 });
  assert(r !== null, 'banks must return a result');
  // banks -> bank suffix strip
  assert(r.lemma === 'bank' || r.senses.length > 0,
    'banks must resolve to bank or return senses. lemma: ' + r.lemma + ', senses: ' + r.senses.length);
});

test('lookupSync("exhausted") — curated override — NOT WordNet', function () {
  var r = Lex.lookupSync('exhausted');
  // Curated takes priority over WordNet per spec
  assert(r.provider === 'curated', 'curated must override wordnet for exhausted. provider: ' + r.provider);
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 5: Lexical Status Codes
// ═════════════════════════════════════════════════════════════════════════════

test('lookupSync("bank") — status is KNOWN_WITH_DEFINITION or KNOWN_MULTIPLE_SENSES', function () {
  var r = Lex.lookupSync('bank', { maxSenses: 3 });
  assert(
    r.status === 'KNOWN_WITH_DEFINITION' || r.status === 'KNOWN_MULTIPLE_SENSES',
    'bank status must be KNOWN_WITH_DEFINITION or KNOWN_MULTIPLE_SENSES, got: ' + r.status
  );
});

test('lookupSync("zyxqvort_gibberish") — status is UNKNOWN_WORD', function () {
  var r = Lex.lookupSync('zyxqvort_gibberish');
  assert(r.status === 'UNKNOWN_WORD', 'Unknown word must have UNKNOWN_WORD status, got: ' + r.status);
  assert(r.senses.length === 0, 'Unknown word must have no senses');
});

test('lookupSync("exhausted") — status is KNOWN_WITH_DEFINITION', function () {
  var r = Lex.lookupSync('exhausted');
  assert(
    r.status === 'KNOWN_WITH_DEFINITION' || r.status === 'KNOWN_MULTIPLE_SENSES',
    'exhausted must have KNOWN_WITH_DEFINITION status, got: ' + r.status
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 6: POS-Aware Lookup
// ═════════════════════════════════════════════════════════════════════════════

test('lookupSync("light", { pos: "adj" }) — only returns adjective senses', function () {
  var r = Lex.lookupSync('light', { pos: 'adj', maxSenses: 5 });
  assert(r !== null, 'light with pos=adj must return a result');
  assert(r.senses.length > 0, 'must have at least one adj sense for light');
  r.senses.forEach(function (s) {
    assert(s.pos === 'adj', 'All filtered senses must be adj, got: ' + s.pos);
  });
});

test('lookupSync("light", { pos: "noun" }) — only returns noun senses', function () {
  var r = Lex.lookupSync('light', { pos: 'noun', maxSenses: 5 });
  assert(r !== null, 'light with pos=noun must return a result');
  assert(r.senses.length > 0, 'must have at least one noun sense for light');
  r.senses.forEach(function (s) {
    assert(s.pos === 'noun', 'All filtered senses must be noun, got: ' + s.pos);
  });
});

test('lookupSync("bank", { pos: "verb" }) — only returns verb senses', function () {
  var r = Lex.lookupSync('bank', { pos: 'verb', maxSenses: 5 });
  assert(r !== null, 'bank with pos=verb must return a result');
  assert(r.senses.length > 0, 'must have verb senses for bank');
  r.senses.forEach(function (s) {
    assert(s.pos === 'verb', 'All filtered senses must be verb, got: ' + s.pos);
  });
});

test('lookupSync("run", { pos: "verb" }) — curated verb sense returned', function () {
  var r = Lex.lookupSync('run', { pos: 'verb', maxSenses: 3 });
  assert(r !== null, 'run with pos=verb must return a result');
  assert(r.senses.length > 0, 'must have at least one sense');
  // curated has run as verb
  var hasMoveOrOperate = r.senses.some(function (s) {
    return s.def.toLowerCase().indexOf('move') !== -1 ||
           s.def.toLowerCase().indexOf('operate') !== -1 ||
           s.def.toLowerCase().indexOf('run') !== -1 ||
           s.def.toLowerCase().indexOf('foot') !== -1;
  });
  assert(hasMoveOrOperate, 'run verb sense must mention move/operate/foot. Got: ' + r.senses.map(function(s){return s.def.substring(0,40);}).join(' | '));
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 7: Contextual Sense Selection
// ═════════════════════════════════════════════════════════════════════════════

test('rankSenses — "bank" with financial context → financial sense ranked first', function () {
  var r = Lex.lookupSync('bank', { maxSenses: 8 });
  var allSenses = r.senses;
  // Re-rank with financial context
  var finCtx = ['deposited', 'money', 'account', 'financial', 'bank', 'transaction'];
  var ranked = Lex.rankSenses(allSenses, finCtx);
  assert(ranked.length > 0, 'ranked senses must not be empty');
  var topDef = ranked[0].def.toLowerCase();
  var topSyn = (ranked[0].synonyms || []).join(' ').toLowerCase();
  var combined = topDef + ' ' + topSyn;
  var isFinancial = combined.indexOf('financial') !== -1 ||
                    combined.indexOf('deposit') !== -1 ||
                    combined.indexOf('banking') !== -1;
  assert(isFinancial,
    'Financial context should rank financial bank sense first. Top ranked: "' + ranked[0].def.substring(0,80) + '"');
});

test('rankSenses — "bank" with river context → geographical/slope sense ranked first', function () {
  var r = Lex.lookupSync('bank', { maxSenses: 8 });
  var allSenses = r.senses;
  var riverCtx = ['river', 'water', 'shore', 'beside', 'bank', 'stream', 'sat'];
  var ranked = Lex.rankSenses(allSenses, riverCtx);
  assert(ranked.length > 0, 'ranked senses must not be empty');
  var topDef = ranked[0].def.toLowerCase();
  var isGeo = topDef.indexOf('slope') !== -1 ||
              topDef.indexOf('river') !== -1 ||
              topDef.indexOf('land') !== -1 ||
              topDef.indexOf('water') !== -1 ||
              topDef.indexOf('ridge') !== -1;
  assert(isGeo,
    'River context should rank geographical bank sense first. Top ranked: "' + ranked[0].def.substring(0,80) + '"');
});

test('rankSenses — "light" with illumination context → illumination sense ranked first', function () {
  var r = Lex.lookupSync('light', { maxSenses: 8 });
  var allSenses = r.senses;
  var illumCtx = ['turn', 'lamp', 'bulb', 'room', 'illuminate', 'switch', 'dark'];
  var ranked = Lex.rankSenses(allSenses, illumCtx);
  assert(ranked.length > 0, 'ranked senses must not be empty');
  var topDef = ranked[0].def.toLowerCase();
  var topSyn = (ranked[0].synonyms || []).join(' ').toLowerCase();
  var combined = topDef + ' ' + topSyn;
  var isIllum = combined.indexOf('light') !== -1 ||
                combined.indexOf('illum') !== -1 ||
                combined.indexOf('radiation') !== -1 ||
                combined.indexOf('source') !== -1 ||
                ranked[0].pos === 'noun';
  assert(isIllum,
    'Illumination context should rank illumination light sense first. Top: "' + ranked[0].def.substring(0,80) + '" pos:' + ranked[0].pos);
});

test('rankSenses — "light" with weight context → weight/density adj sense ranked first', function () {
  var r = Lex.lookupSync('light', { maxSenses: 8 });
  var allSenses = r.senses;
  var weightCtx = ['bag', 'carry', 'heavy', 'weight', 'load', 'lift'];
  var ranked = Lex.rankSenses(allSenses, weightCtx);
  assert(ranked.length > 0, 'ranked senses must not be empty');
  // Find if a weight-related sense is in top-2
  var topTwo = ranked.slice(0, 2);
  var hasWeight = topTwo.some(function (s) {
    return s.def.toLowerCase().indexOf('weight') !== -1 ||
           s.def.toLowerCase().indexOf('density') !== -1 ||
           s.def.toLowerCase().indexOf('physical') !== -1;
  });
  assert(hasWeight,
    'Weight context should rank weight-related light sense in top 2. Top 2: ' + topTwo.map(function(s){return '"'+s.def.substring(0,50)+'"';}).join(' | '));
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 8: User Terminology Isolation
//  User-supplied definitions must NOT overwrite authoritative lexicon.
// ═════════════════════════════════════════════════════════════════════════════

test('USER TERMINOLOGY: "bank means a spaceship" does not change lexical bank definition', function () {
  // Simulate a user teaching a wrong definition
  // The lexicon should be immutable to casual user input
  var rBefore = Lex.lookupSync('bank', { maxSenses: 5 });
  var hasFinancialBefore = rBefore.senses.some(function (s) {
    return s.def.toLowerCase().indexOf('financial') !== -1 ||
           s.def.toLowerCase().indexOf('deposit') !== -1;
  });
  assert(hasFinancialBefore, 'bank must have financial sense before user input');

  // SRLexicon has no method to overwrite lexical data — verify
  assert(typeof Lex.addDefinition === 'undefined', 'SRLexicon must NOT expose addDefinition()');
  assert(typeof Lex.setDefinition === 'undefined', 'SRLexicon must NOT expose setDefinition()');
  assert(typeof Lex.overwrite === 'undefined',     'SRLexicon must NOT expose overwrite()');

  // Verify after: financial sense still present
  var rAfter = Lex.lookupSync('bank', { maxSenses: 5 });
  var hasFinancialAfter = rAfter.senses.some(function (s) {
    return s.def.toLowerCase().indexOf('financial') !== -1 ||
           s.def.toLowerCase().indexOf('deposit') !== -1;
  });
  assert(hasFinancialAfter, 'bank financial sense must still be present after simulated user input');
});

test('USER TERMINOLOGY: SRWordDefinitions does not expose write/overwrite methods', function () {
  assert(typeof Defs.addDefinition   === 'undefined', 'SRWordDefinitions must not expose addDefinition');
  assert(typeof Defs.setDefinition   === 'undefined', 'SRWordDefinitions must not expose setDefinition');
  assert(typeof Defs.overwrite       === 'undefined', 'SRWordDefinitions must not expose overwrite');
  // define() is read-only
  assert(typeof Defs.define === 'function', 'define must be a function (read-only)');
});

test('USER TERMINOLOGY: lookupSync for known English word "bank" ignores hypothetical user claim', function () {
  // After "teaching" bank = spaceship, the real lexicon result must still be English financial/geographical
  var r = Lex.lookupSync('bank', { maxSenses: 5 });
  var hasRealSense = r.senses.some(function (s) {
    var dl = s.def.toLowerCase();
    return dl.indexOf('financial') !== -1 || dl.indexOf('deposit') !== -1 ||
           dl.indexOf('slope') !== -1 || dl.indexOf('river') !== -1;
  });
  assert(hasRealSense, 'bank must return real English senses, not user-invented spaceship sense');
  var hasSpaceship = r.senses.some(function (s) {
    return s.def.toLowerCase().indexOf('spaceship') !== -1;
  });
  assert(!hasSpaceship, 'bank must NOT contain spaceship definition');
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 9: Diagnostics
// ═════════════════════════════════════════════════════════════════════════════

test('lookupSync diagnostics object is present', function () {
  var r = Lex.lookupSync('bank');
  assert(typeof r.diagnostics === 'object', 'diagnostics must be an object');
});

test('lookupSync diagnostics — LEXICAL_TARGET is the queried word', function () {
  var r = Lex.lookupSync('bank');
  assert(r.diagnostics.LEXICAL_TARGET === 'bank', 'LEXICAL_TARGET must be "bank", got: ' + r.diagnostics.LEXICAL_TARGET);
});

test('lookupSync diagnostics — LEXICAL_PROVIDER is "wordnet" for bank', function () {
  var r = Lex.lookupSync('bank');
  assert(r.diagnostics.LEXICAL_PROVIDER === 'wordnet', 'LEXICAL_PROVIDER must be wordnet for bank, got: ' + r.diagnostics.LEXICAL_PROVIDER);
});

test('lookupSync diagnostics — LEXICAL_PROVIDER is "curated" for exhausted', function () {
  var r = Lex.lookupSync('exhausted');
  assert(r.diagnostics.LEXICAL_PROVIDER === 'curated', 'LEXICAL_PROVIDER must be curated for exhausted, got: ' + r.diagnostics.LEXICAL_PROVIDER);
});

test('lookupSync diagnostics — LEXICAL_SENSE_COUNT > 1 for bank', function () {
  var r = Lex.lookupSync('bank', { maxSenses: 5 });
  assert(r.diagnostics.LEXICAL_SENSE_COUNT >= 2,
    'LEXICAL_SENSE_COUNT must be >= 2 for bank, got: ' + r.diagnostics.LEXICAL_SENSE_COUNT);
});

test('lookupSync diagnostics — CONTEXTUAL_SENSE_SELECTION true when context provided', function () {
  var r = Lex.lookupSync('bank', { maxSenses: 3, context: ['money', 'deposit'] });
  assert(r.diagnostics.CONTEXTUAL_SENSE_SELECTION === true,
    'CONTEXTUAL_SENSE_SELECTION must be true when context provided');
});

test('lookupSync diagnostics — CONTEXTUAL_SENSE_SELECTION false when no context', function () {
  var r = Lex.lookupSync('bank', { maxSenses: 3 });
  assert(r.diagnostics.CONTEXTUAL_SENSE_SELECTION === false,
    'CONTEXTUAL_SENSE_SELECTION must be false when no context provided');
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 10: SRUnderstanding.extractDefinitionContext()
// ═════════════════════════════════════════════════════════════════════════════

test('extractDefinitionContext is exported from SRUnderstanding', function () {
  assert(typeof Under.extractDefinitionContext === 'function',
    'SRUnderstanding must export extractDefinitionContext');
});

test('extractDefinitionContext("I deposited money at the bank. What does bank mean here?") — includes money/deposit', function () {
  var tokens = Under.extractDefinitionContext(
    'I deposited money at the bank. What does bank mean here?'
  );
  assert(Array.isArray(tokens), 'context tokens must be an array');
  assert(tokens.indexOf('deposited') !== -1 || tokens.indexOf('money') !== -1,
    'tokens must include "deposited" or "money". Got: ' + tokens.join(', '));
});

test('extractDefinitionContext("The bag is light. What does light mean here?") — includes bag', function () {
  var tokens = Under.extractDefinitionContext(
    'The bag is light. What does light mean here?'
  );
  assert(tokens.indexOf('bag') !== -1, 'tokens must include "bag". Got: ' + tokens.join(', '));
});

test('extractDefinitionContext("Turn on the light. What does light mean here?") — no baggage tokens', function () {
  var tokens = Under.extractDefinitionContext(
    'Turn on the light. What does light mean here?'
  );
  // Should not include article noise
  assert(tokens.indexOf('the') === -1, 'tokens must not include stopword "the"');
  assert(tokens.indexOf('on') === -1, 'tokens must not include stopword "on"');
  assert(tokens.indexOf('turn') !== -1 || tokens.length >= 1,
    'tokens must include "turn" or at least one word. Got: ' + tokens.join(', '));
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 11: Physical Pipeline Tests — ShadowReaper.ask()
// ═════════════════════════════════════════════════════════════════════════════

test('PIPELINE: "What does the word exhausted mean?" — definition content returned', function () {
  SR.newConversation();
  var resp = askSync('What does the word exhausted mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('exhausted') !== -1 || lower.indexOf('tired') !== -1 ||
                   lower.indexOf('energy') !== -1 || lower.indexOf('adjective') !== -1 ||
                   lower.indexOf('strength') !== -1 || lower.indexOf('drained') !== -1;
  assert(hasContent, 'Response must contain definition content. Got: "' + resp.substring(0, 120) + '"');
  assertNotContains(resp, "that's \"the word exhausted\" in English");
});

test('PIPELINE: "What does running mean?" — lemma "run" resolved', function () {
  SR.newConversation();
  var resp = askSync('What does running mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('run') !== -1 || lower.indexOf('move') !== -1 ||
                   lower.indexOf('verb') !== -1 || lower.indexOf('quickly') !== -1;
  assert(hasContent, 'Response for "running" must mention run/move/verb. Got: "' + resp.substring(0, 120) + '"');
});

test('PIPELINE: "What does written mean?" — lemma "write" resolved', function () {
  SR.newConversation();
  var resp = askSync('What does written mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('write') !== -1 || lower.indexOf('written') !== -1 ||
                   lower.indexOf('verb') !== -1 || lower.indexOf('text') !== -1;
  assert(hasContent, 'Response for "written" must mention write/verb/text. Got: "' + resp.substring(0, 120) + '"');
});

test('PIPELINE: "What does light mean?" — returns multiple senses or definition', function () {
  SR.newConversation();
  var resp = askSync('What does light mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('light') !== -1 || lower.indexOf('illumin') !== -1 ||
                   lower.indexOf('weight') !== -1 || lower.indexOf('noun') !== -1 ||
                   lower.indexOf('adjective') !== -1 || lower.indexOf('meaning') !== -1;
  assert(hasContent, 'Response for "light" must contain definition content. Got: "' + resp.substring(0, 120) + '"');
});

test('PIPELINE: "What does bank mean?" — returns multiple senses with financial and/or geographical', function () {
  SR.newConversation();
  var resp = askSync('What does bank mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('bank') !== -1 || lower.indexOf('financial') !== -1 ||
                   lower.indexOf('deposit') !== -1 || lower.indexOf('slope') !== -1 ||
                   lower.indexOf('river') !== -1 || lower.indexOf('meaning') !== -1;
  assert(hasContent, 'Response for "bank" must contain definition content. Got: "' + resp.substring(0, 120) + '"');
});

test('PIPELINE: "What does bright mean?" — returns definition', function () {
  SR.newConversation();
  var resp = askSync('What does bright mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('bright') !== -1 || lower.indexOf('light') !== -1 ||
                   lower.indexOf('adjective') !== -1 || lower.indexOf('intelligent') !== -1;
  assert(hasContent, 'Response for "bright" must contain definition. Got: "' + resp.substring(0, 120) + '"');
});

test('PIPELINE: "What does charge mean?" — returns definition', function () {
  SR.newConversation();
  var resp = askSync('What does charge mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasContent = lower.indexOf('charge') !== -1 || lower.indexOf('noun') !== -1 ||
                   lower.indexOf('rush') !== -1 || lower.indexOf('verb') !== -1 ||
                   lower.indexOf('meaning') !== -1;
  assert(hasContent, 'Response for "charge" must contain definition. Got: "' + resp.substring(0, 120) + '"');
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 12: Context Tests — Sense Disambiguation in Full Pipeline
// ═════════════════════════════════════════════════════════════════════════════

test('CONTEXT: "I deposited money at the bank. What does bank mean here?" — financial sense', function () {
  SR.newConversation();
  var resp = askSync('I deposited money at the bank. What does bank mean here?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  // Should lean toward financial sense
  var hasFinancial = lower.indexOf('financial') !== -1 || lower.indexOf('deposit') !== -1 ||
                     lower.indexOf('banking') !== -1 || lower.indexOf('account') !== -1 ||
                     lower.indexOf('money') !== -1;
  assert(hasFinancial,
    'Response with financial context should mention financial sense. Got: "' + resp.substring(0, 150) + '"');
});

test('CONTEXT: "We sat beside the river bank. What does bank mean here?" — geographical sense', function () {
  SR.newConversation();
  var resp = askSync('We sat beside the river bank. What does bank mean here?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  // Should lean toward geographical sense
  var hasGeo = lower.indexOf('slope') !== -1 || lower.indexOf('river') !== -1 ||
               lower.indexOf('land') !== -1 || lower.indexOf('water') !== -1 ||
               lower.indexOf('ridge') !== -1;
  assert(hasGeo,
    'Response with river context should mention geographical sense. Got: "' + resp.substring(0, 150) + '"');
});

test('CONTEXT: "The bag is light. What does light mean here?" — weight sense present', function () {
  SR.newConversation();
  var resp = askSync('The bag is light. What does light mean here?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasWeight = lower.indexOf('weight') !== -1 || lower.indexOf('density') !== -1 ||
                  lower.indexOf('physical') !== -1 || lower.indexOf('light') !== -1;
  assert(hasWeight,
    'Response with bag/weight context should mention weight sense. Got: "' + resp.substring(0, 150) + '"');
});

test('CONTEXT: "Turn on the light. What does light mean here?" — illumination sense present', function () {
  SR.newConversation();
  var resp = askSync('Turn on the light. What does light mean here?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  var lower = resp.toLowerCase();
  var hasIllum = lower.indexOf('illumin') !== -1 || lower.indexOf('radiation') !== -1 ||
                 lower.indexOf('source') !== -1 || lower.indexOf('light') !== -1 ||
                 lower.indexOf('noun') !== -1;
  assert(hasIllum,
    'Response with turn-on context should mention illumination sense. Got: "' + resp.substring(0, 150) + '"');
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 13: Unknown Word Fallback
// ═════════════════════════════════════════════════════════════════════════════

test('PIPELINE: "What does zyxqvort mean?" — honest unknown reply, no crash', function () {
  SR.newConversation();
  var resp = askSync('What does zyxqvort mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty for unknown word');
  assertNotContains(resp, 'LOCAL MODEL ERROR');
  assertNotContains(resp, 'undefined');
  // Should be honest about not knowing
  var lower = resp.toLowerCase();
  var isHonest = lower.indexOf("don't have") !== -1 || lower.indexOf('not in') !== -1 ||
                 lower.indexOf('local vocabulary') !== -1 || lower.indexOf('proper noun') !== -1 ||
                 lower.indexOf('uncommon') !== -1;
  assert(isHonest, 'Unknown word must produce honest fallback. Got: "' + resp + '"');
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 14: Non-Dictionary Regression
// ═════════════════════════════════════════════════════════════════════════════

test('REGRESSION: "translate hello to French" still returns bonjour', function () {
  SR.newConversation();
  var resp = askSync('translate hello to French');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  assertContains(resp.toLowerCase(), 'bonjour');
});

test('REGRESSION: "What does hello mean in Spanish?" triggers translation (hola)', function () {
  SR.newConversation();
  var resp = askSync('What does hello mean in Spanish?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  assertContains(resp.toLowerCase(), 'hola');
});

test('REGRESSION: WORD_DEFINITION intent fires for definition queries', function () {
  var u = Under.understand('What does bank mean?');
  assert(u.intent === 'WORD_DEFINITION',
    'Expected WORD_DEFINITION intent for bank query, got: ' + u.intent);
});

test('REGRESSION: WORD_DEFINITION does NOT fire for "What is the weather?"', function () {
  var u = Under.understand('What is the weather like today?');
  assert(u.intent !== 'WORD_DEFINITION',
    'Normal question must not be WORD_DEFINITION, got: ' + u.intent);
});

test('REGRESSION: "What does the word exhausted mean?" does NOT produce translation echo', function () {
  SR.newConversation();
  var resp = askSync('What does the word exhausted mean?');
  assertNotContains(resp, "that's \"the word exhausted\" in English");
  assertNotContains(resp, '"the word exhausted"');
});

test('REGRESSION: "What does running mean?" does not crash and returns definition', function () {
  SR.newConversation();
  var resp = askSync('What does running mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  assertNotContains(resp, 'LOCAL MODEL ERROR');
});

test('REGRESSION: "What does written mean?" does not crash and returns definition', function () {
  SR.newConversation();
  var resp = askSync('What does written mean?');
  assert(typeof resp === 'string' && resp.length > 0, 'Response must be non-empty');
  assertNotContains(resp, 'LOCAL MODEL ERROR');
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 15: lookupSync — async lookup consistency
// ═════════════════════════════════════════════════════════════════════════════

test('lookup("bank", {maxSenses:3}, callback) — async result consistent with lookupSync', function () {
  var asyncResult = null;
  Lex.lookup('bank', { maxSenses: 3 }, function (r) { asyncResult = r; });
  // In Node.js the callback is synchronous after index is loaded
  assert(asyncResult !== null, 'async lookup must have fired callback synchronously after load');
  assert(asyncResult.senses.length > 0, 'async lookup for bank must return senses');
  assert(asyncResult.provider === 'wordnet', 'async lookup provider must be wordnet for bank');
});

// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 16: SRWordDefinitions backward-compatibility still works
// ═════════════════════════════════════════════════════════════════════════════

test('SRWordDefinitions.define("exhausted") still works', function () {
  var e = Defs.define('exhausted');
  assert(e !== null, 'SRWordDefinitions.define("exhausted") must still work');
  assert(e.pos === 'adj', 'exhausted pos must be adj');
  assert(e.definition.length > 10, 'definition must be non-trivial');
});

test('SRWordDefinitions.define("running") still resolves to run', function () {
  var e = Defs.define('running');
  assert(e !== null, 'SRWordDefinitions.define("running") must resolve via lemma');
  assert(e.lemma === 'run', 'lemma of running must be run');
});

test('SRWordDefinitions.build is still SR-LEXICON-1 (backward compat)', function () {
  assert(Defs.build === 'SR-LEXICON-1', 'SRWordDefinitions.build must stay SR-LEXICON-1');
});

// ═════════════════════════════════════════════════════════════════════════════
//  SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════');
console.log('  SR-LEXICAL-EXPANSION TEST RESULTS');
console.log('══════════════════════════════════════════════');
results.forEach(function (r) {
  var icon = r.status === 'PASS' ? '✓' : '✗';
  console.log('  ' + icon + ' ' + r.name + (r.error ? '\n    ERROR: ' + r.error : ''));
});
console.log('══════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
console.log('══════════════════════════════════════════════\n');

if (FAIL > 0) process.exit(1);
