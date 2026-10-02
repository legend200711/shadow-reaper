/**
 * shadow-reaper-v2/language/learning/language-learning.js
 * Shadow Reaper — Language Learning Integration
 *
 * Build: SR-LANG-LEARNING-1
 *
 * Exposes: window.SRLanguageLearning
 *
 * PURPOSE:
 *   Manages language-level learning (word relationships, terms, abbreviations)
 *   SEPARATE from fact learning, personal memory, and global knowledge.
 *
 * SEPARATION OF CONCERNS:
 *   LANGUAGE LEARNING:  word meanings, abbreviations, user terminology
 *   KNOWLEDGE LEARNING: facts about the world
 *   PERSONAL MEMORY:    explicit user saves (sr-personal-memory.js)
 *   ADAPTIVE LEARNING:  preferences, project context (adaptive-brain.js)
 *   GLOBAL LEARNING:    de-identified, Founder-approved (sr-global-learning.js)
 *
 * PRIVACY:
 *   User-specific language (abbreviations, custom terms) is UID-isolated.
 *   User A's private vocabulary NEVER leaks to User B.
 *   Global language improvement goes through sanitize → Founder review pipeline.
 *
 * CORRECTIONS:
 *   Supports superseding relationships with correction provenance.
 *   "X means Y" then "no, X means Z" → Z supersedes Y.
 *
 * Zero external calls. Pure local logic.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-LANG-LEARNING-1';

  // ─── Learning category constants ──────────────────────────────────────────
  var LANG_CAT = {
    ABBREVIATION:  'abbreviation',   // User-defined short forms: NG → NightGlass
    CUSTOM_TERM:   'custom_term',    // User-defined term meanings
    SYNONYM:       'synonym',        // User-taught synonyms
    PHRASE_ALIAS:  'phrase_alias',   // Phrase aliases: "my thing" → "NightGlass project"
    CORRECTION:    'correction',     // Supersedes a previous entry
  };

  // ─── Per-session language memory ──────────────────────────────────────────
  // Session-scoped only. Persistent learning uses SRAdaptiveBrain.
  var _sessionVocab = {};  // term → { meaning, type, confidence, learnedAt, correctedBy? }

  // ─── Learn candidate ──────────────────────────────────────────────────────
  /**
   * learnCandidate(data)
   *
   * Attempt to learn a language relationship from current interaction.
   *
   * data: {
   *   type:      LANG_CAT.*
   *   term:      string   (e.g. "NG", "my project")
   *   meaning:   string   (e.g. "NightGlass", "website project")
   *   confidence: 0-1
   *   source:    'user_explicit' | 'user_inferred' | 'correction'
   *   supersedes: string? (previous value being replaced)
   * }
   *
   * Returns: { ok: boolean, reason?: string, stored?: boolean }
   */
  function learnCandidate(data) {
    if (!data || !data.term || !data.meaning) {
      return { ok: false, reason: 'missing_term_or_meaning' };
    }
    if (!data.type || !LANG_CAT[data.type.toUpperCase().replace('-','_')]) {
      data.type = LANG_CAT.CUSTOM_TERM;
    }

    var term    = String(data.term).trim().toLowerCase();
    var meaning = String(data.meaning).trim();
    if (!term || !meaning) return { ok: false, reason: 'empty_term_or_meaning' };

    // Security: reject sensitive content
    if (_isSensitive(meaning) || _isSensitive(term)) {
      return { ok: false, reason: 'sensitive_content_rejected' };
    }

    // Session store — normalize type to LANG_CAT value (lowercase)
    var normalizedType = LANG_CAT[data.type.toUpperCase().replace('-','_')] || LANG_CAT.CUSTOM_TERM;

    var entry = {
      term:       term,
      meaning:    meaning,
      type:       normalizedType,
      confidence: data.confidence || 0.7,
      source:     data.source || 'user_explicit',
      learnedAt:  Date.now(),
    };

    if (data.supersedes) {
      entry.supersedes = String(data.supersedes).trim();
    }

    _sessionVocab[term] = entry;

    // Persist to adaptive brain if available (UID-isolated)
    _persistToAdaptiveBrain(entry);

    // Add to relationship graph if synonym
    if (data.type === LANG_CAT.SYNONYM && global.SRRelationships) {
      global.SRRelationships.addLearnedRelationship(
        term, 'SYNONYM_OF', meaning.toLowerCase(), data.confidence || 0.7, 'user'
      );
    }

    return { ok: true, stored: true };
  }

  // ─── Persist to adaptive brain ────────────────────────────────────────────
  function _persistToAdaptiveBrain(entry) {
    var brain = global.SRAdaptiveBrain;
    if (!brain || !brain.store) return;

    // Package for adaptive brain storage (UID-isolated by brain)
    brain.store({
      conceptKey:    'lang:' + entry.term,
      type:          'language_' + entry.type,
      rawText:       entry.term + ' means ' + entry.meaning,
      value:         entry.meaning,
      confidence:    entry.confidence,
      source:        entry.source,
      learnedAt:     entry.learnedAt,
      supersedes:    entry.supersedes || null,
      // Never store anything sensitive
    });
  }

  // ─── Retrieve user vocabulary ──────────────────────────────────────────────
  /**
   * getTermMeaning(term, uid)
   * Looks up a user-specific term.
   * UID isolation: only current user's vocabulary returned.
   *
   * Priority:
   *   1. Session vocabulary
   *   2. Adaptive brain (persisted)
   *   3. null
   */
  function getTermMeaning(term) {
    if (!term) return null;
    var t = term.toLowerCase().trim();

    // Session check
    if (_sessionVocab[t]) return _sessionVocab[t].meaning;

    // Adaptive brain check
    var brain = global.SRAdaptiveBrain;
    if (brain && brain.retrieve) {
      var items = brain.retrieve({ query: 'lang:' + t });
      if (items && items.length > 0) {
        // Find exact key match
        for (var i = 0; i < items.length; i++) {
          if (items[i].conceptKey === 'lang:' + t) {
            return items[i].value;
          }
        }
      }
    }

    return null;
  }

  // ─── Resolve abbreviations ────────────────────────────────────────────────
  /**
   * resolveAbbreviations(text)
   * Expands any user-defined abbreviations in text.
   * UID-isolated: only current user's abbreviations.
   * Returns { expanded: string, changes: [] }
   */
  function resolveAbbreviations(text) {
    if (!text) return { expanded: text, changes: [] };

    var changes = [];
    var expanded = text;

    // Session vocab
    Object.keys(_sessionVocab).forEach(function (term) {
      var entry = _sessionVocab[term];
      if (entry.type !== LANG_CAT.ABBREVIATION) return;
      var re = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      var match = text.match(re);
      if (match) {
        expanded = expanded.replace(re, entry.meaning);
        changes.push({ from: term, to: entry.meaning, confidence: entry.confidence });
      }
    });

    return { expanded: expanded, changes: changes };
  }

  // ─── Correction handling ──────────────────────────────────────────────────
  /**
   * applyCorrection(oldValue, newValue, context)
   * User said "X" but corrects to "Y".
   * Supersedes previous entry, updates confidence.
   */
  function applyCorrection(oldValue, newValue, context) {
    if (!oldValue || !newValue) return { ok: false, reason: 'missing_values' };
    if (_isSensitive(newValue)) return { ok: false, reason: 'sensitive_content' };

    var old = oldValue.toLowerCase().trim();
    var nw  = newValue.trim();

    // Find and supersede the previous entry
    Object.keys(_sessionVocab).forEach(function (term) {
      var entry = _sessionVocab[term];
      if (entry.meaning.toLowerCase() === old ||
          entry.meaning.toLowerCase() === old.toLowerCase()) {
        entry.supersededBy = nw;
        entry.active = false;
      }
    });

    // Store correction
    return learnCandidate({
      type:       LANG_CAT.CORRECTION,
      term:       context && context.subject ? context.subject.toLowerCase() : 'last_assertion',
      meaning:    nw,
      confidence: 0.85,
      source:     'user_correction',
      supersedes: old,
    });
  }

  // ─── Global learning candidate extraction ────────────────────────────────
  /**
   * extractGlobalCandidate(turnData)
   *
   * Analyze a conversation turn for potential global language improvement.
   *
   * GLOBAL LEARNING BOUNDARY RULES (NON-NEGOTIABLE):
   *   - Raw conversation NEVER goes to global
   *   - PII, credentials, private info: ALWAYS rejected
   *   - Personal/emotional content: ALWAYS rejected
   *   - One user's statement NEVER automatically becomes global truth
   *   - Must go through: extract → filter → sanitize → deidentify → Founder review
   *
   * Returns null if not suitable for global proposal.
   * Returns sanitized candidate object if potentially suitable.
   */
  function extractGlobalCandidate(turnData) {
    if (!turnData || !turnData.text) return null;

    var gl = global.SRGlobalLearning;
    if (!gl || !gl.isReady || !gl.isReady()) return null;

    var text = turnData.text;

    // First: reject if personal content
    if (gl.isPrivateContent && gl.isPrivateContent(text)) return null;

    // Only consider objective language patterns — not personal experiences
    // Pattern: "X is Y" type definitional statements
    var defMatch = text.match(/^([A-Za-z][A-Za-z\s]{1,30})\s+(?:is|means|refers to|stands for)\s+([A-Za-z][A-Za-z\s0-9]{2,60})\.?$/i);
    if (defMatch) {
      var term    = defMatch[1].trim().toLowerCase();
      var meaning = defMatch[2].trim();
      if (!_isSensitive(term) && !_isSensitive(meaning) && meaning.length >= 3) {
        return {
          type:       'definitional_statement',
          term:       term,
          meaning:    meaning,
          confidence: 'LOW',  // One user statement = LOW confidence
          source:     'user_statement',
          // No UID, no personal identifiers
          _deidentified: true,
        };
      }
    }

    return null;
  }

  // ─── Sensitive content check ──────────────────────────────────────────────
  var SENSITIVE_PATTERNS = [
    /\b(password|passwd)\s*(is|=|:)\s*\S+/i,
    /\bapi[\s_-]?key\s*(is|=|:)\s*\S+/i,
    /\btoken\s*(is|=|:)\s*\S+/i,
    /\bsecret\s*(is|=|:)\s*\S+/i,
    /\bcredit\s*card/i,
    /\bmy\s+password\s+is\b/i,
    /\bmy\s+(full\s+)?name\s+is\b/i,
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
    /\b\d{3}-\d{2}-\d{4}\b/,
    /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/,
    /serviceAccountKey/i,
    /\bprivate[\s_-]?key\b/i,
    /\bbearer\s+[A-Za-z0-9\-_.~+/]{20,}/i,
  ];

  function _isSensitive(text) {
    if (!text) return false;
    return SENSITIVE_PATTERNS.some(function (p) { return p.test(text); });
  }

  // ─── Public: detect language teaching patterns ────────────────────────────
  /**
   * detectTeachingPattern(text)
   * Detects if the user is explicitly teaching the system a language relationship.
   *
   * Examples:
   *   "When I say NG, I mean my NightGlass project."
   *   "NG stands for NightGlass."
   *   "By website, I mean my NightGlass app."
   *
   * Returns: { detected: bool, type, term, meaning, confidence } or null
   */
  function detectTeachingPattern(text) {
    if (!text) return null;

    var patterns = [
      // "X stands for Y" / "X means Y"
      { re: /^([A-Za-z0-9\s]{1,20})\s+(?:stands? for|means?|refers? to)\s+(.{2,60})\.?$/i,
        type: LANG_CAT.ABBREVIATION, termIdx: 1, meaningIdx: 2 },
      // "When I say X, I mean Y"
      { re: /when i say ([A-Za-z0-9\s]{1,20}),?\s+i (?:mean|meant)\s+(.{2,60})\.?$/i,
        type: LANG_CAT.ABBREVIATION, termIdx: 1, meaningIdx: 2 },
      // "By X I mean Y"
      { re: /by ([A-Za-z0-9\s]{1,20}),?\s+i (?:mean|meant)\s+(.{2,60})\.?$/i,
        type: LANG_CAT.CUSTOM_TERM, termIdx: 1, meaningIdx: 2 },
      // "X is the same as Y"
      { re: /^([A-Za-z0-9\s]{1,20})\s+is the same as\s+(.{2,60})\.?$/i,
        type: LANG_CAT.SYNONYM, termIdx: 1, meaningIdx: 2 },
      // "Call X Y" / "Refer to X as Y"
      { re: /(?:call|refer to)\s+([A-Za-z0-9\s]{1,20})\s+(?:as|by)\s+(.{2,60})\.?$/i,
        type: LANG_CAT.PHRASE_ALIAS, termIdx: 1, meaningIdx: 2 },
    ];

    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      var m = text.match(p.re);
      if (m) {
        var term    = m[p.termIdx].trim();
        var meaning = m[p.meaningIdx].trim();
        if (!_isSensitive(term) && !_isSensitive(meaning)) {
          return {
            detected:   true,
            type:       p.type,
            term:       term,
            meaning:    meaning,
            confidence: 0.85,
          };
        }
      }
    }

    return null;
  }

  // ─── Process turn ─────────────────────────────────────────────────────────
  /**
   * processTurn(text, analysis)
   * Called after each user turn.
   * Checks for teaching patterns and auto-learns if found.
   * Returns { learned: bool, candidate?: object }
   */
  function processTurn(text, analysis) {
    var teaching = detectTeachingPattern(text);
    if (teaching && teaching.detected) {
      var result = learnCandidate({
        type:       teaching.type,
        term:       teaching.term,
        meaning:    teaching.meaning,
        confidence: teaching.confidence,
        source:     'user_explicit',
      });
      return { learned: result.ok, candidate: teaching };
    }

    // Check for correction pattern
    if (analysis && analysis.isCorrection) {
      var brain = global.SRAdaptiveBrain;
      if (brain && brain.extractConcepts) {
        var concepts = brain.extractConcepts(text);
        // Let adaptive brain handle corrections (it has the full context)
      }
    }

    // Check for global candidate
    var globalCandidate = extractGlobalCandidate({ text: text, analysis: analysis });
    if (globalCandidate) {
      // Queue for global learning proposal (through proper pipeline)
      var gl = global.SRGlobalLearning;
      if (gl && gl.proposeContribution) {
        gl.proposeContribution({
          content:    globalCandidate.term + ' → ' + globalCandidate.meaning,
          category:   'language_relationship',
          confidence: 'LOW',
        }, function () {}); // fire-and-forget, result not critical
      }
    }

    return { learned: false };
  }

  // ─── Clear session vocabulary ─────────────────────────────────────────────
  function clearSession() {
    _sessionVocab = {};
  }

  // ─── Get session vocabulary stats ────────────────────────────────────────
  function getStats() {
    var types = {};
    Object.values(_sessionVocab).forEach(function (e) {
      types[e.type] = (types[e.type] || 0) + 1;
    });
    return {
      sessionTerms: Object.keys(_sessionVocab).length,
      byType: types,
    };
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRLanguageLearning = {
    build:                   BUILD_ID,
    LANG_CAT:                LANG_CAT,
    learnCandidate:          learnCandidate,
    getTermMeaning:          getTermMeaning,
    resolveAbbreviations:    resolveAbbreviations,
    applyCorrection:         applyCorrection,
    detectTeachingPattern:   detectTeachingPattern,
    processTurn:             processTurn,
    extractGlobalCandidate:  extractGlobalCandidate,
    clearSession:            clearSession,
    getStats:                getStats,
  };

})(typeof window !== 'undefined' ? window : global);
