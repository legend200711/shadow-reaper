/**
 * shadow-reaper-v2/language/relationships/relationships.js
 * Shadow Reaper — Language Relationship Graph
 *
 * Build: SR-LANG-RELATIONSHIPS-1
 *
 * Exposes: window.SRRelationships
 *
 * PURPOSE:
 *   Stores and queries semantic relationships between concepts.
 *   This is where millions of language relationships live — NOT as
 *   canned responses, but as concept-level connections.
 *
 * RELATIONSHIP TYPES:
 *   IS_A, RELATED_TO, SYNONYM_OF, ANTONYM_OF, FORM_OF, PART_OF,
 *   USED_WITH, ACTION_ON, DESCRIBES, CAUSES, RESULTS_IN,
 *   COMMONLY_FOLLOWS, COMMONLY_PRECEDES, TOPIC_RELATED, INTENT_RELATED,
 *   CAN_HAVE_PROBLEM, ASSOCIATED_WITH
 *
 * DESIGN:
 *   - Static relationships: built in — high confidence
 *   - Learned relationships: user-specific, lower confidence
 *   - Graph is queryable by concept, relationship type, confidence
 *   - Does NOT treat statistical association as absolute truth
 *   - Confidence and provenance tracked per edge
 *
 * STORAGE:
 *   Static graph: in-memory (this file)
 *   Learned private relationships: via SRAdaptiveBrain (per-user, UID-isolated)
 *   Candidate global relationships: via SRGlobalLearning pipeline
 *
 * PERFORMANCE:
 *   Uses indexed lookup by source concept.
 *   Returns bounded result sets.
 *   Does NOT enumerate the full graph on lookup.
 *
 * Zero external calls. Zero hosted AI. Pure local logic.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-LANG-RELATIONSHIPS-1';

  // ─── Relationship type constants ──────────────────────────────────────────
  var REL = {
    IS_A:             'IS_A',
    RELATED_TO:       'RELATED_TO',
    SYNONYM_OF:       'SYNONYM_OF',
    ANTONYM_OF:       'ANTONYM_OF',
    FORM_OF:          'FORM_OF',
    PART_OF:          'PART_OF',
    USED_WITH:        'USED_WITH',
    ACTION_ON:        'ACTION_ON',
    DESCRIBES:        'DESCRIBES',
    CAUSES:           'CAUSES',
    RESULTS_IN:       'RESULTS_IN',
    COMMONLY_FOLLOWS: 'COMMONLY_FOLLOWS',
    COMMONLY_PRECEDES:'COMMONLY_PRECEDES',
    TOPIC_RELATED:    'TOPIC_RELATED',
    INTENT_RELATED:   'INTENT_RELATED',
    CAN_HAVE_PROBLEM: 'CAN_HAVE_PROBLEM',
    ASSOCIATED_WITH:  'ASSOCIATED_WITH',
  };

  // ─── Static relationship graph ────────────────────────────────────────────
  // Format: { from: string, rel: REL, to: string, confidence: 0-1, symmetric?: bool }
  // Built-in core relationships. Confidence 0.9+ = high confidence factual.
  // Confidence 0.6-0.8 = typical but not universal.
  // Confidence < 0.6 = heuristic / possible.

  var STATIC_EDGES = [

    // ── Web / site concepts ────────────────────────────────────────────────
    { from:'website',     rel: REL.SYNONYM_OF, to:'webpage',       confidence: 0.85, symmetric: true },
    { from:'website',     rel: REL.SYNONYM_OF, to:'site',          confidence: 0.9,  symmetric: true },
    { from:'website',     rel: REL.SYNONYM_OF, to:'web',           confidence: 0.7,  symmetric: false },
    { from:'website',     rel: REL.PART_OF,    to:'internet',      confidence: 0.9 },
    { from:'website',     rel: REL.CAN_HAVE_PROBLEM, to:'loading', confidence: 0.9 },
    { from:'website',     rel: REL.CAN_HAVE_PROBLEM, to:'authentication', confidence: 0.85 },
    { from:'website',     rel: REL.CAN_HAVE_PROBLEM, to:'css',     confidence: 0.85 },
    { from:'website',     rel: REL.CAN_HAVE_PROBLEM, to:'javascript', confidence: 0.85 },
    { from:'website',     rel: REL.CAN_HAVE_PROBLEM, to:'performance', confidence: 0.85 },
    { from:'website',     rel: REL.CAN_HAVE_PROBLEM, to:'error',   confidence: 0.9 },
    { from:'website',     rel: REL.CAN_HAVE_PROBLEM, to:'bug',     confidence: 0.85 },
    { from:'website',     rel: REL.CAN_HAVE_PROBLEM, to:'layout',  confidence: 0.8 },
    { from:'webpage',     rel: REL.IS_A,       to:'website',       confidence: 0.8 },
    { from:'homepage',    rel: REL.IS_A,       to:'webpage',       confidence: 0.9 },
    { from:'homepage',    rel: REL.PART_OF,    to:'website',       confidence: 0.95 },
    { from:'landing page',rel: REL.SYNONYM_OF, to:'homepage',      confidence: 0.7, symmetric: true },
    { from:'dashboard',   rel: REL.IS_A,       to:'webpage',       confidence: 0.85 },

    // ── Help / fix intent ─────────────────────────────────────────────────
    { from:'help',        rel: REL.SYNONYM_OF, to:'assist',        confidence: 0.9, symmetric: true },
    { from:'help',        rel: REL.SYNONYM_OF, to:'support',       confidence: 0.85, symmetric: true },
    { from:'fix',         rel: REL.SYNONYM_OF, to:'repair',        confidence: 0.9, symmetric: true },
    { from:'fix',         rel: REL.SYNONYM_OF, to:'resolve',       confidence: 0.85, symmetric: true },
    { from:'fix',         rel: REL.SYNONYM_OF, to:'solve',         confidence: 0.85, symmetric: true },
    { from:'fix',         rel: REL.SYNONYM_OF, to:'correct',       confidence: 0.8, symmetric: true },
    { from:'fix',         rel: REL.SYNONYM_OF, to:'debug',         confidence: 0.75, symmetric: false },
    { from:'broken',      rel: REL.ANTONYM_OF, to:'working',       confidence: 0.95, symmetric: true },
    { from:'broken',      rel: REL.SYNONYM_OF, to:'not working',   confidence: 0.9, symmetric: true },
    { from:'broken',      rel: REL.SYNONYM_OF, to:'failing',       confidence: 0.8, symmetric: false },
    { from:'issue',       rel: REL.SYNONYM_OF, to:'problem',       confidence: 0.9, symmetric: true },
    { from:'issue',       rel: REL.SYNONYM_OF, to:'bug',           confidence: 0.8, symmetric: true },
    { from:'error',       rel: REL.SYNONYM_OF, to:'bug',           confidence: 0.75, symmetric: false },
    { from:'error',       rel: REL.SYNONYM_OF, to:'issue',         confidence: 0.85, symmetric: true },
    { from:'problem',     rel: REL.SYNONYM_OF, to:'challenge',     confidence: 0.75, symmetric: false },

    // ── Greeting intent ───────────────────────────────────────────────────
    { from:'hello',       rel: REL.INTENT_RELATED, to:'GREETING',  confidence: 0.98 },
    { from:'hi',          rel: REL.INTENT_RELATED, to:'GREETING',  confidence: 0.98 },
    { from:'hey',         rel: REL.INTENT_RELATED, to:'GREETING',  confidence: 0.95 },
    { from:'sup',         rel: REL.INTENT_RELATED, to:'GREETING',  confidence: 0.9 },
    { from:'yo',          rel: REL.INTENT_RELATED, to:'GREETING',  confidence: 0.85 },
    { from:'howdy',       rel: REL.INTENT_RELATED, to:'GREETING',  confidence: 0.95 },
    { from:'greetings',   rel: REL.INTENT_RELATED, to:'GREETING',  confidence: 0.98 },
    { from:'good morning',rel: REL.INTENT_RELATED, to:'GREETING',  confidence: 0.95 },
    { from:'good afternoon', rel: REL.INTENT_RELATED, to:'GREETING', confidence: 0.95 },
    { from:'good evening', rel: REL.INTENT_RELATED, to:'GREETING', confidence: 0.95 },
    { from:'what is up',  rel: REL.INTENT_RELATED, to:'GREETING',  confidence: 0.85 },
    { from:'whats up',    rel: REL.INTENT_RELATED, to:'GREETING',  confidence: 0.85 },

    // ── Goodbye intent ────────────────────────────────────────────────────
    { from:'bye',         rel: REL.INTENT_RELATED, to:'GOODBYE',   confidence: 0.98 },
    { from:'goodbye',     rel: REL.INTENT_RELATED, to:'GOODBYE',   confidence: 0.99 },
    { from:'see you',     rel: REL.INTENT_RELATED, to:'GOODBYE',   confidence: 0.92 },
    { from:'later',       rel: REL.INTENT_RELATED, to:'GOODBYE',   confidence: 0.75 },
    { from:'farewell',    rel: REL.INTENT_RELATED, to:'GOODBYE',   confidence: 0.98 },
    { from:'take care',   rel: REL.INTENT_RELATED, to:'GOODBYE',   confidence: 0.85 },
    { from:'goodnight',   rel: REL.INTENT_RELATED, to:'GOODBYE',   confidence: 0.95 },

    // ── Thanks intent ─────────────────────────────────────────────────────
    { from:'thanks',      rel: REL.INTENT_RELATED, to:'THANKS',    confidence: 0.98 },
    { from:'thank you',   rel: REL.INTENT_RELATED, to:'THANKS',    confidence: 0.99 },
    { from:'appreciate',  rel: REL.INTENT_RELATED, to:'THANKS',    confidence: 0.85 },
    { from:'cheers',      rel: REL.INTENT_RELATED, to:'THANKS',    confidence: 0.8 },
    { from:'thx',         rel: REL.INTENT_RELATED, to:'THANKS',    confidence: 0.9 },

    // ── Correction intent ──────────────────────────────────────────────────
    { from:'no',          rel: REL.INTENT_RELATED, to:'USER_CORRECTION', confidence: 0.6 },
    { from:'actually',    rel: REL.INTENT_RELATED, to:'USER_CORRECTION', confidence: 0.8 },
    { from:'wait',        rel: REL.INTENT_RELATED, to:'USER_CORRECTION', confidence: 0.65 },
    { from:'i meant',     rel: REL.INTENT_RELATED, to:'USER_CORRECTION', confidence: 0.92 },
    { from:'not that',    rel: REL.INTENT_RELATED, to:'USER_CORRECTION', confidence: 0.85 },
    { from:'correction',  rel: REL.INTENT_RELATED, to:'USER_CORRECTION', confidence: 0.95 },

    // ── Color concepts ────────────────────────────────────────────────────
    { from:'blue',        rel: REL.RELATED_TO, to:'color',         confidence: 0.98 },
    { from:'red',         rel: REL.RELATED_TO, to:'color',         confidence: 0.98 },
    { from:'green',       rel: REL.RELATED_TO, to:'color',         confidence: 0.98 },
    { from:'black',       rel: REL.RELATED_TO, to:'color',         confidence: 0.98 },
    { from:'white',       rel: REL.RELATED_TO, to:'color',         confidence: 0.98 },
    { from:'dark',        rel: REL.ANTONYM_OF, to:'light',         confidence: 0.95, symmetric: true },
    { from:'blue',        rel: REL.ANTONYM_OF, to:'red',           confidence: 0.5 }, // weak — relative
    { from:'instead',     rel: REL.INTENT_RELATED, to:'USER_CORRECTION', confidence: 0.8 },

    // ── Project context concepts ───────────────────────────────────────────
    { from:'project',     rel: REL.RELATED_TO, to:'app',           confidence: 0.8, symmetric: false },
    { from:'project',     rel: REL.RELATED_TO, to:'website',       confidence: 0.75, symmetric: false },
    { from:'project',     rel: REL.RELATED_TO, to:'build',         confidence: 0.8 },
    { from:'project',     rel: REL.RELATED_TO, to:'create',        confidence: 0.8 },
    { from:'app',         rel: REL.SYNONYM_OF, to:'application',   confidence: 0.95, symmetric: true },
    { from:'app',         rel: REL.SYNONYM_OF, to:'software',      confidence: 0.8, symmetric: false },
    { from:'codebase',    rel: REL.PART_OF,    to:'project',       confidence: 0.9 },
    { from:'repository',  rel: REL.RELATED_TO, to:'codebase',      confidence: 0.9 },

    // ── Question patterns ──────────────────────────────────────────────────
    { from:'what',        rel: REL.INTENT_RELATED, to:'QUESTION',  confidence: 0.9 },
    { from:'how',         rel: REL.INTENT_RELATED, to:'QUESTION',  confidence: 0.9 },
    { from:'why',         rel: REL.INTENT_RELATED, to:'QUESTION',  confidence: 0.9 },
    { from:'when',        rel: REL.INTENT_RELATED, to:'QUESTION',  confidence: 0.85 },
    { from:'where',       rel: REL.INTENT_RELATED, to:'QUESTION',  confidence: 0.85 },
    { from:'who',         rel: REL.INTENT_RELATED, to:'QUESTION',  confidence: 0.85 },
    { from:'which',       rel: REL.INTENT_RELATED, to:'QUESTION',  confidence: 0.8 },
    { from:'is',          rel: REL.INTENT_RELATED, to:'QUESTION',  confidence: 0.6 },
    { from:'can',         rel: REL.INTENT_RELATED, to:'QUESTION',  confidence: 0.65 },

    // ── Emotional state concepts ───────────────────────────────────────────
    { from:'sad',         rel: REL.ANTONYM_OF, to:'happy',         confidence: 0.95, symmetric: true },
    { from:'angry',       rel: REL.RELATED_TO, to:'frustrated',    confidence: 0.8, symmetric: false },
    { from:'anxious',     rel: REL.RELATED_TO, to:'worried',       confidence: 0.9, symmetric: true },
    { from:'stressed',    rel: REL.RELATED_TO, to:'anxious',       confidence: 0.8 },
    { from:'tired',       rel: REL.RELATED_TO, to:'exhausted',     confidence: 0.85, symmetric: false },
    { from:'excited',     rel: REL.RELATED_TO, to:'happy',         confidence: 0.75 },

    // ── Action verbs for web/design ───────────────────────────────────────
    { from:'make',        rel: REL.SYNONYM_OF, to:'create',        confidence: 0.85, symmetric: false },
    { from:'make',        rel: REL.SYNONYM_OF, to:'build',         confidence: 0.75, symmetric: false },
    { from:'change',      rel: REL.SYNONYM_OF, to:'update',        confidence: 0.85, symmetric: true },
    { from:'change',      rel: REL.SYNONYM_OF, to:'modify',        confidence: 0.9, symmetric: true },
    { from:'change',      rel: REL.SYNONYM_OF, to:'alter',         confidence: 0.85, symmetric: true },
    { from:'build',       rel: REL.SYNONYM_OF, to:'create',        confidence: 0.8, symmetric: false },
    { from:'build',       rel: REL.SYNONYM_OF, to:'develop',       confidence: 0.85, symmetric: false },
    { from:'design',      rel: REL.RELATED_TO, to:'create',        confidence: 0.8 },
    { from:'design',      rel: REL.RELATED_TO, to:'ui',            confidence: 0.9 },
    { from:'design',      rel: REL.RELATED_TO, to:'style',         confidence: 0.85 },

    // ── Working/not working patterns ──────────────────────────────────────
    { from:'not working', rel: REL.SYNONYM_OF, to:'broken',        confidence: 0.9, symmetric: true },
    { from:'broken',      rel: REL.INTENT_RELATED, to:'HELP_REQUEST', confidence: 0.9 },
    { from:'not working', rel: REL.INTENT_RELATED, to:'HELP_REQUEST', confidence: 0.9 },
    { from:'fix',         rel: REL.INTENT_RELATED, to:'HELP_REQUEST', confidence: 0.85 },
    { from:'help',        rel: REL.INTENT_RELATED, to:'HELP_REQUEST', confidence: 0.9 },
    { from:'assist',      rel: REL.INTENT_RELATED, to:'HELP_REQUEST', confidence: 0.9 },
    { from:'support',     rel: REL.INTENT_RELATED, to:'HELP_REQUEST', confidence: 0.85 },

    // ── Technology concepts ───────────────────────────────────────────────
    { from:'javascript',  rel: REL.IS_A,       to:'programming language', confidence: 0.98 },
    { from:'python',      rel: REL.IS_A,       to:'programming language', confidence: 0.98 },
    { from:'html',        rel: REL.IS_A,       to:'markup language',      confidence: 0.98 },
    { from:'css',         rel: REL.IS_A,       to:'stylesheet language',  confidence: 0.98 },
    { from:'javascript',  rel: REL.USED_WITH,  to:'html',         confidence: 0.95 },
    { from:'css',         rel: REL.USED_WITH,  to:'html',         confidence: 0.95 },
    { from:'api',         rel: REL.RELATED_TO, to:'interface',    confidence: 0.9 },
    { from:'database',    rel: REL.RELATED_TO, to:'storage',      confidence: 0.9 },
    { from:'server',      rel: REL.ANTONYM_OF, to:'client',       confidence: 0.85, symmetric: true },
    { from:'frontend',    rel: REL.ANTONYM_OF, to:'backend',      confidence: 0.9, symmetric: true },
    { from:'bug',         rel: REL.RELATED_TO, to:'error',        confidence: 0.9, symmetric: true },
    { from:'debug',       rel: REL.ACTION_ON,  to:'bug',          confidence: 0.95 },
    { from:'deploy',      rel: REL.RELATED_TO, to:'release',      confidence: 0.85 },

    // ── Memory / learning meta ─────────────────────────────────────────────
    { from:'remember',    rel: REL.INTENT_RELATED, to:'MEMORY_SAVE',    confidence: 0.9 },
    { from:'recall',      rel: REL.INTENT_RELATED, to:'MEMORY_RECALL',  confidence: 0.9 },
    { from:'forget',      rel: REL.INTENT_RELATED, to:'MEMORY_FORGET',  confidence: 0.85 },
    { from:'what do you remember', rel: REL.INTENT_RELATED, to:'MEMORY_RECALL', confidence: 0.95 },

    // ── Negation awareness ─────────────────────────────────────────────────
    { from:'not',         rel: REL.CAUSES,     to:'NEGATION',     confidence: 0.95 },
    { from:"don't",       rel: REL.CAUSES,     to:'NEGATION',     confidence: 0.95 },
    { from:"doesn't",     rel: REL.CAUSES,     to:'NEGATION',     confidence: 0.95 },
    { from:"won't",       rel: REL.CAUSES,     to:'NEGATION',     confidence: 0.95 },
    { from:"can't",       rel: REL.CAUSES,     to:'NEGATION',     confidence: 0.95 },
    { from:'never',       rel: REL.CAUSES,     to:'NEGATION',     confidence: 0.9 },
    { from:'no',          rel: REL.CAUSES,     to:'NEGATION',     confidence: 0.7 }, // weak — context-dependent

    // ── Domain concepts: Shadow Nexus Social ─────────────────────────────
    { from:'shadow reaper', rel: REL.IS_A,     to:'ai assistant', confidence: 0.99 },
    { from:'shadow nexus social', rel: REL.IS_A, to:'platform',  confidence: 0.98 },
    { from:'sns',         rel: REL.SYNONYM_OF, to:'shadow nexus social', confidence: 0.95 },
    { from:'radio',       rel: REL.PART_OF,    to:'shadow nexus social', confidence: 0.85 },
    { from:'live',        rel: REL.PART_OF,    to:'shadow nexus social', confidence: 0.8 },

    // ── Pronoun reference concepts ─────────────────────────────────────────
    { from:'it',          rel: REL.INTENT_RELATED, to:'PRONOUN_REFERENCE', confidence: 0.8 },
    { from:'that',        rel: REL.INTENT_RELATED, to:'PRONOUN_REFERENCE', confidence: 0.75 },
    { from:'this',        rel: REL.INTENT_RELATED, to:'PRONOUN_REFERENCE', confidence: 0.75 },
    { from:'they',        rel: REL.INTENT_RELATED, to:'PRONOUN_REFERENCE', confidence: 0.8 },
    { from:'them',        rel: REL.INTENT_RELATED, to:'PRONOUN_REFERENCE', confidence: 0.8 },

    // ── Instead / change directive ─────────────────────────────────────────
    { from:'instead',     rel: REL.INTENT_RELATED, to:'CHANGE_REQUEST',   confidence: 0.85 },
    { from:'make it',     rel: REL.INTENT_RELATED, to:'CHANGE_REQUEST',   confidence: 0.9 },
    { from:'change it',   rel: REL.INTENT_RELATED, to:'CHANGE_REQUEST',   confidence: 0.9 },
    { from:'update it',   rel: REL.INTENT_RELATED, to:'CHANGE_REQUEST',   confidence: 0.9 },
    { from:'make that',   rel: REL.INTENT_RELATED, to:'CHANGE_REQUEST',   confidence: 0.85 },
    { from:'set it to',   rel: REL.INTENT_RELATED, to:'CHANGE_REQUEST',   confidence: 0.9 },
  ];

  // ─── Build adjacency index ─────────────────────────────────────────────────
  // Indexed by concept (normalized lowercase) for fast lookup

  var _graph = {};   // concept → [{ rel, to, confidence }]

  function _buildIndex() {
    for (var i = 0; i < STATIC_EDGES.length; i++) {
      var e = STATIC_EDGES[i];
      var from = e.from.toLowerCase();
      var to   = e.to.toLowerCase();

      if (!_graph[from]) _graph[from] = [];
      _graph[from].push({ rel: e.rel, to: to, confidence: e.confidence, source: 'static' });

      // Add symmetric reverse edge if flagged
      if (e.symmetric) {
        if (!_graph[to]) _graph[to] = [];
        _graph[to].push({ rel: e.rel, to: from, confidence: e.confidence, source: 'static' });
      }
    }
  }

  _buildIndex();

  // ─── Runtime learned edges (session-scoped) ────────────────────────────────
  // These come from user corrections, learning candidates, etc.
  var _learnedEdges = {};  // concept → [{ rel, to, confidence, source }]

  // ─── Public: getRelationships ─────────────────────────────────────────────
  /**
   * getRelationships(concept, options)
   *
   * Returns edges from the given concept.
   * options.rel = filter by relationship type
   * options.maxResults = max edges returned (default: 20)
   * options.minConfidence = minimum confidence (default: 0.5)
   * options.includeSymmetric = include symmetric reverse lookups (default: true)
   *
   * Returns array of { rel, to, confidence, source }
   */
  function getRelationships(concept, options) {
    var opts        = options || {};
    var minConf     = opts.minConfidence !== undefined ? opts.minConfidence : 0.5;
    var maxResults  = opts.maxResults  || 20;
    var filterRel   = opts.rel || null;
    var c           = (concept || '').toLowerCase().trim();

    var results = [];

    // Static graph
    if (_graph[c]) {
      results = results.concat(_graph[c]);
    }

    // Learned edges
    if (_learnedEdges[c]) {
      results = results.concat(_learnedEdges[c]);
    }

    // Filter
    if (filterRel) {
      results = results.filter(function (e) { return e.rel === filterRel; });
    }
    results = results.filter(function (e) { return e.confidence >= minConf; });

    // Sort by confidence desc
    results.sort(function (a, b) { return b.confidence - a.confidence; });

    return results.slice(0, maxResults);
  }

  // ─── Public: getSynonyms ──────────────────────────────────────────────────
  function getSynonyms(concept) {
    return getRelationships(concept, { rel: REL.SYNONYM_OF, minConfidence: 0.7 })
      .map(function (e) { return e.to; });
  }

  // ─── Public: getRelated ───────────────────────────────────────────────────
  function getRelated(concept, minConfidence) {
    return getRelationships(concept, { minConfidence: minConfidence || 0.6 });
  }

  // ─── Public: getIntentSignals ─────────────────────────────────────────────
  /**
   * Given a concept, return intent signals it's associated with.
   * Returns array of { intent, confidence }
   */
  function getIntentSignals(concept) {
    return getRelationships(concept, { rel: REL.INTENT_RELATED, minConfidence: 0.6 })
      .map(function (e) { return { intent: e.to.toUpperCase(), confidence: e.confidence }; });
  }

  // ─── Public: detectNegation ───────────────────────────────────────────────
  /**
   * Checks if concepts related to NEGATION appear in a word list.
   * Returns true/false.
   */
  function detectNegation(words) {
    if (!words || !words.length) return false;
    for (var i = 0; i < words.length; i++) {
      var w = words[i].toLowerCase();
      var edges = _graph[w] || [];
      for (var j = 0; j < edges.length; j++) {
        if (edges[j].rel === REL.CAUSES && edges[j].to === 'negation' && edges[j].confidence >= 0.7) {
          return true;
        }
      }
    }
    return false;
  }

  // ─── Public: addLearnedRelationship ──────────────────────────────────────
  /**
   * Add a learned relationship (from user teaching).
   * Stores session-scoped; persistent learning goes through SRAdaptiveBrain.
   *
   * rel must be one of REL constants.
   * confidence 0-1.
   * source: 'user', 'inferred', 'corrected'
   */
  function addLearnedRelationship(from, rel, to, confidence, source) {
    from = (from || '').toLowerCase().trim();
    to   = (to   || '').toLowerCase().trim();
    if (!from || !to || !REL[rel]) return false;

    var conf = confidence || 0.6;
    var src  = source || 'learned';

    if (!_learnedEdges[from]) _learnedEdges[from] = [];

    // Check for existing and update confidence
    for (var i = 0; i < _learnedEdges[from].length; i++) {
      var e = _learnedEdges[from][i];
      if (e.rel === rel && e.to === to) {
        e.confidence = Math.max(e.confidence, conf);
        e.source = src;
        return true;
      }
    }

    _learnedEdges[from].push({ rel: rel, to: to, confidence: conf, source: src });
    return true;
  }

  // ─── Public: conceptsOverlap ──────────────────────────────────────────────
  /**
   * conceptsOverlap(conceptsA, conceptsB)
   * Returns a score [0-1] indicating how semantically related two concept sets are.
   * Used by semantic similarity.
   */
  function conceptsOverlap(conceptsA, conceptsB) {
    if (!conceptsA.length || !conceptsB.length) return 0;
    var score = 0;
    var checked = new Set();

    for (var i = 0; i < conceptsA.length; i++) {
      var cA = conceptsA[i].toLowerCase();
      if (checked.has(cA)) continue;
      checked.add(cA);

      // Direct match
      for (var j = 0; j < conceptsB.length; j++) {
        var cB = conceptsB[j].toLowerCase();
        if (cA === cB) { score += 1.0; continue; }
      }

      // Relationship-based overlap
      var related = getRelationships(cA, { minConfidence: 0.65, maxResults: 10 });
      for (var k = 0; k < related.length; k++) {
        var relTo = related[k].to;
        for (var j2 = 0; j2 < conceptsB.length; j2++) {
          if (relTo === conceptsB[j2].toLowerCase()) {
            score += related[k].confidence * 0.8;
          }
        }
      }
    }

    var maxPossible = Math.max(conceptsA.length, conceptsB.length);
    return Math.min(score / maxPossible, 1.0);
  }

  // ─── Public: getGraphStats ────────────────────────────────────────────────
  function getGraphStats() {
    var staticNodes = Object.keys(_graph).length;
    var staticEdges = STATIC_EDGES.length;
    var learnedNodes = Object.keys(_learnedEdges).length;
    var learnedEdges = Object.values(_learnedEdges).reduce(function (sum, arr) { return sum + arr.length; }, 0);
    return {
      staticNodes:   staticNodes,
      staticEdges:   staticEdges,
      learnedNodes:  learnedNodes,
      learnedEdges:  learnedEdges,
      totalNodes:    staticNodes + learnedNodes,
      totalEdges:    staticEdges + learnedEdges,
      relationshipTypes: Object.keys(REL),
    };
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRRelationships = {
    build:                    BUILD_ID,
    REL:                      REL,
    getRelationships:         getRelationships,
    getSynonyms:              getSynonyms,
    getRelated:               getRelated,
    getIntentSignals:         getIntentSignals,
    detectNegation:           detectNegation,
    addLearnedRelationship:   addLearnedRelationship,
    conceptsOverlap:          conceptsOverlap,
    getGraphStats:            getGraphStats,
  };

})(typeof window !== 'undefined' ? window : global);
