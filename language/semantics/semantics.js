/**
 * shadow-reaper-v2/language/semantics/semantics.js
 * Shadow Reaper — Semantic Analysis Engine
 *
 * Build: SR-LANG-SEMANTICS-1
 *
 * Exposes: window.SRSemantics
 *
 * PURPOSE:
 *   Analyze text for semantic meaning:
 *   - Extract key concepts (content words)
 *   - Detect semantic similarity between texts
 *   - Detect intent from semantic content (not just regex)
 *   - Detect negation
 *   - Extract named entities
 *   - Analyze sentence-level properties
 *
 * CRITICAL RULE:
 *   Does NOT maintain a list of canned responses.
 *   Different sentences with similar meaning RESOLVE to related concepts.
 *   "Fix my website" and "My webpage isn't working" share concept overlap.
 *
 * DEPENDENCIES:
 *   SRTokenizer, SRMorphology, SRRelationships
 *   (graceful degradation if unavailable)
 *
 * Zero external calls. Pure local logic.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-LANG-SEMANTICS-1';

  // ─── Concept extraction ───────────────────────────────────────────────────
  /**
   * extractConcepts(text)
   * Returns array of key concept strings from text.
   * Uses tokenizer + morphology lemmatization + stop word removal.
   */
  function extractConcepts(text) {
    if (!text || typeof text !== 'string') return [];

    var tokenizer = global.SRTokenizer;
    var morphology = global.SRMorphology;

    if (tokenizer) {
      var result = tokenizer.tokenize(text);
      return result.tokens
        .filter(function (t) { return t.isWord && !t.isStop && t.normal.length >= 2; })
        .map(function (t) {
          // Lemmatize if morphology available
          return morphology ? morphology.getLemma(t.normal) : t.normal;
        })
        .filter(function (c) { return c && c.length >= 2; });
    }

    // Fallback: simple split and lowercase
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(function (w) { return w.length >= 2; });
  }

  // ─── Negation detection ───────────────────────────────────────────────────
  /**
   * detectNegation(text)
   * Returns { negated: boolean, confidence: number, negatedConcepts: string[] }
   */
  function detectNegation(text) {
    if (!text) return { negated: false, confidence: 0, negatedConcepts: [] };

    var lower = text.toLowerCase();

    // Check via relationship graph
    var rels = global.SRRelationships;
    if (rels) {
      var tokenizer = global.SRTokenizer;
      var words = tokenizer ? tokenizer.tokenize(lower).tokens.map(function(t){return t.normal;}) :
        lower.split(/\s+/);
      if (rels.detectNegation(words)) {
        return { negated: true, confidence: 0.85, negatedConcepts: words };
      }
    }

    // Fallback patterns
    var NEG_PATTERNS = [
      /\b(not|no|never|none|nobody|nothing|neither|nowhere|nor)\b/i,
      /\b(don't|doesn't|didn't|won't|wouldn't|can't|cannot|couldn't|shouldn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't)\b/i,
      /\bdo not\b|\bdoes not\b|\bdid not\b|\bwill not\b|\bwould not\b/i,
    ];

    for (var i = 0; i < NEG_PATTERNS.length; i++) {
      if (NEG_PATTERNS[i].test(lower)) {
        return { negated: true, confidence: 0.9, negatedConcepts: [] };
      }
    }

    return { negated: false, confidence: 0.9, negatedConcepts: [] };
  }

  // ─── Semantic similarity ──────────────────────────────────────────────────
  /**
   * compareMeaning(textA, textB)
   * Returns similarity score [0-1] between two texts.
   *
   * Algorithm:
   *   1. Extract concepts from each text
   *   2. Lemmatize concepts
   *   3. Use relationship graph to find concept overlap
   *   4. Boost by shared key terms
   *
   * This implements the core rule: different wording with similar meaning
   * should resolve to conceptual overlap WITHOUT requiring exact phrase matches.
   */
  function compareMeaning(textA, textB) {
    if (!textA || !textB) return 0;

    var conceptsA = extractConcepts(textA);
    var conceptsB = extractConcepts(textB);

    if (!conceptsA.length || !conceptsB.length) return 0;

    // Direct concept overlap
    var directOverlap = 0;
    var setA = new Set(conceptsA);
    var setB = new Set(conceptsB);
    var intersection = 0;
    setA.forEach(function (c) { if (setB.has(c)) intersection++; });
    directOverlap = intersection / Math.max(setA.size, setB.size);

    // Relationship-based overlap
    var relOverlap = 0;
    var rels = global.SRRelationships;
    if (rels) {
      relOverlap = rels.conceptsOverlap(conceptsA, conceptsB);
    }

    // Weighted combination: 60% direct + 40% relationship-based
    var score = (directOverlap * 0.6) + (relOverlap * 0.4);

    // Bonus: if any very-high-confidence synonym pair found
    if (rels) {
      for (var i = 0; i < conceptsA.length; i++) {
        var syns = rels.getSynonyms(conceptsA[i]);
        for (var j = 0; j < conceptsB.length; j++) {
          if (syns.indexOf(conceptsB[j]) !== -1) {
            score = Math.min(score + 0.1, 1.0);
          }
        }
      }
    }

    return Math.min(score, 1.0);
  }

  // ─── Intent detection ─────────────────────────────────────────────────────
  /**
   * detectIntent(text, context)
   * Returns { intent: string, confidence: number, signals: [] }
   *
   * Uses:
   *   - SRUnderstanding for primary intent (regex-based)
   *   - SRRelationships for concept-based intent signals
   *   - Concept analysis for fallback
   *
   * This supplements (not replaces) the existing SRUnderstanding engine.
   */
  function detectIntent(text, context) {
    context = context || {};
    if (!text) return { intent: 'UNKNOWN', confidence: 0, signals: [] };

    var signals = [];

    // Primary: delegate to SRUnderstanding if available
    var understood = null;
    if (global.SRUnderstanding) {
      understood = global.SRUnderstanding.understand(text);
      if (understood.intent && understood.intent !== 'UNKNOWN') {
        signals.push({ intent: understood.intent, confidence: 0.9, source: 'understanding_engine' });
      }
    }

    // Secondary: relationship-graph intent signals
    var concepts = extractConcepts(text);
    var rels = global.SRRelationships;
    if (rels) {
      var intentScores = {};
      concepts.forEach(function (concept) {
        var intentSigs = rels.getIntentSignals(concept);
        intentSigs.forEach(function (sig) {
          var key = sig.intent;
          if (!intentScores[key]) intentScores[key] = 0;
          intentScores[key] = Math.max(intentScores[key], sig.confidence);
        });
      });

      // Also check bigrams
      var lower = text.toLowerCase();
      var BIGRAM_PATTERNS = [
        'not working', 'fix my', 'help with', 'make it', 'change it',
        'update it', 'instead of', 'i meant', 'thank you', 'good morning',
        'good evening', 'good afternoon', 'good night', 'what is up',
        'whats up', 'see you', 'take care', 'i am', 'i do not', 'do not',
      ];
      BIGRAM_PATTERNS.forEach(function (bigram) {
        if (lower.indexOf(bigram) !== -1) {
          var bigramSigs = rels.getIntentSignals(bigram);
          bigramSigs.forEach(function (sig) {
            if (!intentScores[sig.intent]) intentScores[sig.intent] = 0;
            intentScores[sig.intent] = Math.max(intentScores[sig.intent], sig.confidence);
          });
        }
      });

      Object.entries(intentScores).forEach(function(entry) {
        signals.push({ intent: entry[0], confidence: entry[1], source: 'relationship_graph' });
      });
    }

    // Merge signals — highest confidence wins
    signals.sort(function (a, b) { return b.confidence - a.confidence; });

    var topSignal = signals[0];
    var intent = topSignal ? topSignal.intent : 'GENERAL_CONVERSATION';
    var confidence = topSignal ? topSignal.confidence : 0.5;

    // Prefer understanding engine result for known intents
    if (understood && understood.intent !== 'UNKNOWN') {
      intent = understood.intent;
      confidence = 0.9;
    }

    return {
      intent:     intent,
      confidence: confidence,
      signals:    signals,
      concepts:   concepts,
      entities:   understood ? understood.entities : {},
      tone:       understood ? understood.tone : 'neutral',
    };
  }

  // ─── Named entity recognition ─────────────────────────────────────────────
  /**
   * extractEntities(text)
   * Identifies named entities and assigns types.
   * Returns { projectName?, personName?, location?, organization?, unknown: [] }
   */
  function extractEntities(text) {
    if (!text) return { unknown: [] };

    var entities = { unknown: [] };

    // Delegate to SRUnderstanding for existing entity extraction
    if (global.SRUnderstanding) {
      var understood = global.SRUnderstanding.understand(text);
      if (understood.entities) {
        Object.assign(entities, understood.entities);
      }
    }

    // Find unknown words that look like named entities
    var morphology = global.SRMorphology;
    var tokenizer  = global.SRTokenizer;
    if (tokenizer && morphology) {
      var result = tokenizer.tokenize(text);
      result.tokens.forEach(function (t) {
        if (!t.isWord) return;
        // Look for capitalized words not at sentence start
        if (t.position > 0 && /^[A-Z]/.test(t.raw)) {
          var analysis = morphology.analyzeUnknownWord(t.raw);
          if (analysis.type === 'named_entity' && analysis.confidence >= 0.7) {
            if (!entities.namedEntities) entities.namedEntities = [];
            entities.namedEntities.push({
              text:       t.raw,
              type:       'unknown_named_entity',
              confidence: analysis.confidence,
              note:       analysis.note,
            });
          }
        }
      });
    }

    return entities;
  }

  // ─── Sentence analysis ────────────────────────────────────────────────────
  /**
   * analyzeSentence(text, context)
   *
   * Returns comprehensive sentence-level analysis:
   * {
   *   tokens, concepts, entities, intent, confidence,
   *   sentenceType, negation, isFollowUp, isCorrection,
   *   pronounReferences, topic, raw
   * }
   */
  function analyzeSentence(text, context) {
    context = context || {};
    if (!text) return null;

    var tokenResult  = global.SRTokenizer ? global.SRTokenizer.tokenize(text) : null;
    var intentResult = detectIntent(text, context);
    var negResult    = detectNegation(text);
    var entities     = extractEntities(text);
    var concepts     = extractConcepts(text);

    // Sentence type
    var sentenceType = 'statement';
    if (tokenResult && tokenResult.hasQuestion) sentenceType = 'question';
    else if (text.trim().endsWith('!')) sentenceType = 'exclamation';
    else if (/^(do|does|is|are|can|could|would|will|shall|have|has|did)\b/i.test(text.trim()))
      sentenceType = 'question';
    else if (/^(please|do|make|let|stop|start|help|tell|show|give)\b/i.test(text.trim()))
      sentenceType = 'command';

    // Pronoun references
    var pronounRefs = [];
    if (tokenResult) {
      tokenResult.tokens.forEach(function (t) {
        if (/^(it|that|this|they|them|those|these)$/i.test(t.raw)) {
          pronounRefs.push({ pronoun: t.raw.toLowerCase(), position: t.position });
        }
      });
    }

    // Is follow-up check
    var isFollowUp = pronounRefs.length > 0 ||
      /^(make|add|remove|change|update|fix|adjust|set)\s+(it|that|this|them)\b/i.test(text) ||
      /^(more|less|bigger|smaller|darker|lighter|faster|slower)\b/i.test(text);

    return {
      raw:            text,
      tokens:         tokenResult ? tokenResult.tokens : [],
      normalized:     tokenResult ? tokenResult.normalized : text.toLowerCase(),
      wordCount:      tokenResult ? tokenResult.wordCount : 0,
      concepts:       concepts,
      entities:       entities,
      intent:         intentResult.intent,
      intentConf:     intentResult.confidence,
      signals:        intentResult.signals,
      tone:           intentResult.tone,
      sentenceType:   sentenceType,
      negation:       negResult,
      isFollowUp:     isFollowUp,
      isCorrection:   intentResult.intent === 'USER_CORRECTION',
      pronounRefs:    pronounRefs,
      topic:          entities.topic || null,
      hasQuestion:    tokenResult ? tokenResult.hasQuestion : /\?/.test(text),
    };
  }

  // ─── Typo/variant tolerance ────────────────────────────────────────────────
  /**
   * fuzzyMatchWord(word, candidates, threshold)
   * Returns the closest candidate word within edit distance `threshold`.
   * Used for typo tolerance.
   * Returns { match: string|null, distance: number }
   */
  function fuzzyMatchWord(word, candidates, threshold) {
    if (!word || !candidates || !candidates.length) return { match: null, distance: Infinity };
    var w = word.toLowerCase();
    var best = null;
    var bestDist = Infinity;
    threshold = threshold !== undefined ? threshold : 2;

    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i].toLowerCase();
      var d = _editDistance(w, c);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }

    if (bestDist <= threshold) {
      return { match: best, distance: bestDist, confidence: 1 - (bestDist / Math.max(w.length, 1)) };
    }
    return { match: null, distance: bestDist };
  }

  // Levenshtein edit distance
  function _editDistance(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    var m = a.length, n = b.length;
    // Only need two rows
    var prev = Array.from({ length: n + 1 }, function (_, i) { return i; });
    var curr = new Array(n + 1);
    for (var i = 1; i <= m; i++) {
      curr[0] = i;
      for (var j = 1; j <= n; j++) {
        if (a[i-1] === b[j-1]) {
          curr[j] = prev[j-1];
        } else {
          curr[j] = 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
        }
      }
      var tmp = prev; prev = curr; curr = tmp;
    }
    return prev[n];
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRSemantics = {
    build:            BUILD_ID,
    extractConcepts:  extractConcepts,
    detectNegation:   detectNegation,
    compareMeaning:   compareMeaning,
    detectIntent:     detectIntent,
    extractEntities:  extractEntities,
    analyzeSentence:  analyzeSentence,
    fuzzyMatchWord:   fuzzyMatchWord,
  };

})(typeof window !== 'undefined' ? window : global);
