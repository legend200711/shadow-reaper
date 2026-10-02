/**
 * shadow-reaper-v2/language/sr-language.js
 * Shadow Reaper — Language Foundation API
 *
 * Build: SR-LANG-FOUNDATION-1
 *
 * Exposes: window.SRLanguage
 *
 * PURPOSE:
 *   Central API for all language understanding capabilities.
 *   Provides a clean interface that the response engine uses.
 *   Coordinates all language subsystems.
 *
 * ARCHITECTURE:
 *   USER MESSAGE
 *   ↓
 *   SRLanguage.analyze(text, context)
 *   ↓ (internally uses:)
 *   SRTokenizer      → tokenize + normalize
 *   SRMorphology     → lemmatize + POS tag
 *   SRPhrases        → phrase pattern detection
 *   SRRelationships  → concept relationship lookup
 *   SRSemantics      → intent + entity + negation analysis
 *   SRContextResolver→ pronoun + reference resolution
 *   SRLanguageLearning → check user vocabulary, detect teaching
 *   ↓
 *   LanguageAnalysis { tokens, concepts, intent, entities, negation,
 *                      resolvedRefs, similarity, confidence, ... }
 *   ↓
 *   Shadow Reaper reasoning/response
 *
 * CRITICAL RULE:
 *   This system UNDERSTANDS language compositionally.
 *   It does NOT maintain millions of canned if-then phrase responses.
 *   "Help me with my website" and "My webpage isn't working" and
 *   "Something is wrong with the site" all produce overlapping
 *   semantic analysis — different wording, similar conceptual meaning.
 *
 * DEPENDENCY ORDER:
 *   Load this AFTER all subsystem modules.
 *   This is the facade that shadow-reaper.js calls.
 *
 * Zero external calls. Zero hosted AI. Pure local logic.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-LANG-FOUNDATION-1';

  // ─── Dependency accessors ─────────────────────────────────────────────────
  function _tok() { return global.SRTokenizer; }
  function _mor() { return global.SRMorphology; }
  function _rel() { return global.SRRelationships; }
  function _sem() { return global.SRSemantics; }
  function _ctx() { return global.SRContextResolver; }
  function _lng() { return global.SRLanguageLearning; }
  function _phr() { return global.SRPhrases; }
  function _und() { return global.SRUnderstanding; }  // existing engine (preserved)

  // ─── Public: analyze ─────────────────────────────────────────────────────
  /**
   * analyze(text, context)
   *
   * Full language analysis pipeline.
   * Returns LanguageAnalysis object.
   *
   * context: optional SRContext snapshot from previous turns
   */
  function analyze(text, context) {
    context = context || {};
    if (!text || typeof text !== 'string') {
      return _emptyAnalysis(text);
    }

    var raw = text.trim();

    // ── Step 1: Expand user abbreviations if known ──────────────────────────
    var expanded = raw;
    if (_lng()) {
      var abbrevResult = _lng().resolveAbbreviations(raw);
      expanded = abbrevResult.expanded;
    }

    // ── Step 2: Tokenize ────────────────────────────────────────────────────
    var tokenResult = null;
    if (_tok()) {
      tokenResult = _tok().tokenize(expanded);
    }

    // ── Step 3: Morphological lemmatization ─────────────────────────────────
    var lemmatizedConcepts = [];
    if (tokenResult && _mor()) {
      lemmatizedConcepts = tokenResult.tokens
        .filter(function (t) { return t.isWord && !t.isStop && t.normal.length >= 2; })
        .map(function (t) { return _mor().getLemma(t.normal); })
        .filter(function (c) { return c && c.length >= 2; });
    }

    // ── Step 4: Phrase pattern detection ────────────────────────────────────
    var phraseMatches = [];
    var phraseIntent  = null;
    if (_phr()) {
      phraseMatches = _phr().lookupPhrases(expanded);
      phraseIntent  = _phr().getIntentFromPhrases(expanded);
    }

    // ── Step 5: Full semantic analysis ──────────────────────────────────────
    var semanticResult = null;
    if (_sem()) {
      semanticResult = _sem().analyzeSentence(expanded, context);
    }

    // ── Step 6: Unknown word analysis ───────────────────────────────────────
    var unknownWords = [];
    if (tokenResult && _mor()) {
      tokenResult.tokens.forEach(function (t) {
        if (t.isWord && !t.isStop) {
          if (!_mor().isKnownWord(t.normal)) {
            var analysis = _mor().analyzeUnknownWord(t.raw);
            unknownWords.push({
              word:     t.raw,
              normal:   t.normal,
              analysis: analysis,
            });
          }
        }
      });
    }

    // ── Step 7: Reference resolution ────────────────────────────────────────
    var referenceResolution = null;
    if (_ctx() && semanticResult) {
      referenceResolution = _ctx().resolveReference(raw, semanticResult);
    } else if (_und()) {
      // Fallback: use existing context engine pronoun resolution
      var existingCtx = global.SRContext;
      if (existingCtx) {
        var resolved = existingCtx.resolvePronouns(raw);
        if (resolved) {
          referenceResolution = { resolved: true, subject: resolved, confidence: 0.7 };
        }
      }
    }

    // ── Step 8: Detect language teaching patterns ───────────────────────────
    var teachingPattern = null;
    if (_lng()) {
      teachingPattern = _lng().detectTeachingPattern(raw);
    }

    // ── Step 9: Negation detection ──────────────────────────────────────────
    var negation = semanticResult ? semanticResult.negation :
      (_sem() ? _sem().detectNegation(raw) : { negated: false, confidence: 0.5 });

    // ── Step 10: Intent determination ───────────────────────────────────────
    // Priority: semantic > phrase > fallback
    var intent     = 'GENERAL_CONVERSATION';
    var intentConf = 0.5;

    if (semanticResult && semanticResult.intent && semanticResult.intent !== 'UNKNOWN') {
      intent     = semanticResult.intent;
      intentConf = semanticResult.intentConf || 0.85;
    } else if (phraseIntent) {
      intent     = phraseIntent.intent;
      intentConf = phraseIntent.confidence;
    }

    // ── Step 11: Entities ───────────────────────────────────────────────────
    var entities = {};
    if (semanticResult) entities = semanticResult.entities || {};
    if (_und()) {
      var undResult = _und().understand(raw);
      entities = Object.assign({}, entities, undResult.entities || {});
    }

    // ── Assemble final result ────────────────────────────────────────────────
    return {
      // Input
      raw:              raw,
      expanded:         expanded,

      // Tokens
      tokens:           tokenResult ? tokenResult.tokens : [],
      normalized:       tokenResult ? tokenResult.normalized : raw.toLowerCase(),
      wordCount:        tokenResult ? tokenResult.wordCount : 0,

      // Concepts
      concepts:         lemmatizedConcepts.length > 0
        ? lemmatizedConcepts
        : (semanticResult ? semanticResult.concepts : []),

      // Intent
      intent:           intent,
      intentConf:       intentConf,
      intentSignals:    semanticResult ? semanticResult.signals : [],

      // Entities
      entities:         entities,
      unknownWords:     unknownWords,

      // Tone (from existing understanding engine)
      tone:             semanticResult ? semanticResult.tone : 'neutral',

      // Sentence structure
      sentenceType:     semanticResult ? semanticResult.sentenceType : 'statement',
      negation:         negation,
      isFollowUp:       semanticResult ? semanticResult.isFollowUp : false,
      isCorrection:     intent === 'USER_CORRECTION',
      hasQuestion:      tokenResult ? tokenResult.hasQuestion : /\?/.test(raw),

      // Context
      referenceResolution: referenceResolution,
      pronounRefs:      semanticResult ? semanticResult.pronounRefs : [],

      // Phrases
      phraseMatches:    phraseMatches,
      topics:           _phr() ? _phr().extractTopics(raw) : [],

      // Language learning
      teachingPattern:  teachingPattern,

      // Meta
      confidence:       intentConf,
      subsystems:       {
        tokenizer:     !!_tok(),
        morphology:    !!_mor(),
        relationships: !!_rel(),
        semantics:     !!_sem(),
        context:       !!_ctx(),
        learning:      !!_lng(),
        phrases:       !!_phr(),
        understanding: !!_und(),
      },
    };
  }

  // ─── Empty analysis (for null/empty input) ────────────────────────────────
  function _emptyAnalysis(text) {
    return {
      raw: text || '', expanded: text || '', tokens: [], normalized: '',
      wordCount: 0, concepts: [], intent: 'UNKNOWN', intentConf: 0,
      intentSignals: [], entities: {}, unknownWords: [], tone: 'neutral',
      sentenceType: 'statement', negation: { negated: false, confidence: 0 },
      isFollowUp: false, isCorrection: false, hasQuestion: false,
      referenceResolution: null, pronounRefs: [], phraseMatches: [], topics: [],
      teachingPattern: null, confidence: 0, subsystems: {},
    };
  }

  // ─── Public: tokenize ────────────────────────────────────────────────────
  function tokenize(text) {
    return _tok() ? _tok().tokenize(text) : { tokens: [], normalized: text, wordCount: 0 };
  }

  // ─── Public: normalize ───────────────────────────────────────────────────
  function normalize(text) {
    return _tok() ? _tok().normalize(text) : (text || '').toLowerCase();
  }

  // ─── Public: lookupWord ──────────────────────────────────────────────────
  function lookupWord(word) {
    return _mor() ? _mor().lookupWord(word) : null;
  }

  // ─── Public: getLemma ────────────────────────────────────────────────────
  function getLemma(word) {
    return _mor() ? _mor().getLemma(word) : word;
  }

  // ─── Public: getRelationships ────────────────────────────────────────────
  function getRelationships(concept, options) {
    return _rel() ? _rel().getRelationships(concept, options) : [];
  }

  // ─── Public: analyzePhrase ───────────────────────────────────────────────
  function analyzePhrase(text) {
    var phrases  = _phr() ? _phr().lookupPhrases(text) : [];
    var concepts = _sem() ? _sem().extractConcepts(text) : [];
    return { phrases, concepts };
  }

  // ─── Public: compareMeaning ──────────────────────────────────────────────
  function compareMeaning(textA, textB) {
    return _sem() ? _sem().compareMeaning(textA, textB) : 0;
  }

  // ─── Public: detectIntent ────────────────────────────────────────────────
  function detectIntent(text, context) {
    return _sem() ? _sem().detectIntent(text, context) : { intent: 'UNKNOWN', confidence: 0 };
  }

  // ─── Public: resolveReferences ───────────────────────────────────────────
  function resolveReferences(text, context) {
    return _ctx() ? _ctx().resolveReference(text, null) : { resolved: false };
  }

  // ─── Public: learnCandidate ──────────────────────────────────────────────
  function learnCandidate(data) {
    return _lng() ? _lng().learnCandidate(data) : { ok: false, reason: 'learning_not_loaded' };
  }

  // ─── Public: getLanguageStatus ───────────────────────────────────────────
  function getLanguageStatus() {
    var vocabStats = _mor() ? _mor().getVocabStats() : { loaded: false };
    var graphStats = _rel() ? _rel().getGraphStats() : {};
    var phraseStats = _phr() ? _phr().getStats() : {};

    return {
      build:           BUILD_ID,
      subsystems: {
        tokenizer:     { loaded: !!_tok(), build: _tok() ? _tok().build : null },
        morphology:    { loaded: !!_mor(), build: _mor() ? _mor().build : null, vocab: vocabStats },
        relationships: { loaded: !!_rel(), build: _rel() ? _rel().build : null, graph: graphStats },
        semantics:     { loaded: !!_sem(), build: _sem() ? _sem().build : null },
        context:       { loaded: !!_ctx(), build: _ctx() ? _ctx().build : null },
        learning:      { loaded: !!_lng(), build: _lng() ? _lng().build : null },
        phrases:       { loaded: !!_phr(), build: _phr() ? _phr().build : null, phrases: phraseStats },
        understanding: { loaded: !!_und() },
      },
      vocabulary: {
        indexLoaded: vocabStats.loaded,
        totalEntries: vocabStats.totalEntries || 0,
        uniqueLemmas: vocabStats.uniqueLemmas || 0,
        target: 111600,
        targetMet: (vocabStats.totalEntries || 0) >= 111600,
      },
      relationships: {
        staticEdges:  graphStats.staticEdges  || 0,
        learnedEdges: graphStats.learnedEdges || 0,
        totalEdges:   graphStats.totalEdges   || 0,
      },
      phrases: {
        total: phraseStats.totalPhrases || 0,
        indexedWords: phraseStats.indexedWords || 0,
      },
    };
  }

  // ─── Public: initializeContextTurn ───────────────────────────────────────
  /**
   * Called after each turn to update context resolver.
   * text = user message, analysis = result from analyze()
   */
  function initializeContextTurn(role, text, analysis) {
    if (_ctx()) {
      _ctx().addTurn(role, text, analysis);
    }

    // Also process for language learning
    if (role === 'user' && _lng()) {
      _lng().processTurn(text, analysis);
    }
  }

  // ─── Public: resetContext ─────────────────────────────────────────────────
  function resetContext() {
    if (_ctx()) _ctx().reset();
    if (_lng()) _lng().clearSession();
  }

  // ─── Report load to SROfflineState ───────────────────────────────────────
  // SRLanguage is a pure local module — it is ALWAYS available offline.
  // Notify SROfflineState so it correctly marks LOCAL_READY once this is set.
  (function () {
    var offState = global.SROfflineState;
    if (offState && typeof offState.setLanguageFoundationLoaded === 'function') {
      try { offState.setLanguageFoundationLoaded(true); } catch (_) {}
    }
  })();

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRLanguage = {
    build:                  BUILD_ID,

    // Main analysis
    analyze:                analyze,

    // Individual subsystem APIs
    tokenize:               tokenize,
    normalize:              normalize,
    lookupWord:             lookupWord,
    getLemma:               getLemma,
    getRelationships:       getRelationships,
    analyzePhrase:          analyzePhrase,
    compareMeaning:         compareMeaning,
    detectIntent:           detectIntent,
    resolveReferences:      resolveReferences,
    learnCandidate:         learnCandidate,

    // Lifecycle
    initializeContextTurn:  initializeContextTurn,
    resetContext:           resetContext,

    // Status
    getLanguageStatus:      getLanguageStatus,
  };

})(typeof window !== 'undefined' ? window : global);
