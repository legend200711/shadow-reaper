/**
 * shadow-reaper-v2/language/data/repair-vocab.js
 *
 * VOCABULARY REPAIR — removes known invalid generated forms.
 *
 * Targets:
 *   1. Invalid double-consonant -ing forms from non-doubling stems
 *      e.g. administerring, deliverring, empowerring, monitorring, registerring
 *   2. Wrong double consonant: developping, limitting, auditting, targetting
 *   3. Bad irregular verb forms: runned, runed, runing, writed, stoped, telled, selled, holded
 *   4. Prefix + those bad forms: rerunned, prewrited, overholded, etc.
 *
 * NOTE on legitimate British spellings:
 *   cancelling, modelling, travelling — these ARE valid English (British).
 *   transferring — valid (stress on 2nd syllable).
 *   fulfilling — valid (fill → fulfilling).
 *   Do NOT remove these.
 *
 * Usage: node language/data/repair-vocab.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const DATA = path.resolve(__dirname);

const vocabPath  = path.join(DATA, 'vocab-index.json');
const lemmaPath  = path.join(DATA, 'lemma-index.json');
const reportPath = path.join(DATA, 'build-report.json');

console.log('Loading vocab-index.json …');
const vocab    = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
const lemmaIdx = JSON.parse(fs.readFileSync(lemmaPath, 'utf8'));
const report   = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const before = Object.keys(vocab).length;
let removed = 0;
const removedList = [];

// ─── Invalid patterns ───────────────────────────────────────────────────────

/**
 * Words that end in -rring that are NOT valid doublings.
 * Valid: starring, barring, scarring, sparring, jarring, marring, tarring,
 *        warring, farring, occurring, recurring, deterring, referring,
 *        conferring, deferring, inferring, preferring, transferring,
 *        blurring, slurring, purring, spurring, stirring, whirring.
 */
const VALID_DOUBLE_R = new Set([
  'starring', 'barring', 'scarring', 'sparring', 'jarring', 'marring',
  'tarring', 'warring', 'farring', 'occurring', 'recurring', 'deterring',
  'referring', 'conferring', 'deferring', 'inferring', 'preferring',
  'transferring', 'blurring', 'slurring', 'purring', 'spurring', 'stirring',
  'whirring', 'interring', 'disinterring',
  // prefixed forms of valid ones
  'reoccurring', 'rerecurring',
]);

/**
 * For -rring words: check if a word has an invalid doubling.
 * Invalid = ends in -rring AND is not in the valid set AND the base doesn't end in -r+vowel.
 */
function isInvalidDoubleR(w) {
  if (!w.endsWith('rring')) return false;
  if (VALID_DOUBLE_R.has(w)) return false;
  // Any -rring word not in valid set = invalid
  return true;
}

/**
 * Invalid double-consonant patterns for non-doubling stems.
 * developping, empowerring caught above. Also:
 *   limitting (→ limiting), auditting (→ auditing), targetting (→ targeting)
 *
 * NOTE: targetting and modelling are valid British English.
 * auditting and limitting are NOT valid anywhere.
 */
const EXPLICIT_INVALID = new Set([
  // Bad past tenses / participles of irregular verbs
  'runned', 'runed', 'runing',   // run → ran/run/running
  'writed',                        // write → wrote/written/writing
  'stoped',                        // stop → stopped
  'telled',                        // tell → told
  'selled',                        // sell → sold
  'holded',                        // hold → held
  // These are genuinely misspelled (invalid anywhere)
  'limitting', 'limittings',       // limit → limiting
  'auditting', 'audittings',       // audit → auditing
  'developping', 'developps', 'developped', // develop → developing
  'empowerring', 'empowerred',     // empower → empowering
  'monitorring', 'monitorred',     // monitor → monitoring
  'registerring', 'registerred',   // register → registering
  'renderring', 'renderred',       // render → rendering
  'administerring', 'administerred', // administer → administering
  'alterring', 'alterred',         // alter → altering
  'filterring', 'filterred',       // filter → filtering
  'botherring', 'botherred',       // bother → bothering
  'coverring', 'coverred',         // cover → covering
  'deliverring', 'deliverred',     // deliver → delivering
]);

/**
 * Prefixes that were applied to make compound forms.
 */
const PREFIXES = [
  're','pre','un','over','under','dis','mis','co','de','inter','sub','anti',
  'auto','trans','counter','non','pro','bi','out',
];

/**
 * Build complete invalid set — explicit + all prefix combinations.
 */
const allInvalid = new Set(EXPLICIT_INVALID);

EXPLICIT_INVALID.forEach(function (base) {
  PREFIXES.forEach(function (pfx) {
    allInvalid.add(pfx + base);
  });
});

// ─── Remove invalid entries ─────────────────────────────────────────────────

Object.keys(vocab).forEach(function (word) {
  let doRemove = false;
  let reason   = '';

  if (allInvalid.has(word)) {
    doRemove = true;
    reason   = 'explicit_invalid';
  } else if (isInvalidDoubleR(word)) {
    doRemove = true;
    reason   = 'invalid_double_r';
  }

  if (doRemove) {
    const lemma = vocab[word] && vocab[word].lemma;
    delete vocab[word];
    removed++;
    removedList.push({ word, reason, lemma: lemma || '?' });

    // Also remove from lemma index
    if (lemma && lemmaIdx[lemma]) {
      lemmaIdx[lemma] = lemmaIdx[lemma].filter(function (f) { return f !== word; });
      if (lemmaIdx[lemma].length === 0) {
        delete lemmaIdx[lemma];
      }
    }
  }
});

// ─── Ensure critical correct forms ARE present ─────────────────────────────
// The repair removed some bad forms — make sure valid forms exist.

function addIfMissing(word, lemma, pos) {
  if (!vocab[word]) {
    const maxRank = Math.max(...Object.values(vocab).map(e => e.rank || 0));
    vocab[word] = { lemma, pos, rank: maxRank + 1 };
    if (!lemmaIdx[lemma]) lemmaIdx[lemma] = [];
    if (!lemmaIdx[lemma].includes(word)) lemmaIdx[lemma].push(word);
    console.log('  Added missing valid form:', word, '->', lemma);
  }
}

// Ensure these are correct
addIfMissing('ran',     'run',   'verb');
addIfMissing('running', 'run',   'verb');
addIfMissing('run',     'run',   'verb');
addIfMissing('runs',    'run',   'verb');
addIfMissing('wrote',   'write', 'verb');
addIfMissing('written', 'write', 'verb');  // adj in old, remap to verb
addIfMissing('writing', 'write', 'verb');
addIfMissing('writes',  'write', 'verb');
addIfMissing('stopped', 'stop',  'verb');
addIfMissing('stopping','stop',  'verb');
addIfMissing('stops',   'stop',  'verb');
addIfMissing('held',    'hold',  'verb');
addIfMissing('holding', 'hold',  'verb');
addIfMissing('holds',   'hold',  'verb');
addIfMissing('told',    'tell',  'verb');
addIfMissing('telling', 'tell',  'verb');
addIfMissing('tells',   'tell',  'verb');
addIfMissing('sold',    'sell',  'verb');
addIfMissing('selling', 'sell',  'verb');
addIfMissing('sells',   'sell',  'verb');
addIfMissing('monitoring', 'monitor', 'verb');
addIfMissing('monitored',  'monitor', 'verb');
addIfMissing('limiting',   'limit',   'verb');
addIfMissing('limited',    'limit',   'verb');
addIfMissing('auditing',   'audit',   'verb');
addIfMissing('audited',    'audit',   'verb');
addIfMissing('delivering', 'deliver', 'verb');
addIfMissing('delivered',  'deliver', 'verb');
addIfMissing('filtering',  'filter',  'verb');
addIfMissing('filtered',   'filter',  'verb');
addIfMissing('rendering',  'render',  'verb');
addIfMissing('rendered',   'render',  'verb');
addIfMissing('altering',   'alter',   'verb');
addIfMissing('altered',    'alter',   'verb');
addIfMissing('developing', 'develop', 'verb');
addIfMissing('developed',  'develop', 'verb');
addIfMissing('registering','register','verb');
addIfMissing('registered', 'register','verb');
addIfMissing('administering','administer','verb');
addIfMissing('administered','administer','verb');
addIfMissing('covering',   'cover',   'verb');
addIfMissing('covered',    'cover',   'verb');
addIfMissing('bothering',  'bother',  'verb');
addIfMissing('bothered',   'bother',  'verb');
addIfMissing('empowering', 'empower', 'verb');
addIfMissing('empowered',  'empower', 'verb');

// ─── Save ───────────────────────────────────────────────────────────────────

const after = Object.keys(vocab).length;
const uniqueLemmasAfter = Object.keys(lemmaIdx).length;

console.log('\nWriting vocab-index.json …');
fs.writeFileSync(vocabPath, JSON.stringify(vocab), 'utf8');

console.log('Writing lemma-index.json …');
fs.writeFileSync(lemmaPath, JSON.stringify(lemmaIdx), 'utf8');

// Update build report
const updatedReport = Object.assign({}, report, {
  generatedAt:        new Date().toISOString(),
  totalEntries:       after,
  uniqueLemmas:       uniqueLemmasAfter,
  repairRun:          true,
  repairDate:         new Date().toISOString(),
  invalidRemoved:     removed,
  beforeRepair:       before,
  byPos: {
    noun:  Object.values(vocab).filter(e => e.pos === 'noun').length,
    adj:   Object.values(vocab).filter(e => e.pos === 'adj').length,
    verb:  Object.values(vocab).filter(e => e.pos === 'verb').length,
    adv:   Object.values(vocab).filter(e => e.pos === 'adv').length,
    other: Object.values(vocab).filter(e => e.pos === 'other').length,
  },
  note: 'Word forms only — no definitions. Open English language, no proprietary content. Invalid generated forms removed.',
});

fs.writeFileSync(reportPath, JSON.stringify(updatedReport, null, 2), 'utf8');

console.log('\n═══════════════════════════════════════════');
console.log('  VOCAB REPAIR COMPLETE');
console.log('═══════════════════════════════════════════');
console.log('  Before:         ', before, 'forms');
console.log('  Removed:        ', removed, 'invalid forms');
console.log('  After:          ', after,  'forms');
console.log('  Unique lemmas:  ', uniqueLemmasAfter);
console.log('═══════════════════════════════════════════');

// Print removal breakdown
const byReason = {};
removedList.forEach(function (r) {
  byReason[r.reason] = (byReason[r.reason] || 0) + 1;
});
console.log('\n  Removal reasons:');
Object.entries(byReason).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log('   ', v.toString().padStart(5), k);
});

if (process.argv.includes('--verbose')) {
  console.log('\n  Sample removed:');
  removedList.slice(0, 30).forEach(function (r) {
    console.log('   ', r.word, '[' + r.reason + ']', '→ lemma:', r.lemma);
  });
}
