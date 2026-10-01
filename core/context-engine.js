/**
 * shadow-reaper-v2/core/context-engine.js
 * Shadow Reaper V2 — Context Engine
 *
 * Build: SR-V2-STAGE1
 *
 * Responsibilities:
 *  - Maintain session-scoped conversation context (cleared on newConversation)
 *  - Track current topic, project context, design state
 *  - Resolve pronouns and follow-up references ("it", "that", "this")
 *  - Apply user corrections to stored context
 *
 * Stage 1 scope: session memory only. No Firestore. No persistence.
 */

(function (global) {
  'use strict';

  // ─── Session state ───────────────────────────────────────────────────────────

  let _session = createEmptySession();

  function createEmptySession() {
    return {
      // Project context
      projectName: null,
      area: null,         // homepage, dashboard, landing page, etc.
      design: [],         // dark, blue lightning, etc.

      // General topic context
      currentTopic: null,
      lastUserSubject: null,  // last explicit noun/subject mentioned

      // Correction target — what the user most recently stated that could be corrected
      lastAssertedFact: null, // { field, value }

      // Recent turn summaries for pronoun resolution
      recentSubjects: [],  // max 5 most-recent named subjects

      // Turn counter
      turnCount: 0,
    };
  }

  // ─── Subject tracking ────────────────────────────────────────────────────────

  const PRONOUN_TARGETS = /\b(it|that|this|they|them|those|these)\b/i;

  function addSubject(subject) {
    if (!subject) return;
    _session.recentSubjects.unshift(subject);
    if (_session.recentSubjects.length > 5) {
      _session.recentSubjects = _session.recentSubjects.slice(0, 5);
    }
    _session.lastUserSubject = subject;
  }

  // ─── Update context from understanding result ────────────────────────────────

  function update(understood, rawText) {
    _session.turnCount++;

    const { intent, entities } = understood;

    // Apply user correction — if correction intent and there's a lastAssertedFact
    if (intent === 'USER_CORRECTION') {
      _applyCorrection(rawText);
    }

    // Project name
    if (entities.projectName) {
      _session.lastAssertedFact = { field: 'projectName', value: entities.projectName };
      _session.projectName = entities.projectName;
      addSubject(entities.projectName);
    }

    // Area
    if (entities.area) {
      _session.area = entities.area;
      addSubject(entities.area);
    }

    // Design
    if (entities.design) {
      if (!_session.design.includes(entities.design)) {
        _session.design.push(entities.design);
      }
      // The design/area/project is the subject for pronoun resolution
      addSubject(entities.area || _session.projectName || entities.design);
    }

    // Topic
    if (entities.topic) {
      _session.currentTopic = entities.topic;
      addSubject(entities.topic);
    }

    return getSnapshot();
  }

  // ─── Pronoun resolution ──────────────────────────────────────────────────────

  function resolvePronouns(text) {
    if (!PRONOUN_TARGETS.test(text)) return null;
    // Return the most recent meaningful subject
    return _session.recentSubjects[0] || _session.area || _session.projectName || null;
  }

  // ─── Correction logic ────────────────────────────────────────────────────────

  function _applyCorrection(rawText) {
    if (!_session.lastAssertedFact) return;

    const { field } = _session.lastAssertedFact;

    // Try to extract the corrected value
    // "No, I meant Blue Wolf" / "Actually it's Blue Wolf"
    const correctionMatch = rawText.match(
      /(?:no[,.]?\s+i\s+meant|actually[,.]?\s*(?:it'?s)?|i\s+meant|wait[,.]?\s*i\s+meant|correction[:]?\s*)\s*([A-Za-z0-9][A-Za-z0-9 _\-'"]{0,40})/i
    );

    if (correctionMatch) {
      const correctedValue = correctionMatch[1].trim().replace(/['"]/g, '');
      _session[field] = correctedValue;
      addSubject(correctedValue);
    }
  }

  // ─── Snapshot ────────────────────────────────────────────────────────────────

  function getSnapshot() {
    return {
      projectName: _session.projectName,
      area: _session.area,
      design: [..._session.design],
      currentTopic: _session.currentTopic,
      lastUserSubject: _session.lastUserSubject,
      recentSubjects: [..._session.recentSubjects],
      turnCount: _session.turnCount,
    };
  }

  // ─── Reset ───────────────────────────────────────────────────────────────────

  function reset() {
    _session = createEmptySession();
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  global.SRContext = {
    update,
    resolvePronouns,
    getSnapshot,
    reset,
  };
})(typeof window !== 'undefined' ? window : global);
