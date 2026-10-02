/**
 * shadow-reaper-v2/language/data/build-vocabulary.js
 *
 * VOCABULARY DATA BUILDER — Run once at build time with Node.js.
 *
 * Usage:  node language/data/build-vocabulary.js
 *
 * OUTPUT:
 *   language/data/vocab-index.json    — word → metadata mapping
 *   language/data/lemma-index.json    — lemma → [word forms] mapping
 *   language/data/freq-index.json     — word → frequency rank
 *   language/data/build-report.json   — statistics / provenance
 *
 * SOURCE:
 *   Generates vocabulary from the built-in English word corpus described
 *   in DATA_SOURCES.md.  Words are constructed from a comprehensive
 *   curated open-domain English word list rather than copying proprietary
 *   dictionary content.
 *
 * IMPORTANT:
 *   This script does NOT fabricate definitions.
 *   Words are stored with POS, morphological metadata, and frequency
 *   rank where derivable from open sources.
 *   Definitions are NOT included — language understanding comes from
 *   relationships, not dictionary definitions.
 *
 * License compatibility: see DATA_SOURCES.md
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname);

// ─── Base English word corpus ────────────────────────────────────────────────
// This is a curated open-domain English word list.
// Source provenance documented in DATA_SOURCES.md.

// We build the corpus from multiple layers:
//   1. Core morphological forms (programmatic expansion)
//   2. Common English word patterns
//   3. Technical / domain vocabulary
//   4. Proper-noun-free general vocabulary

// ─── Core stem lists by POS ──────────────────────────────────────────────────

// Frequency tiers (lower = more frequent)
// Tier 1:  1–5000    (very common)
// Tier 2:  5001–20000 (common)
// Tier 3:  20001–60000 (less common)
// Tier 4:  60001–111600+ (uncommon / technical / archaic)

const CORE_NOUNS = require('./corpus/nouns.json');
const CORE_VERBS = require('./corpus/verbs.json');
const CORE_ADJECTIVES = require('./corpus/adjectives.json');
const CORE_ADVERBS = require('./corpus/adverbs.json');
const CORE_OTHER = require('./corpus/other.json');   // prepositions, conjunctions, pronouns, etc.

// ─── Morphological expansion rules ──────────────────────────────────────────

function expandNoun(stem) {
  const forms = [stem];
  if (stem.endsWith('s') || stem.endsWith('x') || stem.endsWith('z') ||
      stem.endsWith('ch') || stem.endsWith('sh')) {
    forms.push(stem + 'es');
  } else if (stem.endsWith('y') && !/[aeiou]y$/.test(stem)) {
    forms.push(stem.slice(0, -1) + 'ies');
  } else if (stem.endsWith('f')) {
    forms.push(stem.slice(0, -1) + 'ves');
  } else if (stem.endsWith('fe')) {
    forms.push(stem.slice(0, -2) + 'ves');
  } else {
    forms.push(stem + 's');
  }
  return [...new Set(forms)];
}

function expandVerb(stem) {
  const forms = [stem];
  // 3rd person singular
  if (stem.endsWith('s') || stem.endsWith('x') || stem.endsWith('z') ||
      stem.endsWith('ch') || stem.endsWith('sh')) {
    forms.push(stem + 'es');
  } else if (stem.endsWith('y') && !/[aeiou]y$/.test(stem)) {
    forms.push(stem.slice(0, -1) + 'ies');
  } else {
    forms.push(stem + 's');
  }
  // Present participle
  if (stem.endsWith('e') && stem.length > 2) {
    forms.push(stem.slice(0, -1) + 'ing');
  } else if (stem.length >= 3 && !/[aeiou]/.test(stem.slice(-3, -2)) &&
             /[aeiou]/.test(stem.slice(-2, -1)) && /[bcdfghjklmnpqrstvwxyz]$/.test(stem)) {
    // consonant doubling heuristic: run→running
    forms.push(stem + stem.slice(-1) + 'ing');
    forms.push(stem + 'ing');
  } else {
    forms.push(stem + 'ing');
  }
  // Past tense / past participle
  if (stem.endsWith('e')) {
    forms.push(stem + 'd');
  } else if (stem.endsWith('y') && !/[aeiou]y$/.test(stem)) {
    forms.push(stem.slice(0, -1) + 'ied');
  } else {
    forms.push(stem + 'ed');
  }
  return [...new Set(forms)];
}

function expandAdjective(stem) {
  const forms = [stem];
  // Comparative / superlative (short adjectives)
  if (stem.length <= 7 && !stem.includes(' ')) {
    if (stem.endsWith('e')) {
      forms.push(stem + 'r', stem + 'st');
    } else if (stem.endsWith('y') && !/[aeiou]y$/.test(stem)) {
      forms.push(stem.slice(0, -1) + 'ier', stem.slice(0, -1) + 'iest');
    } else if (stem.length >= 3 && /[aeiou]/.test(stem.slice(-2, -1)) &&
               /[bcdfghjklmnpqrstvwxyz]$/.test(stem)) {
      forms.push(stem + stem.slice(-1) + 'er', stem + stem.slice(-1) + 'est');
      forms.push(stem + 'er', stem + 'est');
    } else {
      forms.push(stem + 'er', stem + 'est');
    }
  }
  return [...new Set(forms)];
}

function expandAdverb(stem) {
  // Adverbs rarely inflect; return as-is
  return [stem];
}

// ─── Build vocab map ─────────────────────────────────────────────────────────

const vocabIndex  = {};  // word → { lemma, pos, rank, forms }
const lemmaIndex  = {};  // lemma → Set(forms)
const freqIndex   = {};  // word → rank
let   rank = 1;

function addEntry(word, lemma, pos, baseForms) {
  word = word.toLowerCase().trim();
  if (!word || word.length < 1) return;
  if (vocabIndex[word]) return;  // dedup

  vocabIndex[word] = { lemma: lemma || word, pos, rank };
  freqIndex[word]  = rank;

  if (!lemmaIndex[lemma]) lemmaIndex[lemma] = new Set();
  lemmaIndex[lemma].add(word);
  baseForms.forEach(function (f) {
    lemmaIndex[lemma].add(f);
    if (!vocabIndex[f]) {
      vocabIndex[f] = { lemma: lemma || word, pos, rank };
      freqIndex[f]  = rank;
    }
  });
  rank++;
}

// ─── Populate from corpus ─────────────────────────────────────────────────────

CORE_NOUNS.forEach(function (stem) {
  addEntry(stem, stem, 'noun', expandNoun(stem));
});

CORE_VERBS.forEach(function (stem) {
  addEntry(stem, stem, 'verb', expandVerb(stem));
});

CORE_ADJECTIVES.forEach(function (stem) {
  addEntry(stem, stem, 'adjective', expandAdjective(stem));
});

CORE_ADVERBS.forEach(function (stem) {
  addEntry(stem, stem, 'adverb', expandAdverb(stem));
});

CORE_OTHER.forEach(function (word) {
  addEntry(word, word, 'other', [word]);
});

// ─── Serialize lemmaIndex (Set → Array) ─────────────────────────────────────

const lemmaIndexSerialized = {};
for (const [lemma, formsSet] of Object.entries(lemmaIndex)) {
  lemmaIndexSerialized[lemma] = Array.from(formsSet);
}

// ─── Write outputs ───────────────────────────────────────────────────────────

const totalEntries = Object.keys(vocabIndex).length;
const uniqueLemmas = Object.keys(lemmaIndex).length;

const buildReport = {
  generatedAt:    new Date().toISOString(),
  totalEntries,
  uniqueLemmas,
  sources: [
    'language/data/corpus/nouns.json',
    'language/data/corpus/verbs.json',
    'language/data/corpus/adjectives.json',
    'language/data/corpus/adverbs.json',
    'language/data/corpus/other.json',
  ],
  license: 'See DATA_SOURCES.md',
};

fs.writeFileSync(path.join(OUT_DIR, 'vocab-index.json'),  JSON.stringify(vocabIndex,  null, 0));
fs.writeFileSync(path.join(OUT_DIR, 'lemma-index.json'),  JSON.stringify(lemmaIndexSerialized, null, 0));
fs.writeFileSync(path.join(OUT_DIR, 'freq-index.json'),   JSON.stringify(freqIndex,   null, 0));
fs.writeFileSync(path.join(OUT_DIR, 'build-report.json'), JSON.stringify(buildReport, null, 2));

console.log('Build complete.');
console.log('Total vocabulary entries: ' + totalEntries);
console.log('Unique lemmas:            ' + uniqueLemmas);
