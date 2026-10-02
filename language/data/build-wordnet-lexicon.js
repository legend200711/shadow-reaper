/**
 * shadow-reaper-v2/language/data/build-wordnet-lexicon.js
 *
 * Build: SR-LEXICON-BUILD-1
 *
 * Parse Princeton WordNet 3.1 database files (from wordnet-db npm package)
 * and extract a compact, indexed lexical JSON for Shadow Reaper's
 * local WordNet provider.
 *
 * Output:
 *   language/data/wordnet-index.json   — lemma → [{pos, senses:[{id,def,synonyms,lex}]}]
 *   language/data/wordnet-stats.json   — size report
 *
 * WordNet license: WordNet 3.1 Copyright 2011 Princeton University.
 * See node_modules/wordnet-db/LICENSE for full terms.
 * Attribution file is preserved at language/data/WORDNET-LICENSE.txt
 *
 * Usage:
 *   node language/data/build-wordnet-lexicon.js
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var WN_DIR  = path.resolve(__dirname, '../../node_modules/wordnet-db/dict');
var OUT_DIR = path.resolve(__dirname, '.');

// ── POS constants ────────────────────────────────────────────────────────────
var POS_FILES = [
  { pos: 'noun',      dataFile: 'data.noun', indexFile: 'index.noun' },
  { pos: 'verb',      dataFile: 'data.verb', indexFile: 'index.verb' },
  { pos: 'adj',       dataFile: 'data.adj',  indexFile: 'index.adj'  },
  { pos: 'adv',       dataFile: 'data.adv',  indexFile: 'index.adv'  },
];

// Maximum senses to store per lemma+POS combination.
// Keeps the JSON compact while covering practical vocabulary.
var MAX_SENSES_PER_POS = 8;

// ── Parse a WordNet data file, return offset → {words[], gloss} ─────────────
function parseDataFile(filePath) {
  var raw   = fs.readFileSync(filePath, 'utf8');
  var lines = raw.split('\n');
  var map   = {};

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Skip licence header comments
    if (!line || line[0] === ' ') continue;
    var sp = line.indexOf(' ');
    if (sp < 0) continue;
    var offset = line.substring(0, sp);

    // Extract gloss (after pipe)
    var pipeIdx = line.indexOf('|');
    var gloss = pipeIdx >= 0 ? line.substring(pipeIdx + 1).trim() : '';
    // Remove trailing examples (split by "; \"" — keep only the definition)
    var semiQuote = gloss.indexOf('; "');
    if (semiQuote > 0) gloss = gloss.substring(0, semiQuote).trim();
    // Remove leading/trailing whitespace artefacts
    gloss = gloss.replace(/\s+/g, ' ').trim();

    // Extract word list from synset
    // Format after offset: lex_filenum ss_type w_cnt word lex_id [word lex_id ...]
    var meta      = line.substring(0, pipeIdx >= 0 ? pipeIdx : line.length);
    var metaParts = meta.trim().split(' ');
    // metaParts[0]=offset, [1]=lex_filenum, [2]=ss_type, [3]=w_cnt (hex)
    var w_cnt = parseInt(metaParts[3], 16);
    var words = [];
    for (var j = 0; j < w_cnt; j++) {
      var raw_word = metaParts[4 + j * 2] || '';
      // Strip syntactic markers like (a)(p) appended to adj satellite forms
      var clean = raw_word.replace(/\([^)]*\)/g, '').replace(/_/g, ' ').toLowerCase().trim();
      if (clean && clean.length > 0) words.push(clean);
    }

    map[offset] = { words: words, gloss: gloss };
  }

  return map;
}

// ── Parse a WordNet index file, return lemma → [offset, ...] ────────────────
function parseIndexFile(filePath) {
  var raw   = fs.readFileSync(filePath, 'utf8');
  var lines = raw.split('\n');
  var map   = {};

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line[0] === ' ') continue;
    var parts = line.split(' ');
    if (parts.length < 6) continue;

    var word      = parts[0].replace(/_/g, ' ').toLowerCase();
    // parts[1]=pos, parts[2]=synset_cnt, parts[3]=p_cnt
    var synset_cnt = parseInt(parts[2]);
    var p_cnt      = parseInt(parts[3]);
    // After p_cnt pointer symbols: sense_cnt tagsense_cnt [offsets...]
    var offsetStart = 4 + p_cnt + 2;  // skip ptrs + sense_cnt + tagsense_cnt
    var offsets = parts.slice(offsetStart, offsetStart + synset_cnt);

    map[word] = offsets;
  }

  return map;
}

// ── Build the combined lexicon ───────────────────────────────────────────────
function build() {
  console.log('[build-wordnet-lexicon] Starting WordNet 3.1 extraction…');

  // lemmaMap: lemma → { noun:[senses], verb:[senses], adj:[senses], adv:[senses] }
  var lemmaMap = {};

  var totalSenses     = 0;
  var totalSynsets    = 0;
  var totalLemmas     = 0;
  var totalDefs       = 0;

  POS_FILES.forEach(function (spec) {
    console.log('  Processing ' + spec.pos + '…');

    var dataPath  = path.join(WN_DIR, spec.dataFile);
    var indexPath = path.join(WN_DIR, spec.indexFile);

    var dataMap  = parseDataFile(dataPath);
    var indexMap = parseIndexFile(indexPath);

    var posKeys = Object.keys(indexMap);
    console.log('    ' + posKeys.length + ' ' + spec.pos + ' lemmas in index');

    posKeys.forEach(function (lemma) {
      var offsets = indexMap[lemma];
      var senses  = [];

      for (var k = 0; k < offsets.length && senses.length < MAX_SENSES_PER_POS; k++) {
        var entry = dataMap[offsets[k]];
        if (!entry || !entry.gloss) continue;

        // synonyms = other members of the synset (words != lemma)
        var synonyms = entry.words.filter(function (w) {
          return w !== lemma && w.length > 1;
        }).slice(0, 5);  // cap at 5 synonyms per sense

        senses.push({
          id:  offsets[k],
          def: entry.gloss,
          syn: synonyms,
        });

        totalDefs++;
      }

      if (senses.length === 0) return;

      totalSenses += senses.length;

      if (!lemmaMap[lemma]) {
        lemmaMap[lemma] = {};
        totalLemmas++;
      }
      lemmaMap[lemma][spec.pos] = senses;
    });

    totalSynsets += Object.keys(dataMap).length;
    console.log('    Done. Data synsets in file: ' + Object.keys(dataMap).length);
  });

  console.log('  Lemmas with at least one POS: ' + Object.keys(lemmaMap).length);
  console.log('  Total senses extracted:       ' + totalSenses);
  console.log('  Total definitions:            ' + totalDefs);
  console.log('  Total synsets (data files):   ' + totalSynsets);

  // ── Write output ────────────────────────────────────────────────────────────
  var outPath = path.join(OUT_DIR, 'wordnet-index.json');
  fs.writeFileSync(outPath, JSON.stringify(lemmaMap), 'utf8');
  var sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log('  Wrote ' + outPath + ' (' + sizeMB + ' MB)');

  // ── Write stats ─────────────────────────────────────────────────────────────
  var stats = {
    build:        'SR-LEXICON-BUILD-1',
    dataset:      'Princeton WordNet 3.1',
    package:      'wordnet-db@3.1.14',
    license:      'WordNet 3.1 License (Princeton University)',
    generated:    new Date().toISOString(),
    lemmaCount:   Object.keys(lemmaMap).length,
    senseCount:   totalSenses,
    defCount:     totalDefs,
    synsetCount:  totalSynsets,
    sizeMB:       parseFloat(sizeMB),
  };

  fs.writeFileSync(path.join(OUT_DIR, 'wordnet-stats.json'), JSON.stringify(stats, null, 2), 'utf8');
  console.log('  Wrote wordnet-stats.json');

  // ── Copy WordNet license into language/data ──────────────────────────────────
  var wnLicenseSrc = path.join(WN_DIR, '..', 'LICENSE');
  var wnLicenseDst = path.join(OUT_DIR, 'WORDNET-LICENSE.txt');
  if (fs.existsSync(wnLicenseSrc)) {
    fs.copyFileSync(wnLicenseSrc, wnLicenseDst);
    console.log('  Preserved WordNet license → ' + wnLicenseDst);
  }

  console.log('[build-wordnet-lexicon] Done.');
  return stats;
}

build();
