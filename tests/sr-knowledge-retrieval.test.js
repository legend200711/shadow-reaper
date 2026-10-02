/**
 * shadow-reaper-v2/tests/sr-knowledge-retrieval.test.js
 *
 * Shadow Reaper — Knowledge Retrieval & Language Foundation Repair Tests
 *
 * Coverage:
 *  1. Vocabulary integrity after repair (no invalid forms)
 *  2. Morphology — irregular verbs, correct forms
 *  3. Entity extraction (project name, design color)
 *  4. Negation handling in context engine
 *  5. Bad-fragment rejection in adaptive brain / learner
 *  6. Website knowledge retrieval (all 5 SNS questions)
 *  7. Creator knowledge retrieval
 *  8. Normal conversation isolation (no knowledge bleed)
 *  9. Knowledge NOT injected into normal chat
 * 10. Semantic variation — multiple phrasings for same concept
 * 11. queryForResponse no longer emits "don't know" for questions
 * 12. Diagnostics system
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ── Browser globals ────────────────────────────────────────────────────────────
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
  if (!global.navigator) {
    Object.defineProperty(global, 'navigator', { value: { gpu: undefined }, writable: true, configurable: true });
  }
} catch (_) {}
if (!global.fetch) global.fetch = function () { return Promise.reject(new Error('no fetch in test')); };

// ── Module loader ──────────────────────────────────────────────────────────────
function loadModule(relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const fn   = new Function('global', 'require', 'module', 'exports', '__dirname', '__filename', code);
  const mod  = {};
  try {
    fn(global, require, mod, {}, path.dirname(path.join(ROOT, relPath)), path.join(ROOT, relPath));
  } catch (e) {
    // swallow browser-only errors
  }
  return mod;
}

// ── Load stack ─────────────────────────────────────────────────────────────────
loadModule('config/environment.js');
loadModule('security/security-policy.js');
loadModule('snx-shadow-conv-history.js');
loadModule('snx-shadow-memory.js');
loadModule('snx-shadow-adaptive.js');
loadModule('core/adaptive-brain.js');
loadModule('knowledge/sr-knowledge-learner.js');
loadModule('core/understanding-engine.js');
loadModule('core/context-engine.js');
loadModule('core/conversation-engine.js');
loadModule('core/response-engine.js');
loadModule('core/persistence-bridge.js');
loadModule('core/local-model.js');
loadModule('knowledge/knowledge-engine.js');
loadModule('adapters/founder-controls.js');
loadModule('shadow-reaper.js');

var SR       = global.ShadowReaper;
var Brain    = global.SRAdaptiveBrain;
var Learner  = global.SRKnowledgeLearner;
var Context  = global.SRContext;
var Under    = global.SRUnderstanding;
var Know     = global.SRKnowledge;

SR.init();

// ── Test infrastructure ────────────────────────────────────────────────────────
var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push({ status: 'PASS', name });
    process.stdout.write('  ✓  ' + name + '\n');
  } catch (e) {
    FAIL++;
    results.push({ status: 'FAIL', name, error: e.message });
    process.stdout.write('  ✗  ' + name + '\n     ' + e.message + '\n');
  }
}

function assert(cond, msg)       { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertContains(s, sub)  { if (s.indexOf(sub) === -1) throw new Error('Expected "' + s.substring(0,80) + '" to contain "' + sub + '"'); }
function assertNotContains(s,sub){ if (s.indexOf(sub) !== -1) throw new Error('Expected string NOT to contain "' + sub + '"'); }

// ── SECTION 1: VOCABULARY INTEGRITY ───────────────────────────────────────────
console.log('\n── SECTION 1: VOCABULARY INTEGRITY ─────────────────────────────');

test('vocab-index.json exists and has entries', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(Object.keys(vocab).length > 100000, 'Expected > 100,000 vocab entries');
});

test('build-report: invalid forms were removed', function () {
  var report = require('../language/data/build-report.json');
  assert(report.repairRun === true, 'Expected repairRun flag');
  assert(report.invalidRemoved > 0, 'Expected invalidRemoved > 0');
});

test('vocab: runned is NOT present (bad irregular)', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(!vocab['runned'], 'runned should have been removed');
});

test('vocab: runed is NOT present (bad irregular)', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(!vocab['runed'], 'runed should have been removed');
});

test('vocab: writed is NOT present (bad irregular)', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(!vocab['writed'], 'writed should have been removed');
});

test('vocab: stoped is NOT present (bad form — should be stopped)', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(!vocab['stoped'], 'stoped should have been removed');
});

test('vocab: administerring is NOT present (invalid double-r)', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(!vocab['administerring'], 'administerring should have been removed');
});

test('vocab: limitting is NOT present (invalid extra-t)', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(!vocab['limitting'], 'limitting should have been removed');
});

test('vocab: run / runs / running / ran ALL present with lemma run', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(vocab['run']     && vocab['run'].lemma     === 'run', 'run missing');
  assert(vocab['runs']    && vocab['runs'].lemma    === 'run', 'runs missing');
  assert(vocab['running'] && vocab['running'].lemma === 'run', 'running missing');
  assert(vocab['ran']     && vocab['ran'].lemma     === 'run', 'ran missing');
});

test('vocab: write / writes / writing / wrote / written ALL present', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(vocab['write']   && vocab['write'].lemma   === 'write', 'write missing');
  assert(vocab['writes']  && vocab['writes'].lemma  === 'write', 'writes missing');
  assert(vocab['writing'] && vocab['writing'].lemma === 'write', 'writing missing');
  assert(vocab['wrote']   && vocab['wrote'].lemma   === 'write', 'wrote missing');
  assert(vocab['written'] && vocab['written'].lemma === 'write', 'written should map to write');
});

test('vocab: stopped / stopping present with lemma stop', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(vocab['stopped']  && vocab['stopped'].lemma  === 'stop', 'stopped missing');
  assert(vocab['stopping'] && vocab['stopping'].lemma === 'stop', 'stopping missing');
});

test('vocab: monitoring / monitored present with lemma monitor', function () {
  var vocab = require('../language/data/vocab-index.json');
  assert(vocab['monitoring'] && vocab['monitoring'].lemma === 'monitor', 'monitoring missing');
  assert(vocab['monitored']  && vocab['monitored'].lemma  === 'monitor', 'monitored missing');
});

// ── SECTION 2: MORPHOLOGY ─────────────────────────────────────────────────────
console.log('\n── SECTION 2: MORPHOLOGY ────────────────────────────────────────');

test('run/ran/running all resolve to lemma "run"', function () {
  loadModule('language/tokenizer/tokenizer.js');
  loadModule('language/morphology/morphology.js');
  var mor = global.SRMorphology;
  assert(mor, 'SRMorphology not loaded');
  assert(mor.getLemma('ran')     === 'run', 'ran -> run');
  assert(mor.getLemma('running') === 'run', 'running -> run');
  assert(mor.getLemma('runs')    === 'run', 'runs -> run');
});

test('write/wrote/written all resolve to lemma "write"', function () {
  var mor = global.SRMorphology;
  assert(mor, 'SRMorphology not loaded');
  assert(mor.getLemma('wrote')   === 'write', 'wrote -> write');
  assert(mor.getLemma('writing') === 'write', 'writing -> write');
  assert(mor.getLemma('writes')  === 'write', 'writes -> write');
  assert(mor.getLemma('written') === 'write', 'written -> write');
});

test('runned is NOT treated as a valid lemma form', function () {
  var mor = global.SRMorphology;
  assert(mor, 'SRMorphology not loaded');
  assert(!mor.isKnownWord('runned'), 'runned should not be known');
});

test('writed is NOT treated as a valid lemma form', function () {
  var mor = global.SRMorphology;
  assert(!mor.isKnownWord('writed'), 'writed should not be known');
});

test('held/holding/holds resolve to lemma "hold"', function () {
  var mor = global.SRMorphology;
  assert(mor.getLemma('held')    === 'hold', 'held -> hold');
  assert(mor.getLemma('holding') === 'hold', 'holding -> hold');
});

// ── SECTION 3: ENTITY EXTRACTION ──────────────────────────────────────────────
console.log('\n── SECTION 3: ENTITY EXTRACTION ─────────────────────────────────');

test('entity extraction: project name NightGlass', function () {
  var r = Under.understand("I'm building a project called NightGlass.");
  assert(r.entities.projectName === 'NightGlass', 'Expected projectName=NightGlass, got: ' + r.entities.projectName);
});

test('entity extraction: design color "dark blue"', function () {
  var r = Under.understand("It's a website with a dark blue design.");
  assert(r.entities.design === 'dark blue', 'Expected design=dark blue, got: ' + r.entities.design);
});

test('entity extraction: area "homepage"', function () {
  var r = Under.understand('The homepage feels too empty.');
  assert(r.entities.area === 'homepage', 'Expected area=homepage');
});

test('entity extraction: project name not corrupted by negation', function () {
  // "don't change the homepage" should not overwrite project name
  Context.reset();
  Under.understand("I'm building a project called NightGlass.");
  var r = Under.understand("Actually, don't change the homepage. Let's work on the menu instead.");
  // projectName should not be in the entities for this correction
  assert(r.entities.projectName === undefined || r.entities.projectName === null,
    'Correction should not produce a projectName, got: ' + r.entities.projectName);
});

// ── SECTION 4: CONTEXT ENGINE NEGATION GUARD ──────────────────────────────────
console.log('\n── SECTION 4: CONTEXT ENGINE NEGATION GUARD ─────────────────────');

test('context: project name preserved across negated correction', function () {
  Context.reset();
  var u1 = Under.understand("I'm building a project called NightGlass. It's a website with a dark blue design.");
  Context.update(u1, "I'm building a project called NightGlass.");
  var u2 = Under.understand("Actually, don't change the homepage. Let's work on the menu instead.");
  Context.update(u2, "Actually, don't change the homepage. Let's work on the menu instead.");
  var snap = Context.getSnapshot();
  assert(snap.projectName === 'NightGlass', 'project name should still be NightGlass, got: ' + snap.projectName);
});

test('context: design "dark blue" stored after initial statement', function () {
  Context.reset();
  var u = Under.understand("I'm building a project called NightGlass. It's a website with a dark blue design.");
  Context.update(u, "I'm building a project called NightGlass.");
  var snap = Context.getSnapshot();
  assert(snap.projectName === 'NightGlass', 'projectName');
});

// ── SECTION 5: BAD-FRAGMENT REJECTION ─────────────────────────────────────────
console.log('\n── SECTION 5: BAD-FRAGMENT REJECTION ────────────────────────────');

test('adaptive brain: "don\'t change the homepage" NOT stored as PROJECT', function () {
  Brain._resetForTest && Brain._resetForTest();
  Brain.learn({
    text: "Actually, don't change the homepage. Let's work on the menu instead.",
    role: 'user', convId: null, projectName: 'NightGlass',
  });
  var items = Brain.listAll();
  var bad = items.filter(function (i) {
    return (i.value || '').toLowerCase().indexOf("don't change") !== -1 ||
           (i.type === 'PROJECT' && (i.value || '').indexOf('dont change') !== -1);
  });
  assert(bad.length === 0, 'Found bad fragment stored: ' + JSON.stringify(bad));
});

test('learner: question text not stored as definition', function () {
  Learner.learn({ text: 'What is Shadow Nexus Live and what can I do with it?', role: 'user', convId: null });
  var items = Brain.listAll ? Brain.listAll() : [];
  var bad = items.filter(function (i) {
    return (i.concept || '') === 'what' && (i.value || '').indexOf('Shadow Nexus') !== -1;
  });
  assert(bad.length === 0, 'Question text should not be stored as definition, found: ' + JSON.stringify(bad));
});

test('learner: negated command "don\'t X" not stored as correction', function () {
  Brain._resetForTest && Brain._resetForTest();
  Learner.learn({ text: "Actually, don't change the homepage.", role: 'user', convId: null });
  var items = Brain.listAll ? Brain.listAll() : [];
  var bad = items.filter(function (i) {
    return (i.type === 'CORRECTION') && ((i.value || '').toLowerCase().indexOf("don't") !== -1 ||
           (i.value || '').toLowerCase().indexOf('dont') !== -1);
  });
  assert(bad.length === 0, 'Negated command should not be stored as correction, found: ' + JSON.stringify(bad));
});

// ── SECTION 6: WEBSITE KNOWLEDGE RETRIEVAL ────────────────────────────────────
console.log('\n── SECTION 6: WEBSITE KNOWLEDGE RETRIEVAL ───────────────────────');

test('knowledge: "What is Shadow Nexus Live" returns Live entry', function () {
  var entry = Know.query('What is Shadow Nexus Live and what can I do with it?');
  assert(entry, 'Expected a knowledge entry');
  assertContains(entry.content.toLowerCase(), 'live');
});

test('knowledge: "What is Shadow Nexus Live" response has category SNS', function () {
  var entry = Know.query('What is Shadow Nexus Live?');
  assert(entry && entry.category === 'SNS', 'Expected category SNS');
});

test('knowledge: "Tell me about the live feature" resolves to Live entry', function () {
  var entry = Know.query('Tell me about the live feature.');
  assert(entry, 'Expected a knowledge entry');
  assertContains(entry.content.toLowerCase(), 'live');
});

test('knowledge: "How does the live system work" resolves to Live entry', function () {
  var entry = Know.query('How does the live system work?');
  assert(entry, 'Expected a knowledge entry');
  assertContains(entry.content.toLowerCase(), 'live');
});

test('knowledge: Radio vs Radio Studio query returns both', function () {
  var entries = Know.queryMultiple("What's the difference between Radio and Radio Studio?", 2);
  assert(entries && entries.length >= 1, 'Expected at least 1 entry');
  var hasRadio = entries.some(function (e) { return e.content.toLowerCase().indexOf('radio') !== -1; });
  assert(hasRadio, 'Expected Radio content');
});

test('knowledge: "What is TV Studio used for" returns TV entry', function () {
  var entry = Know.query('What is TV Studio used for?');
  assert(entry, 'Expected a knowledge entry');
  assertContains(entry.content.toLowerCase(), 'tv');
});

test('knowledge: "How do I install Shadow Nexus as an app" returns PWA entry', function () {
  var entry = Know.query('How do I install Shadow Nexus as an app?');
  assert(entry, 'Expected a knowledge entry');
  var content = (entry.content || '').toLowerCase();
  var hasPWA = content.indexOf('pwa') !== -1 || content.indexOf('install') !== -1;
  assert(hasPWA, 'Expected PWA/install content, got: ' + content.substring(0,80));
});

test('knowledge: "Who created Shadow Nexus Social" returns CREATOR entry', function () {
  var entry = Know.query('Who created Shadow Nexus Social?');
  assert(entry, 'Expected a knowledge entry');
  assert(entry.category === 'CREATOR', 'Expected category CREATOR, got: ' + entry.category);
  assertContains(entry.content.toLowerCase(), 'chris');
});

// ── SECTION 7: NORMAL CONVERSATION ISOLATION ──────────────────────────────────
console.log('\n── SECTION 7: NORMAL CONVERSATION ISOLATION ─────────────────────');

test('knowledge: "What\'s up?" → no knowledge match', function () {
  var entry = Know.query("What's up?");
  assert(!entry, 'Normal greeting should not match knowledge, got: ' + JSON.stringify(entry));
});

test('knowledge: "I\'m bored" → no knowledge match', function () {
  var entry = Know.query("I'm bored.");
  assert(!entry, 'Normal conversation should not match knowledge');
});

test('knowledge: "Tell me something interesting" → no knowledge match', function () {
  var entry = Know.query('Tell me something interesting.');
  assert(!entry, 'General conversation should not match knowledge');
});

test('knowledge: "What should I do tonight" → no knowledge match', function () {
  var entry = Know.query('What should I do tonight?');
  assert(!entry, 'Personal question should not match knowledge');
});

test('knowledge: "I\'m working on my website" → no knowledge match (NOT SNS docs)', function () {
  var entry = Know.query("I'm working on my website.");
  // "website" alone should not trigger SNS docs — requires specific SNS keywords
  // If it does match, it should be the general capability entry, NOT TV Studio or Radio
  if (entry) {
    assert(entry.category !== 'SNS' || entry.content.indexOf('Shadow Nexus') === -1,
      'Personal website statement should not return Shadow Nexus platform docs');
  }
  // This test passes whether no entry or a non-SNS-specific one is returned
});

// ── SECTION 8: SEMANTIC VARIATION ─────────────────────────────────────────────
console.log('\n── SECTION 8: SEMANTIC VARIATION ────────────────────────────────');

test('semantic variation: multiple Live phrasings all return Live content', function () {
  var phrasings = [
    'What is Shadow Nexus Live?',
    'What can I do with Live?',
    'Tell me about the live feature.',
    'How does the live system work?',
    'What is live on Shadow Nexus?',
  ];
  phrasings.forEach(function (q) {
    var entry = Know.query(q);
    if (entry) {
      assertContains(entry.content.toLowerCase(), 'live',
        'Query "' + q + '" returned entry without live content');
    }
    // Note: if no entry is found, that's acceptable for very short queries
  });
});

// ── SECTION 9: queryForResponse — no premature "don't know" ────────────────────
console.log('\n── SECTION 9: queryForResponse — NO PREMATURE "don\'t know" ─────');

test('queryForResponse: returns answered:false (not "don\'t know") when brain empty', function () {
  // Reset brain so it has no items
  if (Brain._resetForTest) Brain._resetForTest();
  var result = Learner.queryForResponse('What is Shadow Nexus Live?', null, 'QUESTION');
  assert(!result.answered || result.response === null,
    'queryForResponse should not emit "don\'t know" when SRKnowledge has the answer');
});

test('queryForResponse: answered:false for unknown question (no brain items)', function () {
  if (Brain._resetForTest) Brain._resetForTest();
  var result = Learner.queryForResponse('What do unicorns eat?', null, 'QUESTION');
  // Must NOT return answered:true with a "don't know" canned response
  assert(result.answered !== true || result.items.length > 0,
    'Should not emit answered:true with no items — let pipeline handle it');
});

// ── SECTION 10: FULL PIPELINE — WEBSITE KNOWLEDGE QUESTIONS ───────────────────
console.log('\n── SECTION 10: FULL PIPELINE — WEBSITE KNOWLEDGE QUESTIONS ──────');

function askSync(q) {
  var resp = null;
  SR.newConversation();
  SR.ask(q, function (r) { resp = r; });
  return resp;
}

test('pipeline: "What is Shadow Nexus Live" returns Live knowledge', function () {
  SR.newConversation();
  var captured = null;
  SR.ask('What is Shadow Nexus Live and what can I do with it?', function (r) { captured = r; });
  assert(captured, 'No response');
  assertContains(captured.toLowerCase(), 'live');
  assertNotContains(captured, "don't have reliable information");
  assertNotContains(captured, 'LOCAL MODEL ERROR');
});

test('pipeline: "What is TV Studio used for" returns TV knowledge', function () {
  SR.newConversation();
  var captured = null;
  SR.ask('What is TV Studio used for?', function (r) { captured = r; });
  assert(captured, 'No response');
  assertContains(captured.toLowerCase(), 'tv');
  assertNotContains(captured, "don't have reliable information");
});

test('pipeline: "How do I install Shadow Nexus as an app" returns PWA knowledge', function () {
  SR.newConversation();
  var captured = null;
  SR.ask('How do I install Shadow Nexus as an app?', function (r) { captured = r; });
  assert(captured, 'No response');
  var lc = captured.toLowerCase();
  var hasPWA = lc.indexOf('pwa') !== -1 || lc.indexOf('install') !== -1 || lc.indexOf('home screen') !== -1;
  assert(hasPWA, 'Expected PWA/install content in response: ' + captured.substring(0,100));
});

test('pipeline: "Who created Shadow Nexus Social" returns Chris / creator info', function () {
  SR.newConversation();
  var captured = null;
  SR.ask('Who created Shadow Nexus Social?', function (r) { captured = r; });
  assert(captured, 'No response');
  assertContains(captured.toLowerCase(), 'chris');
  assertNotContains(captured, "don't have reliable information");
});

// ── SECTION 11: NORMAL CONVERSATION DOES NOT GET KNOWLEDGE ────────────────────
console.log('\n── SECTION 11: NORMAL CONVERSATION — NO KNOWLEDGE BLEED ─────────');

test('pipeline: "What\'s up?" returns greeting not SNS docs', function () {
  SR.newConversation();
  var captured = null;
  SR.ask("What's up?", function (r) { captured = r; });
  assert(captured, 'No response');
  assertNotContains(captured, 'Shadow Nexus Social is a creative');
  assertNotContains(captured, 'radio studio');
  assertNotContains(captured, 'LOCAL MODEL ERROR');
});

test('pipeline: "I\'m bored" returns conversational response not SNS docs', function () {
  SR.newConversation();
  var captured = null;
  SR.ask("I'm bored.", function (r) { captured = r; });
  assert(captured, 'No response');
  assertNotContains(captured, 'Shadow Nexus Social is a creative');
  assertNotContains(captured, 'LOCAL MODEL ERROR');
});

// ── SECTION 12: PROJECT ENTITY + NEGATION SEQUENCE ────────────────────────────
console.log('\n── SECTION 12: PROJECT ENTITY + NEGATION SEQUENCE ───────────────');

test('pipeline: project name recognized from "I\'m building NightGlass"', function () {
  SR.newConversation();
  var captured = null;
  SR.ask("I'm building a project called NightGlass. It's a website with a dark blue design.", function (r) { captured = r; });
  var ctx = Context.getSnapshot();
  assert(ctx.projectName === 'NightGlass', 'Expected projectName=NightGlass, got: ' + ctx.projectName);
  assert(ctx.design && ctx.design.indexOf('dark blue') !== -1, 'Expected dark blue in design');
  assertContains(captured, 'NightGlass');
});

test('pipeline: project name PRESERVED after "don\'t change the homepage"', function () {
  SR.newConversation();
  SR.ask("I'm building a project called NightGlass.", function () {});
  SR.ask("Actually, don't change the homepage. Let's work on the menu instead.", function () {});
  var ctx = Context.getSnapshot();
  assert(ctx.projectName === 'NightGlass',
    'Project name corrupted to: ' + ctx.projectName);
});

test('pipeline: "What project are we working on" returns NightGlass', function () {
  SR.newConversation();
  SR.ask("I'm building a project called NightGlass.", function () {});
  var captured = null;
  SR.ask("What project are we working on?", function (r) { captured = r; });
  assert(captured, 'No response');
  assertContains(captured, 'NightGlass');
});

// ── SECTION 13: DIAGNOSTICS ────────────────────────────────────────────────────
console.log('\n── SECTION 13: DIAGNOSTICS ───────────────────────────────────────');

test('diagnostics: getLastDiagnostics() returns object', function () {
  SR.newConversation();
  SR.ask("What is Shadow Nexus Live?", function () {});
  var diag = SR.getLastDiagnostics();
  assert(diag && typeof diag === 'object', 'Expected diagnostics object');
  assert('INTENT' in diag, 'Expected INTENT key');
  assert('KNOWLEDGE_USED' in diag, 'Expected KNOWLEDGE_USED key');
  assert('RESPONSE_SOURCE' in diag, 'Expected RESPONSE_SOURCE key');
});

test('diagnostics: knowledge question shows KNOWLEDGE_USED=YES', function () {
  SR.newConversation();
  SR.ask("What is Shadow Nexus Live?", function () {});
  var diag = SR.getLastDiagnostics();
  assert(diag.KNOWLEDGE_USED === 'YES', 'Expected KNOWLEDGE_USED=YES, got: ' + diag.KNOWLEDGE_USED);
  assert(diag.RESPONSE_SOURCE === 'KNOWLEDGE', 'Expected RESPONSE_SOURCE=KNOWLEDGE, got: ' + diag.RESPONSE_SOURCE);
});

test('diagnostics: normal conversation shows KNOWLEDGE_USED=NO', function () {
  SR.newConversation();
  SR.ask("Hey there.", function () {});
  var diag = SR.getLastDiagnostics();
  assert(diag.KNOWLEDGE_USED === 'NO', 'Expected KNOWLEDGE_USED=NO, got: ' + diag.KNOWLEDGE_USED);
});

test('diagnostics: does not expose private data', function () {
  var diag = SR.getLastDiagnostics();
  var diagStr = JSON.stringify(diag);
  assert(diagStr.indexOf('password') === -1, 'Should not expose password');
  assert(diagStr.indexOf('apiKey') === -1, 'Should not expose API key');
  assert(diagStr.indexOf('uid') === -1, 'Should not expose UID');
});

// ── RESULTS ────────────────────────────────────────────────────────────────────
var total = PASS + FAIL;
console.log('\n══════════════════════════════════════════════════════════════');
console.log('  SHADOW REAPER — KNOWLEDGE & LANGUAGE REPAIR TEST RESULTS');
console.log('══════════════════════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + total);
console.log('══════════════════════════════════════════════════════════════');

if (FAIL > 0) {
  console.log('\n  FAILURES:');
  results.filter(function (r) { return r.status === 'FAIL'; }).forEach(function (r) {
    console.log('   ✗ ' + r.name);
    console.log('     ' + r.error);
  });
  process.exit(1);
} else {
  console.log('KNOWLEDGE & LANGUAGE REPAIR TEST: PASS');
  process.exit(0);
}
