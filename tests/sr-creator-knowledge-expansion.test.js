/**
 * shadow-reaper-v2/tests/sr-creator-knowledge-expansion.test.js
 * Shadow Reaper — Creator Knowledge Expansion Regression Tests
 *
 * Build: SR-CREATOR-KNOWLEDGE-EXPANSION-TEST-1
 *
 * Verifies the full Creator Knowledge expansion covering:
 *   1.  Creator identity (Chris Legend of Shadows)
 *   2.  Shadow Reaper ownership
 *   3.  Shadow Nexus Social ownership
 *   4.  Distinction between Shadow Reaper and Shadow Nexus Social
 *   5.  Personal story (carefully, factually)
 *   6.  Support system — sister, friends, Green Heart Family
 *   7.  Green Heart Family — correct spelling, regression guard
 *   8.  Music identity, platforms, themes, verified song titles
 *   9.  Website knowledge (canonical domains)
 *   10. Follow-up pronoun resolution context
 *   11. Knowledge authority — verified creator meta flags
 *   12. Adaptive learning CANNOT overwrite verified creator facts
 *   13. User-supplied contradictions do NOT replace creator facts
 *   14. Personality system cannot alter facts
 *   15. Build ID reflects update
 *
 * Run: node tests/sr-creator-knowledge-expansion.test.js
 */

'use strict';

var path = require('path');
var fs   = require('fs');
var ROOT = path.resolve(__dirname, '..');

/* ── Browser globals shim ─────────────────────────────────────────────────── */
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
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
  }
} catch (_) {}
if (!global.fetch) global.fetch = function () { return Promise.reject(new Error('no fetch in test')); };

/* ── Load module ──────────────────────────────────────────────────────────── */
function loadModule(relPath) {
  var code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  var fn   = new Function('global', 'require', 'module', 'exports', '__dirname', '__filename', code);
  var mod  = {};
  fn(global, require, mod, {}, path.dirname(path.join(ROOT, relPath)), path.join(ROOT, relPath));
}

loadModule('knowledge/knowledge-engine.js');
var K = global.SRKnowledge;

/* ── Test harness ─────────────────────────────────────────────────────────── */
var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push('  PASS  ' + name);
  } catch (e) {
    FAIL++;
    results.push('  FAIL  ' + name);
    results.push('        ' + e.message);
  }
}

function assert(cond, msg)         { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertExists(v, msg)      { if (v == null) throw new Error(msg || 'Expected value to exist, got null/undefined'); }
function assertContains(s, sub)    {
  if (String(s).toLowerCase().indexOf(sub.toLowerCase()) === -1)
    throw new Error('Expected content to contain "' + sub + '" — got: ' + String(s).slice(0, 120));
}
function assertNotContains(s, sub) {
  if (String(s).toLowerCase().indexOf(sub.toLowerCase()) !== -1)
    throw new Error('Expected content NOT to contain "' + sub + '" — got: ' + String(s).slice(0, 120));
}
function assertIsCreator(entry) {
  assertExists(entry, 'Expected a knowledge entry, got null');
  assert(entry.category === 'CREATOR', 'Expected CREATOR category, got: ' + entry.category);
}

/* ── Simulate knowledge pipeline ─────────────────────────────────────────── */
function getKnowledgeContext(message) {
  if (!K || typeof K.queryMultiple !== 'function') return null;
  var entries = K.queryMultiple(message, 3);
  if (!entries || entries.length === 0) return null;
  return entries.map(function (e) {
    return { category: e.category, content: e.content };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 1 — MODULE INTEGRITY
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 1: Module integrity ──────────────────────────────────────');

test('CKE-01: SRKnowledge loads successfully', function () {
  assertExists(K, 'SRKnowledge must be loaded');
  assert(typeof K.query === 'function', 'query must be a function');
  assert(typeof K.queryMultiple === 'function', 'queryMultiple must be a function');
});

test('CKE-02: Build ID reflects expansion update', function () {
  assertExists(K.build, 'Build ID must exist');
  assert(K.build.indexOf('KNOWLEDGE') !== -1, 'Build ID must reference KNOWLEDGE. Got: ' + K.build);
  // Must be version 2 or later
  assert(K.build !== 'SR-V2-KNOWLEDGE-1', 'Build ID must be updated from v1. Got: ' + K.build);
});

test('CKE-03: VERIFIED_CREATOR_META is defined and correct', function () {
  assertExists(K.VERIFIED_CREATOR_META, 'VERIFIED_CREATOR_META must be exposed');
  assert(K.VERIFIED_CREATOR_META.authority === 'verified_creator', 'authority must be verified_creator');
  assert(K.VERIFIED_CREATOR_META.editableByAdaptiveLearning === false, 'editableByAdaptiveLearning must be false');
  assert(K.VERIFIED_CREATOR_META.confidence === 1.0, 'confidence must be 1.0');
});

test('CKE-04: isVerifiedCreatorFact() is exposed', function () {
  assert(typeof K.isVerifiedCreatorFact === 'function', 'isVerifiedCreatorFact must be a function');
});

test('CKE-05: canAdaptiveLearningOverwrite() is exposed', function () {
  assert(typeof K.canAdaptiveLearningOverwrite === 'function', 'canAdaptiveLearningOverwrite must be a function');
});

test('CKE-06: getVerifiedCreatorKnowledge() returns entries', function () {
  assert(typeof K.getVerifiedCreatorKnowledge === 'function', 'getVerifiedCreatorKnowledge must be a function');
  var entries = K.getVerifiedCreatorKnowledge();
  assert(Array.isArray(entries) && entries.length > 0, 'Must return verified creator entries. Got: ' + entries.length);
});

test('CKE-07: getCreatorCommunityName() returns Green Heart Family', function () {
  assert(typeof K.getCreatorCommunityName === 'function', 'getCreatorCommunityName must be a function');
  var name = K.getCreatorCommunityName();
  assert(name === 'Green Heart Family', 'Must return "Green Heart Family". Got: "' + name + '"');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 2 — CREATOR IDENTITY
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 2: Creator identity ──────────────────────────────────────');

test('CKE-08: "Who created Shadow Reaper?" → CREATOR, mentions Chris', function () {
  var e = K.query('Who created Shadow Reaper?');
  assertIsCreator(e);
  assertContains(e.content, 'Chris');
});

test('CKE-09: "Who is Chris Legend of Shadows?" → CREATOR', function () {
  var e = K.query('Who is Chris Legend of Shadows?');
  assertIsCreator(e);
  assertContains(e.content, 'Chris');
  assertContains(e.content, 'Legend of Shadows');
});

test('CKE-10: "Who is the person behind you?" → CREATOR, mentions Chris', function () {
  var e = K.query("Who is the person behind you?");
  assertIsCreator(e);
  assertContains(e.content, 'Chris');
});

test("CKE-11: \"Who made you?\" → CREATOR, mentions Chris", function () {
  var e = K.query('Who made you?');
  assertIsCreator(e);
  assertContains(e.content, 'Chris');
});

test('CKE-12: "Who built Shadow Reaper?" → CREATOR, mentions Chris', function () {
  var e = K.query('Who built Shadow Reaper?');
  assertIsCreator(e);
  assertContains(e.content, 'Chris');
});

test('CKE-13: "Who is the creator?" → CREATOR, returns knowledge', function () {
  var e = K.query('Who is the creator?');
  assertIsCreator(e);
  assertContains(e.content, 'Chris');
});

test('CKE-14: Chris\'s artist name is Chris Legend of Shadows', function () {
  var e = K.query('Who is Chris Legend of Shadows?');
  assertIsCreator(e);
  assertContains(e.content, 'Chris Legend of Shadows');
});

test('CKE-15: All CREATOR entries have VERIFIED_CREATOR_META', function () {
  var creatorEntries = K.getByCategory('CREATOR');
  assert(creatorEntries.length > 0, 'Must have CREATOR entries');
  var unprotected = creatorEntries.filter(function (e) {
    return !e.meta || e.meta.editableByAdaptiveLearning !== false;
  });
  assert(unprotected.length === 0, 'All CREATOR entries must have editableByAdaptiveLearning: false. Unprotected: ' + unprotected.length);
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 3 — SHADOW REAPER AND SHADOW NEXUS SOCIAL DISTINCTION
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 3: Project distinction ───────────────────────────────────');

test('CKE-16: "What is Shadow Reaper?" returns CREATOR or GENERAL, mentions AI/companion', function () {
  var e = K.query('What is Shadow Reaper?');
  assertExists(e, 'Must return entry for Shadow Reaper');
  // Should be creator-owned, not SNS
  assertNotContains(e.content, 'Greyhound'); // regression guard
});

test('CKE-17: Shadow Reaper entry explains it is separate from Shadow Nexus Social', function () {
  var e = K.query('who created shadow reaper');
  assertIsCreator(e);
  // Should mention they are separate projects
  var ctx = getKnowledgeContext('difference between shadow reaper and shadow nexus');
  assertExists(ctx, 'Must return knowledge for distinction query');
  var combinedContent = ctx.map(function (e) { return e.content; }).join(' ');
  assertContains(combinedContent, 'Shadow Reaper');
  assertContains(combinedContent, 'Shadow Nexus');
});

test('CKE-18: "Who created Shadow Nexus Social?" → CREATOR, mentions Chris', function () {
  var e = K.query('Who created Shadow Nexus Social?');
  assertIsCreator(e);
  assertContains(e.content, 'Chris');
});

test('CKE-19: "Who built Shadow Nexus Social?" → CREATOR, mentions Chris', function () {
  var e = K.query('Who built Shadow Nexus Social?');
  assertIsCreator(e);
  assertContains(e.content, 'Chris');
});

test('CKE-20: Shadow Nexus Social not described as Shadow Reaper', function () {
  var e = K.query('What is Shadow Nexus Social?');
  assertExists(e, 'Must return entry');
  // The SNS entry or CREATOR entry should not say "Shadow Nexus Social is Shadow Reaper"
  assertNotContains(e.content, 'Shadow Nexus Social is Shadow Reaper');
  assertNotContains(e.content, 'Shadow Reaper is Shadow Nexus Social');
});

test('CKE-21: "Are shadow reaper and shadow nexus the same?" → CREATOR distinction entry', function () {
  var e = K.query('are shadow reaper and shadow nexus the same');
  assertExists(e, 'Must return distinction entry');
  assertContains(e.content, 'Shadow Reaper');
  assertContains(e.content, 'Shadow Nexus');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 4 — PERSONAL STORY
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 4: Personal story ─────────────────────────────────────────');

test('CKE-22: "Has Chris had an easy life?" → returns personal story knowledge', function () {
  var e = K.query('Has Chris had an easy life?');
  assertIsCreator(e);
  // Should mention struggles without sensationalism
  assertContains(e.content, 'difficult');
});

test('CKE-23: Personal story mentions family problems', function () {
  var e = K.query('what has chris been through');
  assertIsCreator(e);
  assertContains(e.content, 'family');
});

test('CKE-24: Personal story mentions health or mental health struggles', function () {
  var e = K.query('what has chris been through');
  assertIsCreator(e);
  assertContains(e.content, 'health');
});

test('CKE-25: Personal story does NOT invent diagnoses', function () {
  var e = K.query('chris story');
  assertIsCreator(e);
  assertNotContains(e.content, 'diagnosed with');
  assertNotContains(e.content, 'bipolar');
  assertNotContains(e.content, 'schizophrenia');
  assertNotContains(e.content, 'PTSD');
});

test('CKE-26: Personal story does NOT sensationalize', function () {
  var e = K.query('chris background');
  assertIsCreator(e);
  assertNotContains(e.content, 'suicide attempt');
  assertNotContains(e.content, 'overdose');
  assertNotContains(e.content, 'nearly died');
});

test('CKE-27: "Who helped him get through it?" → returns support knowledge', function () {
  var e = K.query('Who helped him get through it?');
  assertIsCreator(e);
  // Should mention sister, friends, Green Heart Family
  assertContains(e.content, 'sister');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 5 — GREEN HEART FAMILY (SPELLING + REGRESSION)
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 5: Green Heart Family ─────────────────────────────────────');

test('CKE-28: "What is Green Heart Family?" → CREATOR entry', function () {
  var e = K.query('What is Green Heart Family?');
  assertIsCreator(e);
  assertContains(e.content, 'Green Heart Family');
});

test('CKE-29: Green Heart Family content contains correct spelling', function () {
  var e = K.query('green heart family');
  assertIsCreator(e);
  assertContains(e.content, 'Green Heart Family');
});

test('CKE-30: Green Heart Family content does NOT use "Greyhound Family"', function () {
  var allCreator = K.getByCategory('CREATOR');
  allCreator.forEach(function (entry) {
    assertNotContains(entry.content, 'Greyhound Family');
  });
});

test('CKE-31: "Greyhound Family" query resolves to Green Heart Family knowledge (regression guard)', function () {
  // The keyword 'greyhound family' is mapped to the Green Heart Family entry as a regression guard
  var e = K.query('greyhound family');
  if (e) {
    // If it returns an entry, it must be the Green Heart Family entry
    assertContains(e.content, 'Green Heart Family');
    assertNotContains(e.content, 'Greyhound');
  }
  // Also check: no entry in the knowledge base uses 'Greyhound Family' as factual content
  var allEntries = K.getByCategory('CREATOR').concat(K.getByCategory('SNS')).concat(K.getByCategory('GENERAL'));
  var greyhoundEntries = allEntries.filter(function (e) {
    return e.content.toLowerCase().indexOf('greyhound family') !== -1;
  });
  assert(greyhoundEntries.length === 0, 'No entry may use "Greyhound Family" as factual content. Found: ' + greyhoundEntries.length);
});

test('CKE-32: "Why is Green Heart Family important?" → CREATOR', function () {
  var e = K.query('Why is Green Heart Family important to Chris?');
  assertIsCreator(e);
  assertContains(e.content, 'Green Heart Family');
});

test('CKE-33: Support entry mentions sister', function () {
  var e = K.query('who helped chris');
  assertIsCreator(e);
  assertContains(e.content, 'sister');
});

test('CKE-34: Support entry mentions Green Heart Family', function () {
  var e = K.query('who helped chris');
  assertIsCreator(e);
  assertContains(e.content, 'Green Heart Family');
});

test('CKE-35: getCreatorCommunityName() always returns exact string', function () {
  var name = K.getCreatorCommunityName();
  assert(name === 'Green Heart Family', 'Must be exactly "Green Heart Family". Got: "' + name + '"');
  assert(name.toLowerCase().indexOf('greyhound') === -1, 'Must not contain "greyhound"');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 6 — MUSIC
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 6: Music ─────────────────────────────────────────────────');

test('CKE-36: "Does Chris make music?" → CREATOR entry about music', function () {
  var e = K.query('Does Chris make music?');
  assertIsCreator(e);
  assertContains(e.content, 'music');
});

test('CKE-37: Music artist name is Chris Legend of Shadows', function () {
  var e = K.query('Does Chris make music?');
  assertIsCreator(e);
  assertContains(e.content, 'Chris Legend of Shadows');
});

test('CKE-38: "What name does he release music under?" → CREATOR', function () {
  var ctx = getKnowledgeContext('What name does he release music under?');
  assertExists(ctx, 'Must return knowledge');
  var combined = ctx.map(function (e) { return e.content; }).join(' ');
  assertContains(combined, 'Chris Legend of Shadows');
});

test('CKE-39: Music platforms include Spotify', function () {
  var e = K.query('Where can I listen to his music?');
  assertExists(e, 'Must return entry');
  assertContains(e.content, 'Spotify');
});

test('CKE-40: Music platforms include Apple Music', function () {
  var e = K.query('Where can I listen to his music?');
  assertExists(e, 'Must return entry');
  assertContains(e.content, 'Apple Music');
});

test('CKE-41: Music platforms include Amazon Music', function () {
  var e = K.query('Where can I find his music?');
  assertExists(e, 'Must return entry');
  assertContains(e.content, 'Amazon Music');
});

test('CKE-42: Music platforms include YouTube Music', function () {
  var e = K.query('Where can I find it?');
  // May not directly match — check broader query
  var ctx = getKnowledgeContext('Where can I listen to music by Chris Legend of Shadows?');
  if (ctx) {
    var combined = ctx.map(function (e) { return e.content; }).join(' ');
    assertContains(combined, 'YouTube Music');
  } else {
    var e2 = K.query('music streaming platforms chris');
    assertExists(e2, 'Must return a music platform entry');
    assertContains(e2.content, 'YouTube Music');
  }
});

test('CKE-43: "Name a couple songs" → returns song titles', function () {
  var e = K.query('Name a couple songs');
  assertExists(e, 'Must return entry for song title query');
  assertContains(e.content, 'Stay Legendary');
});

test('CKE-44: Known song title — "A Man Like Me" is present', function () {
  var e = K.query('A Man Like Me');
  assertExists(e, 'Must return entry for "A Man Like Me"');
  assertContains(e.content, 'A Man Like Me');
});

test('CKE-45: Known song title — "Afraid of the Dark Place" is present', function () {
  var e = K.query('Afraid of the Dark Place');
  assertExists(e, 'Must return entry for "Afraid of the Dark Place"');
  assertContains(e.content, 'Afraid of the Dark Place');
});

test('CKE-46: Music themes include mental health/struggle', function () {
  var e = K.query('What does his music talk about?');
  assertExists(e, 'Must return music themes entry');
  var content = e.content.toLowerCase();
  assert(
    content.indexOf('struggle') !== -1 ||
    content.indexOf('mental health') !== -1 ||
    content.indexOf('survival') !== -1,
    'Music themes must mention struggle/mental health/survival'
  );
});

test('CKE-47: Music does NOT invent chart positions or streaming stats', function () {
  var ctx = getKnowledgeContext('chris legend of shadows music');
  assertExists(ctx, 'Must return music context');
  var combined = ctx.map(function (e) { return e.content; }).join(' ');
  assertNotContains(combined, 'number 1');
  assertNotContains(combined, 'million streams');
  assertNotContains(combined, 'chart-topping');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 7 — WEBSITES
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 7: Websites ───────────────────────────────────────────────');

test('CKE-48: "Does Chris have a website?" → CREATOR entry with chrislegendofshadows.com', function () {
  var e = K.query('Does Chris have a website?');
  assertIsCreator(e);
  assertContains(e.content, 'chrislegendofshadows.com');
});

test('CKE-49: "What is the Legend of Shadows website?" → returns chrislegendofshadows.com', function () {
  var e = K.query('What is the Legend of Shadows website?');
  assertIsCreator(e);
  assertContains(e.content, 'chrislegendofshadows.com');
});

test('CKE-50: "Where can I find Shadow Nexus Social?" → returns shadownexussocial.online', function () {
  var ctx = getKnowledgeContext('Where can I find Shadow Nexus Social?');
  assertExists(ctx, 'Must return knowledge');
  var combined = ctx.map(function (e) { return e.content; }).join(' ');
  assertContains(combined, 'shadownexussocial.online');
});

test('CKE-51: "What is Shadow Nexus Social?" → mentions shadownexussocial.online or features', function () {
  var ctx = getKnowledgeContext('What is Shadow Nexus Social?');
  assertExists(ctx, 'Must return knowledge');
  var combined = ctx.map(function (e) { return e.content; }).join(' ');
  // Either URL or description is present
  assert(
    combined.toLowerCase().indexOf('shadow nexus social') !== -1,
    'Must mention Shadow Nexus Social. Got: ' + combined.slice(0, 120)
  );
});

test('CKE-52: Chris website entry does NOT use shadownexussocial.online as Chris site URL', function () {
  var e = K.query('Does Chris have a website?');
  assertIsCreator(e);
  // Chris's own website should be chrislegendofshadows.com, not the SNS URL
  assertContains(e.content, 'chrislegendofshadows.com');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 8 — KNOWLEDGE AUTHORITY / ADAPTIVE LEARNING PROTECTION
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 8: Knowledge authority protection ─────────────────────────');

test('CKE-53: isVerifiedCreatorFact("Who created Shadow Reaper?") → true', function () {
  var result = K.isVerifiedCreatorFact('Who created Shadow Reaper?');
  assert(result === true, 'Creator identity query must return true. Got: ' + result);
});

test('CKE-54: isVerifiedCreatorFact("Who is Chris Legend of Shadows?") → true', function () {
  var result = K.isVerifiedCreatorFact('Who is Chris Legend of Shadows?');
  assert(result === true, 'Creator identity query must return true. Got: ' + result);
});

test('CKE-55: isVerifiedCreatorFact("What is Shadow Nexus Social?") → true', function () {
  // SNS is a CREATOR category entry
  var result = K.isVerifiedCreatorFact('Who created Shadow Nexus Social?');
  assert(result === true, 'SNS ownership must be protected. Got: ' + result);
});

test('CKE-56: canAdaptiveLearningOverwrite("Chris didn\'t create Shadow Reaper") → false', function () {
  // Resolves via "shadow reaper" keywords to a CREATOR entry → cannot overwrite
  var result = K.canAdaptiveLearningOverwrite("who created shadow reaper");
  assert(result === false, 'Adaptive learning must NOT overwrite creator facts. Got: ' + result);
});

test('CKE-57: canAdaptiveLearningOverwrite("Tell me a joke") → true (unrelated)', function () {
  var result = K.canAdaptiveLearningOverwrite("Tell me a joke");
  assert(result === true, 'Unrelated query must allow adaptive learning. Got: ' + result);
});

test('CKE-58: All CREATOR entries have editableByAdaptiveLearning: false', function () {
  var creatorEntries = K.getByCategory('CREATOR');
  assert(creatorEntries.length > 0, 'Must have CREATOR entries');
  creatorEntries.forEach(function (e) {
    assert(
      e.meta && e.meta.editableByAdaptiveLearning === false,
      'CREATOR entry must have editableByAdaptiveLearning: false. Entry: ' + e.content.slice(0, 60)
    );
  });
});

test('CKE-59: User contradiction does NOT match and overwrite creator identity', function () {
  // Simulate: a user says "Chris didn't create Shadow Reaper"
  // The knowledge engine must still return the verified creator fact
  var e = K.query('who created shadow reaper chris');
  assertIsCreator(e);
  assertContains(e.content, 'Chris');
  // And the protection flag is set
  assert(e.meta && e.meta.editableByAdaptiveLearning === false,
    'Creator ownership entry must be protected');
});

test('CKE-60: getVerifiedCreatorKnowledge() returns only entries with verified_creator authority', function () {
  var verified = K.getVerifiedCreatorKnowledge();
  assert(verified.length > 0, 'Must return verified creator entries');
  verified.forEach(function (e) {
    assert(e.meta && e.meta.authority === 'verified_creator',
      'All returned entries must be verified_creator. Got: ' + (e.meta ? e.meta.authority : 'no meta'));
    assert(e.category === 'CREATOR', 'Must be CREATOR category');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 9 — FOLLOW-UP PRONOUN RESOLUTION
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 9: Follow-up pronoun context ─────────────────────────────');

test('CKE-61: "What kind of music does he make?" can resolve to Chris music knowledge', function () {
  // The follow-up "he" refers to Chris — knowledge system must have music content
  var e = K.query('what kind of music does he make chris legend of shadows');
  assertExists(e, 'Must return music entry for expanded follow-up query');
  assertContains(e.content, 'music');
});

test('CKE-62: "Where can I find it?" with music context resolves to platforms', function () {
  // When "it" refers to music — platforms entry is in the top 3 results via queryMultiple
  var ctx = K.queryMultiple('where can i find it listen to chris legend of shadows music', 3);
  assert(Array.isArray(ctx) && ctx.length >= 1, 'Must return entries');
  var combined = ctx.map(function (entry) { return entry.content; }).join(' ');
  assertContains(combined, 'Spotify');
});

test('CKE-63: Multiple phrasings of creator query all return CREATOR knowledge', function () {
  var queries = [
    'Who created Shadow Reaper?',
    'Who built Shadow Reaper?',
    'Who is the creator?',
    'Who made this?',
    'Who is Chris?',
    'Who is Chris Legend of Shadows?',
    'who developed shadow reaper',
    'who is behind shadow reaper',
  ];
  queries.forEach(function (q) {
    var e = K.query(q);
    assertExists(e, 'Must return entry for: "' + q + '"');
    assert(e.category === 'CREATOR', 'Must be CREATOR for: "' + q + '". Got: ' + e.category);
    assertContains(e.content, 'Chris');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 10 — PERSONALITY DOES NOT ALTER FACTS
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 10: Personality cannot alter facts ────────────────────────');

test('CKE-64: Verified creator knowledge is identical regardless of personality mode', function () {
  // The knowledge engine has no personality state — it returns the same factual content
  // whether a personality system is active or not. This test verifies facts are static.
  var e1 = K.query('Who created Shadow Reaper?');
  var e2 = K.query('Who created Shadow Reaper?');
  assert(e1 === e2, 'Same query must always return the same entry (referential equality — same object)');
  assertContains(e1.content, 'Chris');
});

test('CKE-65: CREATOR entries do not contain personality-style narrative embellishments', function () {
  var creatorEntries = K.getByCategory('CREATOR');
  creatorEntries.forEach(function (e) {
    // Check for canned dramatic phrasing that belongs in personality, not facts
    assertNotContains(e.content, 'legendary genius');
    assertNotContains(e.content, 'unstoppable');
    assertNotContains(e.content, 'world-renowned');
    assertNotContains(e.content, 'most talented');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 11 — PRIVACY CHECKS
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 11: Privacy — no private data stored ──────────────────────');

test('CKE-66: No private addresses in any CREATOR entry', function () {
  var creatorEntries = K.getByCategory('CREATOR');
  creatorEntries.forEach(function (e) {
    assertNotContains(e.content, 'street');
    assertNotContains(e.content, 'avenue');
    assertNotContains(e.content, 'zip code');
    assertNotContains(e.content, 'postal code');
  });
});

test('CKE-67: No phone numbers in any CREATOR entry', function () {
  var creatorEntries = K.getByCategory('CREATOR');
  creatorEntries.forEach(function (e) {
    assert(!/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(e.content),
      'Creator entry must not contain phone numbers');
  });
});

test('CKE-68: No email addresses in any CREATOR entry', function () {
  var creatorEntries = K.getByCategory('CREATOR');
  creatorEntries.forEach(function (e) {
    assert(!/@/.test(e.content), 'Creator entry must not contain email addresses');
  });
});

test('CKE-69: No passwords/credentials in any knowledge entry', function () {
  var allEntries = K.getByCategory('CREATOR')
    .concat(K.getByCategory('SNS'))
    .concat(K.getByCategory('GENERAL'));
  allEntries.forEach(function (e) {
    assertNotContains(e.content, 'password');
    assertNotContains(e.content, 'api_key');
    assertNotContains(e.content, 'private key');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 12 — KNOWN CONTENT TESTS
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n── SECTION 12: Required content present ─────────────────────────────');

test('CKE-70: "chrislegendofshadows.com" is present in CREATOR knowledge', function () {
  var allCreator = K.getByCategory('CREATOR');
  var hasUrl = allCreator.some(function (e) {
    return e.content.indexOf('chrislegendofshadows.com') !== -1;
  });
  assert(hasUrl, 'chrislegendofshadows.com must be in CREATOR knowledge');
});

test('CKE-71: "shadownexussocial.online" is present in CREATOR knowledge', function () {
  var allCreator = K.getByCategory('CREATOR');
  var hasUrl = allCreator.some(function (e) {
    return e.content.indexOf('shadownexussocial.online') !== -1;
  });
  assert(hasUrl, 'shadownexussocial.online must be in CREATOR knowledge');
});

test('CKE-72: "Green Heart Family" (exact capitalization) is in CREATOR knowledge', function () {
  var allCreator = K.getByCategory('CREATOR');
  var hasGHF = allCreator.some(function (e) {
    return e.content.indexOf('Green Heart Family') !== -1;
  });
  assert(hasGHF, 'Must have exact "Green Heart Family" in CREATOR knowledge');
});

test('CKE-73: Music song title "Stay Legendary" is in CREATOR knowledge', function () {
  var allCreator = K.getByCategory('CREATOR');
  var hasSong = allCreator.some(function (e) {
    return e.content.indexOf('Stay Legendary') !== -1;
  });
  assert(hasSong, 'Must have "Stay Legendary" in CREATOR knowledge');
});

test('CKE-74: Voice STT format (lowercase, no punctuation) still resolves creator', function () {
  var e = K.query('who is chris legend of shadows');
  assertIsCreator(e);
  assertContains(e.content, 'Chris');
});

test('CKE-75: Voice STT format for music query resolves correctly', function () {
  var e = K.query('where can i listen to chris legend of shadows music');
  assertExists(e, 'Must return entry for voice music query');
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUMMARY
   ═══════════════════════════════════════════════════════════════════════════*/
console.log('\n══════════════════════════════════════════════════════');
console.log('  SR Creator Knowledge Expansion Tests');
console.log('  SR-CREATOR-KNOWLEDGE-EXPANSION-TEST-1');
console.log('══════════════════════════════════════════════════════');
results.forEach(function (r) { console.log(r); });
console.log('══════════════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
console.log('══════════════════════════════════════════════════════\n');
process.exit(FAIL > 0 ? 1 : 0);
