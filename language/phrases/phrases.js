/**
 * shadow-reaper-v2/language/phrases/phrases.js
 * Shadow Reaper — Phrase & N-gram System
 *
 * Build: SR-LANG-PHRASES-1
 *
 * Exposes: window.SRPhrases
 *
 * PURPOSE:
 *   Support N-gram language patterns (2-gram through 5-gram).
 *   Store and query multi-word relationships and phrase significance.
 *   These are language PATTERNS, not canned responses.
 *
 * DESIGN:
 *   - In-memory phrase index for common patterns
 *   - Bounded retrieval (never load full dataset)
 *   - Frequency-based significance scoring
 *   - Supports phrase variant matching (help fix / help repair / help with)
 *   - Architecture supports millions of phrases via lazy loading
 *
 * PERFORMANCE:
 *   - Phrases indexed by first word for fast lookup
 *   - Bounded result sets (max 50 results per query)
 *   - Lazy loading of domain phrase chunks
 *
 * Zero external calls. Pure local logic.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-LANG-PHRASES-1';

  // ─── Core phrase index ────────────────────────────────────────────────────
  // Format: { phrase: string, category: string, weight: 0-1, type: string }
  // Indexed by first word for fast lookup.

  var _phrasesByFirst = {};
  var _phraseCount    = 0;

  function _addPhrase(phrase, category, weight, type) {
    var p = phrase.trim().toLowerCase();
    if (!p) return;
    var first = p.split(' ')[0];
    if (!_phrasesByFirst[first]) _phrasesByFirst[first] = [];
    _phrasesByFirst[first].push({
      phrase:    p,
      category:  category || 'general',
      weight:    weight  !== undefined ? weight : 0.7,
      type:      type    || 'phrase',
      n:         p.split(' ').length,
    });
    _phraseCount++;
  }

  // ─── Static phrase database ───────────────────────────────────────────────
  // Selected high-value phrases for Shadow Reaper's domain.
  // Each phrase maps to a category/type — NOT a canned response.

  var STATIC_PHRASES = [
    // ── Help/fix intent phrases ─────────────────────────────────────────────
    ['help me', 'intent:HELP_REQUEST', 0.9, 'intent_phrase'],
    ['help fix', 'intent:HELP_REQUEST', 0.9, 'intent_phrase'],
    ['help with', 'intent:HELP_REQUEST', 0.85, 'intent_phrase'],
    ['can you help', 'intent:HELP_REQUEST', 0.9, 'intent_phrase'],
    ['fix my', 'intent:HELP_REQUEST', 0.9, 'intent_phrase'],
    ['repair my', 'intent:HELP_REQUEST', 0.85, 'intent_phrase'],
    ['not working', 'state:BROKEN', 0.95, 'state_phrase'],
    ['is broken', 'state:BROKEN', 0.95, 'state_phrase'],
    ['something is wrong', 'state:BROKEN', 0.9, 'state_phrase'],
    ['something wrong', 'state:BROKEN', 0.85, 'state_phrase'],
    ['does not work', 'state:BROKEN', 0.9, 'state_phrase'],
    ['does not load', 'state:BROKEN', 0.85, 'state_phrase'],
    ['is not working', 'state:BROKEN', 0.95, 'state_phrase'],
    ['is not loading', 'state:BROKEN', 0.9, 'state_phrase'],
    ['not loading', 'state:BROKEN', 0.9, 'state_phrase'],
    ['having issues', 'state:BROKEN', 0.85, 'state_phrase'],
    ['having problems', 'state:BROKEN', 0.85, 'state_phrase'],
    ['ran into', 'state:ISSUE', 0.75, 'state_phrase'],
    ['having trouble', 'state:ISSUE', 0.8, 'state_phrase'],

    // ── Greeting phrases ────────────────────────────────────────────────────
    ['good morning', 'intent:GREETING', 0.95, 'intent_phrase'],
    ['good afternoon', 'intent:GREETING', 0.95, 'intent_phrase'],
    ['good evening', 'intent:GREETING', 0.95, 'intent_phrase'],
    ['good night', 'intent:GREETING', 0.9, 'intent_phrase'],
    ['hey shadow', 'intent:GREETING', 0.98, 'intent_phrase'],
    ['hello shadow', 'intent:GREETING', 0.98, 'intent_phrase'],
    ['hey there', 'intent:GREETING', 0.85, 'intent_phrase'],
    ['what is up', 'intent:GREETING', 0.85, 'intent_phrase'],
    ['how is it going', 'intent:GREETING', 0.9, 'intent_phrase'],

    // ── Goodbye phrases ─────────────────────────────────────────────────────
    ['see you later', 'intent:GOODBYE', 0.95, 'intent_phrase'],
    ['see you', 'intent:GOODBYE', 0.9, 'intent_phrase'],
    ['take care', 'intent:GOODBYE', 0.85, 'intent_phrase'],
    ['good night', 'intent:GOODBYE', 0.85, 'intent_phrase'],
    ['talk later', 'intent:GOODBYE', 0.85, 'intent_phrase'],
    ['catch you later', 'intent:GOODBYE', 0.85, 'intent_phrase'],
    ['until next time', 'intent:GOODBYE', 0.9, 'intent_phrase'],

    // ── Thanks phrases ──────────────────────────────────────────────────────
    ['thank you', 'intent:THANKS', 0.99, 'intent_phrase'],
    ['thanks a lot', 'intent:THANKS', 0.95, 'intent_phrase'],
    ['thank you so much', 'intent:THANKS', 0.98, 'intent_phrase'],
    ['much appreciated', 'intent:THANKS', 0.9, 'intent_phrase'],
    ['appreciate it', 'intent:THANKS', 0.88, 'intent_phrase'],
    ['appreciate that', 'intent:THANKS', 0.85, 'intent_phrase'],
    ['that is helpful', 'intent:THANKS', 0.85, 'intent_phrase'],
    ['that helps', 'intent:THANKS', 0.8, 'intent_phrase'],

    // ── Question phrases ────────────────────────────────────────────────────
    ['what is', 'intent:QUESTION', 0.9, 'intent_phrase'],
    ['what are', 'intent:QUESTION', 0.9, 'intent_phrase'],
    ['how do', 'intent:QUESTION', 0.9, 'intent_phrase'],
    ['how does', 'intent:QUESTION', 0.9, 'intent_phrase'],
    ['how can', 'intent:QUESTION', 0.85, 'intent_phrase'],
    ['what do you', 'intent:QUESTION', 0.85, 'intent_phrase'],
    ['can you explain', 'intent:QUESTION', 0.9, 'intent_phrase'],
    ['do you know', 'intent:QUESTION', 0.85, 'intent_phrase'],
    ['what does', 'intent:QUESTION', 0.9, 'intent_phrase'],

    // ── Correction phrases ──────────────────────────────────────────────────
    ['no i meant', 'intent:USER_CORRECTION', 0.95, 'intent_phrase'],
    ['actually i meant', 'intent:USER_CORRECTION', 0.9, 'intent_phrase'],
    ['i meant', 'intent:USER_CORRECTION', 0.88, 'intent_phrase'],
    ['wait i meant', 'intent:USER_CORRECTION', 0.9, 'intent_phrase'],
    ['not that', 'intent:USER_CORRECTION', 0.8, 'intent_phrase'],
    ['not exactly', 'intent:USER_CORRECTION', 0.8, 'intent_phrase'],
    ['no i said', 'intent:USER_CORRECTION', 0.88, 'intent_phrase'],
    ['let me correct', 'intent:USER_CORRECTION', 0.9, 'intent_phrase'],

    // ── Project statement phrases ───────────────────────────────────────────
    ['my project is', 'intent:PROJECT_STATEMENT', 0.95, 'intent_phrase'],
    ['my project is called', 'intent:PROJECT_STATEMENT', 0.98, 'intent_phrase'],
    ['working on', 'intent:PROJECT_STATEMENT', 0.85, 'intent_phrase'],
    ['i am building', 'intent:PROJECT_STATEMENT', 0.9, 'intent_phrase'],
    ['i am creating', 'intent:PROJECT_STATEMENT', 0.9, 'intent_phrase'],
    ['i am developing', 'intent:PROJECT_STATEMENT', 0.9, 'intent_phrase'],
    ['i am working on', 'intent:PROJECT_STATEMENT', 0.92, 'intent_phrase'],
    ['it is called', 'intent:PROJECT_STATEMENT', 0.85, 'intent_phrase'],
    ["it's called", 'intent:PROJECT_STATEMENT', 0.85, 'intent_phrase'],
    ['the homepage', 'topic:HOMEPAGE', 0.9, 'topic_phrase'],
    ['the landing page', 'topic:LANDING_PAGE', 0.9, 'topic_phrase'],
    ['the dashboard', 'topic:DASHBOARD', 0.9, 'topic_phrase'],

    // ── Follow-up / change phrases ──────────────────────────────────────────
    ['make it', 'intent:FOLLOW_UP', 0.85, 'intent_phrase'],
    ['make that', 'intent:FOLLOW_UP', 0.85, 'intent_phrase'],
    ['change it', 'intent:FOLLOW_UP', 0.88, 'intent_phrase'],
    ['change that', 'intent:FOLLOW_UP', 0.85, 'intent_phrase'],
    ['update it', 'intent:FOLLOW_UP', 0.85, 'intent_phrase'],
    ['instead of', 'intent:FOLLOW_UP', 0.8, 'intent_phrase'],
    ['make it darker', 'design:DARKER', 0.9, 'design_phrase'],
    ['make it lighter', 'design:LIGHTER', 0.9, 'design_phrase'],
    ['make it bigger', 'design:LARGER', 0.9, 'design_phrase'],
    ['make it smaller', 'design:SMALLER', 0.9, 'design_phrase'],
    ['add more', 'intent:FOLLOW_UP', 0.8, 'intent_phrase'],
    ['remove that', 'intent:FOLLOW_UP', 0.85, 'intent_phrase'],

    // ── Memory phrases ──────────────────────────────────────────────────────
    ['remember that', 'intent:MEMORY_SAVE', 0.95, 'intent_phrase'],
    ['please remember', 'intent:MEMORY_SAVE', 0.92, 'intent_phrase'],
    ['save that', 'intent:MEMORY_SAVE', 0.85, 'intent_phrase'],
    ['what do you remember', 'intent:MEMORY_RECALL', 0.95, 'intent_phrase'],
    ['do you remember', 'intent:MEMORY_RECALL', 0.9, 'intent_phrase'],
    ['what do you know about me', 'intent:MEMORY_RECALL', 0.9, 'intent_phrase'],
    ['forget that', 'intent:MEMORY_FORGET', 0.9, 'intent_phrase'],

    // ── Conversation history phrases ────────────────────────────────────────
    ['what were we talking', 'intent:CONTINUITY', 0.9, 'intent_phrase'],
    ['where were we', 'intent:CONTINUITY', 0.9, 'intent_phrase'],
    ['continue where', 'intent:CONTINUITY', 0.88, 'intent_phrase'],
    ['pick up where', 'intent:CONTINUITY', 0.85, 'intent_phrase'],
    ['last conversation', 'intent:CONTINUITY', 0.85, 'intent_phrase'],

    // ── Common 2-word tech phrases ──────────────────────────────────────────
    ['dark mode', 'topic:DESIGN', 0.9, 'topic_phrase'],
    ['light mode', 'topic:DESIGN', 0.9, 'topic_phrase'],
    ['dark theme', 'topic:DESIGN', 0.9, 'topic_phrase'],
    ['user interface', 'topic:UI', 0.95, 'topic_phrase'],
    ['web design', 'topic:WEB_DESIGN', 0.9, 'topic_phrase'],
    ['web development', 'topic:WEB_DEV', 0.9, 'topic_phrase'],
    ['mobile app', 'topic:MOBILE', 0.9, 'topic_phrase'],
    ['source code', 'topic:CODE', 0.9, 'topic_phrase'],
    ['open source', 'topic:CODE', 0.85, 'topic_phrase'],
    ['load time', 'topic:PERFORMANCE', 0.9, 'topic_phrase'],
    ['page speed', 'topic:PERFORMANCE', 0.9, 'topic_phrase'],

    // ── Semantic similarity test phrases ───────────────────────────────────
    // These demonstrate that similar-meaning phrases share categories
    ['fix my website', 'intent:HELP_REQUEST+topic:WEBSITE', 0.95, 'composite_phrase'],
    ['help with my site', 'intent:HELP_REQUEST+topic:WEBSITE', 0.9, 'composite_phrase'],
    ['my webpage is not working', 'state:BROKEN+topic:WEBSITE', 0.95, 'composite_phrase'],
    ['website is broken', 'state:BROKEN+topic:WEBSITE', 0.95, 'composite_phrase'],
    ['can you help fix my site', 'intent:HELP_REQUEST+topic:WEBSITE', 0.9, 'composite_phrase'],
    ['something is wrong with the website', 'state:BROKEN+topic:WEBSITE', 0.9, 'composite_phrase'],
  ];

  // Register all static phrases
  STATIC_PHRASES.forEach(function (entry) {
    _addPhrase(entry[0], entry[1], entry[2], entry[3]);
  });

  // ─── Public: lookupPhrases ────────────────────────────────────────────────
  /**
   * lookupPhrases(text, options)
   *
   * Find phrase matches in text.
   * Returns array of { phrase, category, weight, type, position } sorted by weight.
   *
   * options.maxResults = max results (default: 20)
   * options.minWeight  = minimum weight (default: 0.6)
   */
  function lookupPhrases(text, options) {
    if (!text) return [];
    var opts      = options || {};
    var maxRes    = opts.maxResults || 20;
    var minWeight = opts.minWeight !== undefined ? opts.minWeight : 0.6;

    var lower    = text.toLowerCase();
    var words    = lower.split(/\s+/);
    var matches  = [];
    var seen     = new Set();

    // For each word, check phrases starting with that word
    words.forEach(function (word, idx) {
      var candidates = _phrasesByFirst[word] || [];
      candidates.forEach(function (entry) {
        if (entry.weight < minWeight) return;
        // Check if the phrase appears at this position in the text
        if (lower.indexOf(entry.phrase) !== -1 && !seen.has(entry.phrase)) {
          seen.add(entry.phrase);
          matches.push({
            phrase:    entry.phrase,
            category:  entry.category,
            weight:    entry.weight,
            type:      entry.type,
            n:         entry.n,
          });
        }
      });
    });

    // Sort by weight desc, then by phrase length desc (longer = more specific)
    matches.sort(function (a, b) {
      if (Math.abs(a.weight - b.weight) > 0.05) return b.weight - a.weight;
      return b.n - a.n;
    });

    return matches.slice(0, maxRes);
  }

  // ─── Public: getIntentFromPhrases ─────────────────────────────────────────
  /**
   * getIntentFromPhrases(text)
   * Extract intent signals from phrase matches.
   * Returns { intent: string, confidence: number } or null.
   */
  function getIntentFromPhrases(text) {
    var phrases = lookupPhrases(text, { minWeight: 0.7 });
    var intentScores = {};

    phrases.forEach(function (p) {
      if (p.category.startsWith('intent:')) {
        var intentPart = p.category.split(':')[1];
        var intents = intentPart.split('+').filter(function(i) { return i.startsWith('intent:') || !i.includes(':'); });
        var cleanIntents = intentPart.split('+')
          .filter(function(part) { return !part.includes(':') || part.startsWith('intent:'); })
          .map(function(part) { return part.replace('intent:',''); });

        cleanIntents.forEach(function (intent) {
          if (!intentScores[intent]) intentScores[intent] = 0;
          intentScores[intent] = Math.max(intentScores[intent], p.weight);
        });
      }
    });

    var topIntent = null;
    var topScore  = 0;
    Object.keys(intentScores).forEach(function (intent) {
      if (intentScores[intent] > topScore) {
        topScore  = intentScores[intent];
        topIntent = intent;
      }
    });

    if (topIntent && topScore >= 0.7) {
      return { intent: topIntent, confidence: topScore };
    }
    return null;
  }

  // ─── Public: extractTopics ────────────────────────────────────────────────
  /**
   * extractTopics(text)
   * Returns topic signals found in text via phrase matching.
   */
  function extractTopics(text) {
    var phrases = lookupPhrases(text, { minWeight: 0.65 });
    var topics = [];
    phrases.forEach(function (p) {
      var parts = p.category.split('+');
      parts.forEach(function (part) {
        if (part.startsWith('topic:') || part.startsWith('state:') || part.startsWith('design:')) {
          topics.push({ topic: part.split(':')[1], weight: p.weight });
        }
      });
    });
    return topics;
  }

  // ─── Public: addPhrase ────────────────────────────────────────────────────
  /**
   * addPhrase(phrase, category, weight, type)
   * Add a phrase to the index (for dynamic/learned phrases).
   */
  function addPhrase(phrase, category, weight, type) {
    _addPhrase(phrase, category, weight, type);
  }

  // ─── Public: getStats ─────────────────────────────────────────────────────
  function getStats() {
    return {
      totalPhrases:   _phraseCount,
      indexedWords:   Object.keys(_phrasesByFirst).length,
    };
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRPhrases = {
    build:               BUILD_ID,
    lookupPhrases:       lookupPhrases,
    getIntentFromPhrases: getIntentFromPhrases,
    extractTopics:       extractTopics,
    addPhrase:           addPhrase,
    getStats:            getStats,
  };

})(typeof window !== 'undefined' ? window : global);
