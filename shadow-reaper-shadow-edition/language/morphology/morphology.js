/**
 * shadow-reaper-v2/language/morphology/morphology.js
 * Shadow Reaper — Morphology Engine
 *
 * Build: SR-LANG-MORPHOLOGY-1
 *
 * Exposes: window.SRMorphology
 *
 * Responsibilities:
 *   - Connect word forms to lemmas / root concepts
 *   - Recognize plurals, conjugations, comparatives as related
 *   - Support stemming and lemmatization
 *   - Handle irregular forms
 *
 * This module uses the vocabulary index built by build-vocab-final.js.
 * The vocab-index is loaded lazily (not at startup) to avoid blocking.
 *
 * Zero external calls. Zero hosted AI. Pure deterministic local logic.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-LANG-MORPHOLOGY-1';

  // ─── Lazy vocab index loading ─────────────────────────────────────────────
  var _vocabIndex  = null;   // word → { lemma, pos, rank }
  var _lemmaIndex  = null;   // lemma → [forms]
  var _loadStatus  = 'unloaded';  // unloaded | loading | loaded | failed
  var _loadCallbacks = [];

  /**
   * Load the vocabulary indexes into memory.
   * Uses fetch() in browser, fs in Node.js.
   * The vocab-index.json is ~7MB — loaded once and cached.
   */
  function ensureLoaded(callback) {
    callback = callback || function () {};

    if (_loadStatus === 'loaded') {
      callback(null);
      return;
    }
    if (_loadStatus === 'loading') {
      _loadCallbacks.push(callback);
      return;
    }

    _loadStatus = 'loading';
    _loadCallbacks.push(callback);

    function _done(err) {
      _loadStatus = err ? 'failed' : 'loaded';
      var cbs = _loadCallbacks.splice(0);
      cbs.forEach(function (cb) { cb(err || null); });
    }

    // Node.js path — detect by process.versions.node (reliable, unlike window/fetch checks)
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        var path = require('path');
        var fs   = require('fs');
        // __dirname may be language/morphology/ — data is at language/data/
        // Try sibling-directory path first, then fallback one level up
        var base = path.resolve(__dirname, '../data');
        if (!fs.existsSync(path.join(base, 'vocab-index.json'))) {
          base = path.resolve(__dirname, '../../language/data');
        }
        if (!fs.existsSync(path.join(base, 'vocab-index.json'))) {
          base = path.resolve(__dirname, '../../data');
        }
        _vocabIndex = JSON.parse(fs.readFileSync(path.join(base, 'vocab-index.json'), 'utf8'));
        _lemmaIndex = JSON.parse(fs.readFileSync(path.join(base, 'lemma-index.json'), 'utf8'));
        _done(null);
      } catch (e) {
        console.warn('[SRMorphology] Could not load vocab indexes:', e.message);
        _done(e);
      }
      return;
    }

    // Browser path — fetch JSON lazily
    var base = '/language/data/';
    var loaded = 0;
    function check() {
      loaded++;
      if (loaded === 2) _done(null);
    }

    global.fetch(base + 'vocab-index.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { _vocabIndex = data; check(); })
      .catch(function (e) { console.warn('[SRMorphology] vocab-index.json failed:', e.message); _done(e); });

    global.fetch(base + 'lemma-index.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { _lemmaIndex = data; check(); })
      .catch(function (e) { console.warn('[SRMorphology] lemma-index.json failed:', e.message); _done(e); });
  }

  // ─── Irregular verb table (common forms) ─────────────────────────────────
  var IRREGULAR_VERBS = {
    'am':'be','is':'be','are':'be','was':'be','were':'be','been':'be','being':'be',
    'has':'have','had':'have','having':'have',
    'does':'do','did':'do','done':'do','doing':'do',
    'goes':'go','went':'go','gone':'go','going':'go',
    'gets':'get','got':'get','gotten':'get','getting':'get',
    'makes':'make','made':'make','making':'make',
    'takes':'take','took':'take','taken':'take','taking':'take',
    'comes':'come','came':'come','coming':'come',
    'sees':'see','saw':'see','seen':'see','seeing':'see',
    'knows':'know','knew':'know','known':'know','knowing':'know',
    'thinks':'think','thought':'think','thinking':'think',
    'says':'say','said':'say','saying':'say',
    'gives':'give','gave':'give','given':'give','giving':'give',
    'finds':'find','found':'find','finding':'find',
    'tells':'tell','told':'tell','telling':'tell',
    'leaves':'leave','left':'leave','leaving':'leave',
    'keeps':'keep','kept':'keep','keeping':'keep',
    'holds':'hold','held':'hold','holding':'hold',
    'brings':'bring','brought':'bring','bringing':'bring',
    'writes':'write','wrote':'write','written':'write','writing':'write',
    'sits':'sit','sat':'sit','sitting':'sit',
    'stands':'stand','stood':'stand','standing':'stand',
    'loses':'lose','lost':'lose','losing':'lose',
    'pays':'pay','paid':'pay','paying':'pay',
    'meets':'meet','met':'meet','meeting':'meet',
    'runs':'run','ran':'run','running':'run',
    'builds':'build','built':'build','building':'build',
    'falls':'fall','fell':'fall','fallen':'fall','falling':'fall',
    'grows':'grow','grew':'grow','grown':'grow','growing':'grow',
    'breaks':'break','broke':'break','broken':'break','breaking':'break',
    'buys':'buy','bought':'buy','buying':'buy',
    'sends':'send','sent':'send','sending':'send',
    'wins':'win','won':'win','winning':'win',
    'reads':'read','reading':'read',
    'speaks':'speak','spoke':'speak','spoken':'speak','speaking':'speak',
    'leads':'lead','led':'lead','leading':'lead',
    'chooses':'choose','chose':'choose','chosen':'choose','choosing':'choose',
    'drives':'drive','drove':'drive','driven':'drive','driving':'drive',
    'eats':'eat','ate':'eat','eaten':'eat','eating':'eat',
    'feels':'feel','felt':'feel','feeling':'feel',
    'flies':'fly','flew':'fly','flown':'fly','flying':'fly',
    'catches':'catch','caught':'catch','catching':'catch',
    'hears':'hear','heard':'hear','hearing':'hear',
    'shows':'show','showed':'show','shown':'show','showing':'show',
    'wears':'wear','wore':'wear','worn':'wear','wearing':'wear',
    'begins':'begin','began':'begin','begun':'begin','beginning':'begin',
    'fights':'fight','fought':'fight','fighting':'fight',
    'forgets':'forget','forgot':'forget','forgotten':'forget','forgetting':'forget',
    'understands':'understand','understood':'understand',
    'sells':'sell','sold':'sell','selling':'sell',
    'draws':'draw','drew':'draw','drawn':'draw','drawing':'draw',
    'sleeps':'sleep','slept':'sleep','sleeping':'sleep',
    'teaches':'teach','taught':'teach','teaching':'teach',
    'throws':'throw','threw':'throw','thrown':'throw','throwing':'throw',
    'rides':'ride','rode':'ride','ridden':'ride','riding':'ride',
    'rises':'rise','rose':'rise','risen':'rise','rising':'rise',
    'seeks':'seek','sought':'seek','seeking':'seek',
    'deals':'deal','dealt':'deal','dealing':'deal',
    'feeds':'feed','fed':'feed','feeding':'feed',
    'hides':'hide','hid':'hide','hidden':'hide','hiding':'hide',
    'bites':'bite','bit':'bite','bitten':'bite','biting':'bite',
    'blows':'blow','blew':'blow','blown':'blow','blowing':'blow',
    'wakes':'wake','woke':'wake','woken':'wake','waking':'wake',
    'hangs':'hang','hung':'hang','hanging':'hang',
    'lays':'lay','laid':'lay','laying':'lay',
    'means':'mean','meant':'mean','meaning':'mean',
    'shines':'shine','shone':'shine','shining':'shine',
    'sings':'sing','sang':'sing','sung':'sing','singing':'sing',
    'steals':'steal','stole':'steal','stolen':'steal','stealing':'steal',
    'swims':'swim','swam':'swim','swum':'swim','swimming':'swim',
    'tears':'tear','tore':'tear','torn':'tear','tearing':'tear',
    'winds':'wind','wound':'wind','winding':'wind',
  };

  // ─── Irregular plural table ────────────────────────────────────────────────
  var IRREGULAR_NOUNS = {
    'people':'person','persons':'person','children':'child','men':'man',
    'women':'woman','teeth':'tooth','feet':'foot','mice':'mouse',
    'geese':'goose','oxen':'ox','data':'datum','media':'medium',
    'criteria':'criterion','phenomena':'phenomenon','analyses':'analysis',
    'bases':'basis','crises':'crisis','theses':'thesis','matrices':'matrix',
    'vertices':'vertex','indices':'index','strata':'stratum','alumni':'alumnus',
    'foci':'focus','nuclei':'nucleus','syllabi':'syllabus','fungi':'fungus',
    'cacti':'cactus','stimuli':'stimulus','radii':'radius','corpora':'corpus',
    'genera':'genus','bacteria':'bacterium',
  };

  // ─── Suffix-based stemming (fallback when vocab index not loaded) ──────────

  var SUFFIXES = [
    // Noun suffixes → verb stems
    { suffix: 'ation',  remove: 4,  add: 'e' },
    { suffix: 'ations', remove: 5,  add: 'e' },
    { suffix: 'ments',  remove: 5,  add: '' },
    { suffix: 'ment',   remove: 4,  add: '' },
    { suffix: 'ness',   remove: 4,  add: '' },
    { suffix: 'nesses', remove: 6,  add: '' },
    { suffix: 'ity',    remove: 3,  add: '' },
    { suffix: 'ities',  remove: 5,  add: '' },
    { suffix: 'ance',   remove: 4,  add: '' },
    { suffix: 'ence',   remove: 4,  add: '' },
    { suffix: 'er',     remove: 2,  add: '' },
    { suffix: 'ers',    remove: 3,  add: '' },
    { suffix: 'or',     remove: 2,  add: 'e' },
    { suffix: 'ors',    remove: 3,  add: 'e' },
    { suffix: 'ist',    remove: 3,  add: '' },
    { suffix: 'ists',   remove: 4,  add: '' },
    { suffix: 'ism',    remove: 3,  add: '' },
    { suffix: 'isms',   remove: 4,  add: '' },
    // Verb suffixes → base form
    { suffix: 'ing',    remove: 3,  add: '' },
    { suffix: 'ing',    remove: 4,  add: 'e' },  // running → runne (need extra logic)
    { suffix: 'ed',     remove: 2,  add: '' },
    { suffix: 'ed',     remove: 3,  add: 'e' },  // loved → love
    { suffix: 'ied',    remove: 3,  add: 'y' },  // tried → try
    { suffix: 'ies',    remove: 3,  add: 'y' },  // tries → try
    { suffix: 'es',     remove: 2,  add: '' },
    { suffix: 's',      remove: 1,  add: '' },
    // Adjective suffixes
    { suffix: 'able',   remove: 4,  add: '' },
    { suffix: 'ible',   remove: 4,  add: '' },
    { suffix: 'ful',    remove: 3,  add: '' },
    { suffix: 'less',   remove: 4,  add: '' },
    { suffix: 'ish',    remove: 3,  add: '' },
    { suffix: 'ous',    remove: 3,  add: '' },
    { suffix: 'ive',    remove: 3,  add: '' },
    { suffix: 'al',     remove: 2,  add: '' },
    { suffix: 'er',     remove: 2,  add: '' },  // faster → fast
    { suffix: 'est',    remove: 3,  add: '' },  // fastest → fast
    { suffix: 'ier',    remove: 3,  add: 'y' }, // happier → happy
    { suffix: 'iest',   remove: 4,  add: 'y' }, // happiest → happy
    // Adverb suffix
    { suffix: 'ly',     remove: 2,  add: '' },
    { suffix: 'ally',   remove: 4,  add: 'al' },
    { suffix: 'ically', remove: 6,  add: 'ic' },
    { suffix: 'ily',    remove: 3,  add: 'y' },
  ];

  /**
   * _stripSuffixSafe(word)
   * Tries common plural/conjugation endings in order from longest to shortest.
   * Returns the first candidate that differs from the input.
   * Used only when vocab index is present — caller then validates the result.
   */
  function _stripSuffixSafe(word) {
    var w = word.toLowerCase();
    if (IRREGULAR_VERBS[w]) return IRREGULAR_VERBS[w];
    if (IRREGULAR_NOUNS[w]) return IRREGULAR_NOUNS[w];

    // Ordered by length so longer suffixes match first
    var candidates = [
      // -ation / -ations → base + e
      w.endsWith('ations') && w.length > 7 ? w.slice(0,-5)+'e' : null,
      w.endsWith('ation')  && w.length > 6 ? w.slice(0,-4)+'e' : null,
      // -ings → base (or base+e)
      w.endsWith('ings')   && w.length > 5 ? w.slice(0,-4) : null,
      w.endsWith('ings')   && w.length > 5 ? w.slice(0,-4)+'e' : null,
      // -ing
      w.endsWith('ing')    && w.length > 4 ? w.slice(0,-3) : null,
      w.endsWith('ing')    && w.length > 4 ? w.slice(0,-3)+'e' : null,
      // -ied → y
      w.endsWith('ied')    && w.length > 4 ? w.slice(0,-3)+'y' : null,
      // -ies → y
      w.endsWith('ies')    && w.length > 4 ? w.slice(0,-3)+'y' : null,
      // -ed → base / base+e
      w.endsWith('ed')     && w.length > 3 ? w.slice(0,-2) : null,
      w.endsWith('ed')     && w.length > 3 ? w.slice(0,-1) : null,
      // -es → base (e.g. "fixes" → "fix", but only if base is real)
      w.endsWith('es')     && w.length > 3 ? w.slice(0,-2) : null,
      w.endsWith('es')     && w.length > 3 ? w.slice(0,-1) : null,
      // -s → base
      w.endsWith('s')      && w.length > 2 ? w.slice(0,-1) : null,
    ];

    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && candidates[i] !== w && candidates[i].length >= 2) {
        return candidates[i];
      }
    }
    return w;
  }

  /**
   * Simple suffix stripper for when vocab index is unavailable.
   * Returns candidate stem (may not be a real word — for heuristic use).
   */
  function _stripSuffix(word) {
    var w = word.toLowerCase();
    // Check irregular tables first
    if (IRREGULAR_VERBS[w]) return IRREGULAR_VERBS[w];
    if (IRREGULAR_NOUNS[w]) return IRREGULAR_NOUNS[w];

    for (var i = 0; i < SUFFIXES.length; i++) {
      var s = SUFFIXES[i];
      if (w.endsWith(s.suffix) && w.length - s.remove >= 3) {
        var stem = w.slice(0, w.length - s.remove) + s.add;
        if (stem.length >= 2) return stem;
      }
    }
    return w;
  }

  // ─── Public: getLemma ─────────────────────────────────────────────────────
  /**
   * getLemma(word)
   * Returns the lemma/root form of a word.
   * Uses vocab index when loaded; falls back to suffix stripping.
   * Synchronous — returns best available result immediately.
   */
  function getLemma(word) {
    if (!word) return '';
    var w = word.toLowerCase().trim();

    // Check irregular tables first
    if (IRREGULAR_VERBS[w]) return IRREGULAR_VERBS[w];
    if (IRREGULAR_NOUNS[w]) return IRREGULAR_NOUNS[w];

    // Check vocab index if loaded
    if (_vocabIndex) {
      if (_vocabIndex[w]) {
        return _vocabIndex[w].lemma || w;
      }
      // Word not directly in index — try stripping inflections and
      // check if the result IS in the index (prevents "websites → websit")
      var candidate = _stripSuffixSafe(w);
      if (candidate !== w && _vocabIndex[candidate]) {
        return _vocabIndex[candidate].lemma || candidate;
      }
    }

    // Fallback: suffix stripping (no vocab index available)
    return _stripSuffix(w);
  }

  // ─── Public: getPos ───────────────────────────────────────────────────────
  /**
   * getPos(word)
   * Returns part-of-speech: 'noun'|'verb'|'adj'|'adv'|'other'|'unknown'
   */
  function getPos(word) {
    if (!word) return 'unknown';
    var w = word.toLowerCase().trim();

    if (IRREGULAR_VERBS[w]) return 'verb';
    if (IRREGULAR_NOUNS[w]) return 'noun';

    if (_vocabIndex && _vocabIndex[w]) {
      return _vocabIndex[w].pos || 'unknown';
    }

    // Heuristic from suffix
    if (/tion$|ment$|ness$|ity$|ance$|ence$|ism$|ist$|age$|ship$|hood$|ure$/.test(w)) return 'noun';
    if (/ing$|ed$|ize$|ise$|ate$|ify$|en$/.test(w)) return 'verb';
    if (/able$|ible$|ful$|less$|ous$|ive$|al$|ic$|ish$/.test(w)) return 'adj';
    if (/ly$/.test(w)) return 'adv';

    return 'unknown';
  }

  // ─── Public: getForms ─────────────────────────────────────────────────────
  /**
   * getForms(lemma)
   * Returns all known forms of a lemma.
   * Requires vocab index to be loaded.
   */
  function getForms(lemma) {
    if (!lemma) return [];
    var l = lemma.toLowerCase().trim();

    if (_lemmaIndex && _lemmaIndex[l]) {
      return _lemmaIndex[l];
    }

    // Heuristic generation
    var forms = [l];
    if (/[^s]s$/.test(l)) return forms; // already plural
    // Generate simple forms
    forms.push(l + 's');
    if (/e$/.test(l)) {
      forms.push(l + 'd', l.slice(0,-1) + 'ing', l + 'r', l + 'st');
    } else {
      forms.push(l + 'ed', l + 'ing', l + 'er', l + 'est');
    }
    return [...new Set(forms)];
  }

  // ─── Public: areMorphologicallyRelated ───────────────────────────────────
  /**
   * areMorphologicallyRelated(wordA, wordB)
   * Returns true if both words share the same lemma.
   */
  function areMorphologicallyRelated(wordA, wordB) {
    var lemmaA = getLemma(wordA);
    var lemmaB = getLemma(wordB);
    return lemmaA === lemmaB && lemmaA !== '' && lemmaA !== wordA.toLowerCase();
  }

  // ─── Public: normalize ────────────────────────────────────────────────────
  /**
   * normalizeWord(word)
   * Returns lemma of the word for comparison purposes.
   */
  function normalizeWord(word) {
    return getLemma(word);
  }

  // ─── Public: lookupWord ──────────────────────────────────────────────────
  /**
   * lookupWord(word)
   * Returns full vocabulary entry or null.
   * { lemma, pos, rank } + forms array
   */
  function lookupWord(word) {
    if (!word || !_vocabIndex) return null;
    var w = word.toLowerCase().trim();
    var entry = _vocabIndex[w];
    if (!entry) return null;
    return {
      word:   w,
      lemma:  entry.lemma,
      pos:    entry.pos,
      rank:   entry.rank,
      forms:  getForms(entry.lemma),
      known:  true,
    };
  }

  // ─── Public: isKnownWord ──────────────────────────────────────────────────
  /**
   * isKnownWord(word)
   * Returns true if the word exists in the vocabulary index.
   */
  function isKnownWord(word) {
    if (!word || !_vocabIndex) return false;
    return !!_vocabIndex[word.toLowerCase().trim()];
  }

  // ─── Public: analyzeUnknownWord ──────────────────────────────────────────
  /**
   * analyzeUnknownWord(word)
   * For words not in the vocabulary, attempt to characterize them.
   * Returns { type, confidence, possibleLemma, possiblePos }
   *
   * Used for named entities (NightGlass, API-X, etc.)
   */
  function analyzeUnknownWord(word) {
    if (!word) return { type: 'unknown', confidence: 0 };

    var w = word.trim();

    // Check if it looks like a proper noun / named entity
    if (/^[A-Z][a-z]/.test(w) || /^[A-Z]{2,}$/.test(w)) {
      return {
        type: 'named_entity',
        confidence: 0.75,
        possibleLemma: w.toLowerCase(),
        possiblePos: 'noun',
        note: 'Capitalized — likely proper noun or named entity',
      };
    }

    // Mixed case (CamelCase) suggests a proper noun or brand
    if (/[a-z][A-Z]/.test(w)) {
      return {
        type: 'named_entity',
        confidence: 0.7,
        possibleLemma: w.toLowerCase(),
        possiblePos: 'noun',
        note: 'CamelCase — likely brand, project name, or compound',
      };
    }

    // Contains numbers — likely technical term, model number, version
    if (/\d/.test(w)) {
      return {
        type: 'technical_token',
        confidence: 0.6,
        possibleLemma: w.toLowerCase(),
        possiblePos: 'noun',
        note: 'Contains numbers — likely version, identifier, or technical term',
      };
    }

    // Hyphenated compound
    if (w.includes('-')) {
      return {
        type: 'compound_word',
        confidence: 0.65,
        possibleLemma: w.toLowerCase(),
        possiblePos: 'adj',
        note: 'Hyphenated compound word',
      };
    }

    // Pure lowercase — might be new slang, domain term, or spelling variation
    return {
      type: 'unknown_word',
      confidence: 0.3,
      possibleLemma: _stripSuffix(w.toLowerCase()),
      possiblePos: 'unknown',
      note: 'Not in vocabulary — possible slang, neologism, or spelling variant',
    };
  }

  // ─── Public: getVocabStats ────────────────────────────────────────────────
  function getVocabStats() {
    if (!_vocabIndex) return { loaded: false, totalEntries: 0, uniqueLemmas: 0 };
    return {
      loaded:       true,
      totalEntries: Object.keys(_vocabIndex).length,
      uniqueLemmas: _lemmaIndex ? Object.keys(_lemmaIndex).length : 0,
      loadStatus:   _loadStatus,
    };
  }

  // ─── Auto-load vocab at module init ──────────────────────────────────────
  // This is synchronous in Node (fs.readFileSync), non-blocking in browser (fetch).
  ensureLoaded(function (err) {
    if (err) {
      // Non-fatal — getLemma falls back to suffix stripping
    }
  });

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRMorphology = {
    build:                    BUILD_ID,
    ensureLoaded:             ensureLoaded,
    getLemma:                 getLemma,
    getPos:                   getPos,
    getForms:                 getForms,
    areMorphologicallyRelated: areMorphologicallyRelated,
    normalizeWord:            normalizeWord,
    lookupWord:               lookupWord,
    isKnownWord:              isKnownWord,
    analyzeUnknownWord:       analyzeUnknownWord,
    getVocabStats:            getVocabStats,
    IRREGULAR_VERBS:          IRREGULAR_VERBS,
    IRREGULAR_NOUNS:          IRREGULAR_NOUNS,
  };

})(typeof window !== 'undefined' ? window : global);
