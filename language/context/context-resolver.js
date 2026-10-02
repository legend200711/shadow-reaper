/**
 * shadow-reaper-v2/language/context/context-resolver.js
 * Shadow Reaper — Context & Reference Resolver
 *
 * Build: SR-LANG-CONTEXT-1
 *
 * Exposes: window.SRContextResolver
 *
 * PURPOSE:
 *   Resolve ambiguous references across conversation turns.
 *   - "it", "that", "this" → previous subject/topic
 *   - "instead" → previous value being replaced
 *   - "Make it blue" → what is "it"? → last mentioned subject
 *   - Multi-turn context window
 *   - Confidence-aware resolution (ambiguous references flagged)
 *
 * EXAMPLE:
 *   Turn 1: "My project is NightGlass."
 *   Turn 2: "It's a website."           → "it" = NightGlass
 *   Turn 3: "The homepage is black."
 *   Turn 4: "Make it blue instead."    → "it" = homepage, "instead" = changing black→blue
 *
 * DESIGN:
 *   This module SUPPLEMENTS SRContext (session-scoped context).
 *   It provides richer multi-turn reference resolution.
 *
 * STORAGE:
 *   Session-scoped only (cleared on newConversation).
 *   Persistent resolution context uses SRAdaptiveBrain.
 *
 * Zero external calls. Pure local logic.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-LANG-CONTEXT-1';

  // ─── Session context window ────────────────────────────────────────────────
  // Tracks the last N turns with full semantic analysis.
  var MAX_CONTEXT_WINDOW = 20;

  var _turns         = [];   // { role, text, analysis, timestamp }
  var _entityMemory  = {};   // entity type → latest value + confidence
  var _changeHistory = [];   // { subject, attribute, oldValue, newValue, turn }

  // ─── Clear session ────────────────────────────────────────────────────────
  function reset() {
    _turns         = [];
    _entityMemory  = {};
    _changeHistory = [];
  }

  // ─── Add turn ─────────────────────────────────────────────────────────────
  /**
   * addTurn(role, text, analysis)
   * Called after each user/assistant turn.
   * analysis = result from SRSemantics.analyzeSentence()
   */
  function addTurn(role, text, analysis) {
    var entry = {
      role:      role,
      text:      text,
      analysis:  analysis || null,
      timestamp: Date.now(),
    };

    _turns.push(entry);
    if (_turns.length > MAX_CONTEXT_WINDOW) {
      _turns = _turns.slice(-MAX_CONTEXT_WINDOW);
    }

    // Update entity memory if this is a user turn
    if (role === 'user' && analysis) {
      _updateEntityMemory(analysis);
    }
  }

  // ─── Update entity memory ─────────────────────────────────────────────────
  function _updateEntityMemory(analysis) {
    var entities = analysis.entities || {};

    if (entities.projectName) {
      _entityMemory.projectName = { value: entities.projectName, confidence: 0.95, turn: _turns.length };
    }
    if (entities.area) {
      _entityMemory.area = { value: entities.area, confidence: 0.9, turn: _turns.length };
    }
    if (entities.design) {
      // Design accumulates
      if (!_entityMemory.design) _entityMemory.design = [];
      _entityMemory.design.push({ value: entities.design, confidence: 0.85, turn: _turns.length });
    }
    if (entities.topic) {
      _entityMemory.topic = { value: entities.topic, confidence: 0.8, turn: _turns.length };
    }

    // Detect correction patterns
    if (analysis.isCorrection) {
      var corr = _extractCorrection(analysis.raw);
      if (corr && _changeHistory.length > 0) {
        var last = _changeHistory[_changeHistory.length - 1];
        _changeHistory.push({
          subject:   last.subject,
          attribute: last.attribute,
          oldValue:  last.newValue,
          newValue:  corr.newValue,
          turn:      _turns.length,
          corrected: true,
        });
        // Update entity memory with correction
        if (last.attribute === 'projectName') {
          _entityMemory.projectName = { value: corr.newValue, confidence: 0.9, turn: _turns.length, corrected: true };
        } else if (last.attribute === 'area') {
          _entityMemory.area = { value: corr.newValue, confidence: 0.9, turn: _turns.length, corrected: true };
        }
      }
    }

    // Track changes (for "instead" / correction detection)
    if (entities.design && _entityMemory.design && _entityMemory.design.length >= 2) {
      var designs = _entityMemory.design;
      var prev = designs[designs.length - 2];
      var curr = designs[designs.length - 1];
      _changeHistory.push({
        subject:   _entityMemory.area ? _entityMemory.area.value : _entityMemory.projectName ? _entityMemory.projectName.value : 'design',
        attribute: 'design',
        oldValue:  prev.value,
        newValue:  curr.value,
        turn:      _turns.length,
      });
    }
  }

  // ─── Extract correction value ──────────────────────────────────────────────
  function _extractCorrection(text) {
    var m = text.match(
      /(?:no[,.]?\s+i\s+meant|actually[,.]?\s*(?:it'?s)?|i\s+meant|wait[,.]?\s*i\s+meant|correction[:]?\s*)\s*([A-Za-z0-9][A-Za-z0-9 _\-'"]{0,40})/i
    );
    if (m) return { newValue: m[1].trim().replace(/['"]/g, '') };
    return null;
  }

  // ─── Resolve pronoun references ────────────────────────────────────────────
  /**
   * resolveReference(text, analysis)
   *
   * Given the current text and its semantic analysis, attempt to resolve:
   *   - Pronoun references: "it", "that", "this", "they", "them"
   *   - "instead" patterns
   *   - Elliptical follow-ups: "Make it darker" (what? → last area/subject)
   *
   * Returns {
   *   resolved: bool,
   *   subject: string|null,
   *   attribute: string|null,
   *   previousValue: string|null,
   *   confidence: number,
   *   explanation: string,
   * }
   */
  function resolveReference(text, analysis) {
    analysis = analysis || {};
    var lower = (text || '').toLowerCase();

    // No pronouns — no resolution needed
    var hasPronouns = /\b(it|that|this|they|them|those|these)\b/i.test(text);
    var hasInstead  = /\binstead\b/i.test(text);
    var isFollowUp  = analysis.isFollowUp;

    if (!hasPronouns && !hasInstead && !isFollowUp) {
      return { resolved: false, confidence: 0, explanation: 'no_pronoun_or_followup' };
    }

    // Most recent subject candidates (from entity memory + recent turns)
    var candidates = _buildCandidates();

    if (!candidates.length) {
      return { resolved: false, confidence: 0.3, explanation: 'no_context_available' };
    }

    // Take most recent candidate
    var best = candidates[0];

    // Build response
    var result = {
      resolved:      true,
      subject:       best.value,
      subjectType:   best.type,
      confidence:    best.confidence,
      explanation:   'resolved_from_' + best.source,
    };

    // If "instead" is present, also find what's being replaced
    if (hasInstead && _changeHistory.length > 0) {
      var lastChange = _changeHistory[_changeHistory.length - 1];
      result.replacing = lastChange.newValue;
      result.previousValue = lastChange.oldValue;
      result.attribute = lastChange.attribute;
    } else if (hasInstead && _entityMemory.design && _entityMemory.design.length > 0) {
      var lastDesign = _entityMemory.design[_entityMemory.design.length - 1];
      result.replacing = lastDesign.value;
      result.attribute = 'design';
    }

    return result;
  }

  // ─── Build candidate subjects from context ────────────────────────────────
  function _buildCandidates() {
    var candidates = [];

    // Most recent explicit entities (highest priority)
    if (_entityMemory.area) {
      candidates.push({
        value:      _entityMemory.area.value,
        type:       'area',
        confidence: _entityMemory.area.confidence,
        source:     'entity_memory',
        turn:       _entityMemory.area.turn,
      });
    }
    if (_entityMemory.projectName) {
      candidates.push({
        value:      _entityMemory.projectName.value,
        type:       'project',
        confidence: _entityMemory.projectName.confidence * 0.9,  // slightly less than area
        source:     'entity_memory',
        turn:       _entityMemory.projectName.turn,
      });
    }
    if (_entityMemory.topic) {
      candidates.push({
        value:      _entityMemory.topic.value,
        type:       'topic',
        confidence: _entityMemory.topic.confidence * 0.85,
        source:     'entity_memory',
        turn:       _entityMemory.topic.turn,
      });
    }

    // Scan recent user turns for content words (most recent first)
    var userTurns = _turns
      .filter(function (t) { return t.role === 'user'; })
      .slice(-3)
      .reverse();

    userTurns.forEach(function (turn, idx) {
      if (!turn.analysis) return;
      var concepts = turn.analysis.concepts || [];
      if (concepts.length > 0) {
        // First content concept in recent turn is a strong candidate
        candidates.push({
          value:      concepts[0],
          type:       'concept',
          confidence: 0.7 - idx * 0.15,
          source:     'recent_turn_' + idx,
          turn:       _turns.indexOf(turn),
        });
      }
    });

    // Sort by confidence desc, then by recency
    candidates.sort(function (a, b) {
      if (Math.abs(a.confidence - b.confidence) > 0.1) return b.confidence - a.confidence;
      return b.turn - a.turn;
    });

    return candidates;
  }

  // ─── Public: getContext ───────────────────────────────────────────────────
  /**
   * Returns current context snapshot for the response engine.
   */
  function getContext() {
    var ctx = {
      projectName:  _entityMemory.projectName ? _entityMemory.projectName.value : null,
      area:         _entityMemory.area ? _entityMemory.area.value : null,
      design:       _entityMemory.design ? _entityMemory.design.map(function(d){return d.value;}) : [],
      topic:        _entityMemory.topic ? _entityMemory.topic.value : null,
      turnCount:    _turns.filter(function(t){return t.role==='user';}).length,
      recentSubjects: _buildCandidates().slice(0,5).map(function(c){return c.value;}),
      changeHistory: _changeHistory.slice(-3),
    };

    // Merge with SRContext if available (existing context engine)
    if (global.SRContext) {
      var existingCtx = global.SRContext.getSnapshot();
      ctx = Object.assign({}, existingCtx, ctx);
      // Prefer our analysis where we have higher confidence
      if (!ctx.projectName && existingCtx.projectName) ctx.projectName = existingCtx.projectName;
      if (!ctx.area && existingCtx.area) ctx.area = existingCtx.area;
    }

    return ctx;
  }

  // ─── Public: resolvePronouns ──────────────────────────────────────────────
  /**
   * resolvePronouns(text)
   * Quick resolution of pronouns to most recent subject.
   * Returns resolved subject string or null.
   */
  function resolvePronouns(text) {
    if (!/\b(it|that|this|they|them)\b/i.test(text)) return null;
    var candidates = _buildCandidates();
    if (candidates.length > 0 && candidates[0].confidence >= 0.6) {
      return candidates[0].value;
    }
    // Fallback to SRContext
    if (global.SRContext) {
      return global.SRContext.resolvePronouns(text);
    }
    return null;
  }

  // ─── Public: getLastAssertedFact ─────────────────────────────────────────
  /**
   * Returns the most recently asserted fact that could be corrected.
   * { field, value, confidence }
   */
  function getLastAssertedFact() {
    // Most recent entity memory entry
    var candidates = [];
    ['projectName','area','topic'].forEach(function (key) {
      if (_entityMemory[key]) {
        candidates.push({
          field:      key,
          value:      _entityMemory[key].value,
          confidence: _entityMemory[key].confidence,
          turn:       _entityMemory[key].turn,
        });
      }
    });
    if (_entityMemory.design && _entityMemory.design.length > 0) {
      var ld = _entityMemory.design[_entityMemory.design.length - 1];
      candidates.push({ field: 'design', value: ld.value, confidence: ld.confidence, turn: ld.turn });
    }
    candidates.sort(function (a, b) { return b.turn - a.turn; });
    return candidates[0] || null;
  }

  // ─── Public: getUserPrivateVocabulary ────────────────────────────────────
  /**
   * Gets user-specific learned terms from SRAdaptiveBrain.
   * These are UID-isolated — private to the authenticated user.
   * Returns { abbreviations: {}, customTerms: {} }
   */
  function getUserPrivateVocabulary() {
    var result = { abbreviations: {}, customTerms: {} };
    var brain = global.SRAdaptiveBrain;
    if (!brain) return result;

    var items = brain.listAll ? brain.listAll() : [];
    items.forEach(function (item) {
      if (item.type === 'language_abbrev') {
        result.abbreviations[item.abbrev] = item.expansion;
      } else if (item.type === 'custom_term') {
        result.customTerms[item.term] = item.meaning;
      }
    });
    return result;
  }

  // ─── Public: expandUserAbbreviation ──────────────────────────────────────
  /**
   * Expand a user-defined abbreviation if known.
   * "NG" → "NightGlass" (if user taught this)
   * Returns expanded string or original if not found.
   * UID-ISOLATED: only current authenticated user's vocabulary.
   */
  function expandUserAbbreviation(text) {
    var vocab = getUserPrivateVocabulary();
    var abbrevs = vocab.abbreviations;
    var result = text;
    Object.keys(abbrevs).forEach(function (abbrev) {
      var re = new RegExp('\\b' + abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      result = result.replace(re, abbrevs[abbrev]);
    });
    return result;
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRContextResolver = {
    build:                    BUILD_ID,
    reset:                    reset,
    addTurn:                  addTurn,
    resolveReference:         resolveReference,
    resolvePronouns:          resolvePronouns,
    getContext:               getContext,
    getLastAssertedFact:      getLastAssertedFact,
    getUserPrivateVocabulary: getUserPrivateVocabulary,
    expandUserAbbreviation:   expandUserAbbreviation,
  };

})(typeof window !== 'undefined' ? window : global);
