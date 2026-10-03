/**
 * shadow-reaper-v2/core/context-engine.js
 * Shadow Reaper V2 — Context Engine
 *
 * Build: SR-V2-STAGE6-HLC1
 *
 * Responsibilities:
 *  - Maintain session-scoped conversation context (cleared on newConversation)
 *  - Track current topic, project context, design state
 *  - Track projectType, activeTopic, topicHistory
 *  - Track temporary instructions vs stable project facts
 *  - Track negated instructions (things NOT to do)
 *  - Resolve pronouns and follow-up references ("it", "that", "this")
 *  - Apply user corrections to stored context with negation guard
 *
 * Stage 6: adds structured fact categories for stable vs temporary context.
 */

(function (global) {
  'use strict';

  // --- Session state ---

  var _session = createEmptySession();

  function createEmptySession() {
    return {
      // STABLE PROJECT FACTS
      // Set when user explicitly names / describes their project.
      // These persist across topic switches. Only updated by explicit statements,
      // not by temporary instructions or negated commands.
      projectName:    null,   // "NightGlass"
      projectType:    null,   // "website", "app", "game", "tool", etc.
      designColor:    null,   // "dark blue", "neon green", etc. (primary)
      design:         [],     // all accumulated design descriptors

      // ACTIVE CONVERSATION FOCUS
      // Changes frequently -- reflects current conversational thread.
      // Does NOT overwrite stable project facts.
      area:           null,   // current area being discussed (homepage, menu, etc.)
      activeTopic:    null,   // current broader topic (may be unrelated to project)
      topicHistory:   [],     // recent topic stack (max 5)

      // TEMPORARY INSTRUCTIONS
      // Single-turn directives like "make it more cinematic".
      // Stored for context but do NOT become project facts.
      temporaryInstructions: [],  // max 3, rotating

      // NEGATED INSTRUCTIONS
      // "Don't change the homepage." -- things explicitly NOT to do.
      negatedInstructions: [],    // max 5

      // GENERAL TOPIC CONTEXT
      currentTopic:   null,
      lastUserSubject: null,

      // CORRECTION TRACKING
      lastAssertedFact: null,     // { field, value }

      // PRONOUN RESOLUTION
      recentSubjects: [],         // max 5 most-recent named subjects

      // TURN COUNTER
      turnCount: 0,

      // Stage 5 — Natural conversation signals
      neverMind:   false,   // user abandoned current topic ("never mind", "forget it")
      prevTopic:   null,    // topic before most-recent switch (enables "return to X" callbacks)
      rhetoricalQ: false,   // current turn is a rhetorical question
    };
  }

  // --- Subject tracking ---

  var PRONOUN_TARGETS = /\b(it|that|this|they|them|those|these)\b/i;

  function addSubject(subject) {
    if (!subject) return;
    _session.recentSubjects.unshift(subject);
    if (_session.recentSubjects.length > 5) {
      _session.recentSubjects = _session.recentSubjects.slice(0, 5);
    }
    _session.lastUserSubject = subject;
  }

  // --- Patterns ---

  // Detect projectType from "It's a website/app/game/tool/service/platform"
  // Requires "it's a/an <type>" anchor to avoid matching "a project called X" as type="project"
  var _PROJECT_TYPE_RE = /\bit.?s\s+(?:a|an)\s+(website|web\s*site|app|application|game|tool|service|platform|bot|chatbot|extension|plugin|script)\b/i;

  // Detect explicit topic switch: "let's work on X", "focus on X", "switch to X"
  var _TOPIC_SWITCH_RE = /\b(?:let.?s\s+(?:work\s+on|focus\s+on|switch\s+to|move\s+to|look\s+at)|work\s+on|switch\s+to|focus\s+on)\s+(?:the\s+)?([a-z][a-z0-9 _\-]{2,40})/i;

  // Detect negated instruction: "don't change X", "do not touch X", "leave X alone"
  var _NEGATED_INSTR_RE = /\b(?:don.?t|do\s+not|please\s+don.?t|never)\s+(?:change|modify|touch|edit|update|alter|move|delete|remove|redesign|work\s+on)\s+(?:the\s+)?([a-z][a-z0-9 _\-]{2,40})/i;

  // Detect temporary style instruction: "make it more X", "add X feel", "keep it X"
  var _TEMP_INSTR_RE = /\b(?:make\s+(?:it\s+)?(?:more\s+|less\s+)?|add\s+(?:a\s+|an?\s+)|keep\s+(?:it\s+)?)([a-z][a-z0-9 _\-]{2,40})(?:\s+(?:feel|vibe|look|style|mode))?/i;

  // Stage 5: never-mind / abandon signal
  var _NEVER_MIND_RE = /\b(never\s*mind|forget\s+it|forget\s+that|doesn.?t\s+matter|not\s+important|skip\s+it|ignore\s+that|move\s+on|let.?s\s+move\s+on|drop\s+it|whatever)\b/i;

  // Stage 5: rhetorical question (expecting no substantive answer)
  // Note: no trailing \b because some markers end with '?' which is non-word
  var _RHETORICAL_RE = /\b(right\?|am\s+i\s+right\b|isn.?t\s+it\b|don.?t\s+you\s+think\b|ya\s+know\b|know\s+what\s+i\s+mean\b|you\s+know\b|see\s+what\s+i\s+mean\b)/i;

  // Stage 5: topic return signal — "going back to", "about that thing earlier", "remember when"
  var _TOPIC_RETURN_RE = /\b(going\s+back\s+to|back\s+to|return\s+to|as\s+I\s+mentioned|earlier\s+(you\s+said|I\s+said|we\s+talked)|remember\s+(when|that|what)|that\s+thing\s+(I|we)\s+(mentioned|talked))\b/i;

  // --- Topic stack helper ---

  function _pushTopic(topic) {
    if (!topic) return;
    var t = topic.trim().toLowerCase();
    if (!t) return;
    _session.topicHistory.unshift(t);
    if (_session.topicHistory.length > 5) {
      _session.topicHistory = _session.topicHistory.slice(0, 5);
    }
  }

  // --- Update context from understanding result ---

  function update(understood, rawText) {
    _session.turnCount++;

    var intent   = understood.intent;
    var entities = understood.entities;

    // Stage 5 — reset per-turn signals
    _session.neverMind   = false;
    _session.rhetoricalQ = false;

    // Stage 5 — never-mind detection: user abandons current topic
    if (rawText && _NEVER_MIND_RE.test(rawText)) {
      _session.neverMind = true;
      // Preserve the topic we're abandoning so we can reference it if needed
      if (_session.activeTopic) {
        _session.prevTopic = _session.activeTopic;
        _session.activeTopic = null;
      }
    }

    // Stage 5 — rhetorical question detection
    if (rawText && _RHETORICAL_RE.test(rawText)) {
      _session.rhetoricalQ = true;
    }

    // Stage 5 — topic return detection: "going back to X" should restore prevTopic
    if (rawText && _TOPIC_RETURN_RE.test(rawText) && _session.prevTopic) {
      // If no explicit topic switch is detected below, restore prevTopic
      if (!rawText.match(_TOPIC_SWITCH_RE)) {
        _pushTopic(_session.prevTopic);
        _session.activeTopic = _session.prevTopic;
        _session.prevTopic   = null;
      }
    }

    // NEGATION / TOPIC SWITCH -- process BEFORE project name extraction
    // "Actually, don't change the homepage. Let's work on the menu instead."
    // Intent = USER_CORRECTION, but it's really a negated command + topic switch.

    // Detect negated instruction from raw text
    var negMatch = rawText ? rawText.match(_NEGATED_INSTR_RE) : null;
    if (negMatch) {
      var negTarget = negMatch[1].trim().toLowerCase();
      if (_session.negatedInstructions.indexOf(negTarget) === -1) {
        _session.negatedInstructions.push(negTarget);
        if (_session.negatedInstructions.length > 5) {
          _session.negatedInstructions.shift();
        }
      }
    }

    // Detect topic switch from raw text
    var topicSwitchMatch = rawText ? rawText.match(_TOPIC_SWITCH_RE) : null;
    if (topicSwitchMatch) {
      var newTopic = topicSwitchMatch[1].trim().toLowerCase();
      _pushTopic(newTopic);
      _session.activeTopic = newTopic;
    }

    // Apply user correction -- if correction intent and there's a lastAssertedFact
    // Only apply if it's a genuine value correction, not a negated command
    if (intent === 'USER_CORRECTION') {
      _applyCorrection(rawText);
    }

    // STABLE PROJECT FACTS
    // Project name -- only update when explicitly stated (not from corrections)
    if (entities.projectName) {
      _session.lastAssertedFact = { field: 'projectName', value: entities.projectName };
      _session.projectName = entities.projectName;
      addSubject(entities.projectName);
    }

    // Project type -- "It's a website/app/game"
    var typeMatch = rawText ? rawText.match(_PROJECT_TYPE_RE) : null;
    if (typeMatch && !_session.projectType) {
      _session.projectType = typeMatch[1].toLowerCase().replace(/\s+/g, '');
    }

    // Design color -- prefer multi-word (dark blue > dark)
    if (entities.design) {
      if (_session.design.indexOf(entities.design) === -1) {
        _session.design.push(entities.design);
      }
      // Set primary design color if not yet set or if this is more specific
      if (!_session.designColor || entities.design.indexOf(' ') !== -1) {
        _session.designColor = entities.design;
      }
      addSubject(entities.area || _session.projectName || entities.design);
    }

    // ACTIVE CONVERSATION FOCUS
    // Area -- update active area, NOT a stable project fact
    if (entities.area) {
      _session.area = entities.area;
      addSubject(entities.area);
      // Also update activeTopic if we haven't already done so via topic switch
      if (!topicSwitchMatch) {
        _pushTopic(entities.area);
      }
    }

    // GENERAL TOPIC
    if (entities.topic) {
      _session.currentTopic = entities.topic;
      addSubject(entities.topic);
    }

    // TEMPORARY INSTRUCTIONS
    // Only track style directives (not project statements)
    if (intent === 'FOLLOW_UP' && rawText) {
      var tempMatch = rawText.match(_TEMP_INSTR_RE);
      if (tempMatch) {
        var instr = tempMatch[0].trim().toLowerCase();
        // Don't store project names or area names as temp instructions
        var isProjectOrArea = _session.projectName &&
          instr.toLowerCase().indexOf(_session.projectName.toLowerCase()) !== -1;
        if (!isProjectOrArea && instr.length > 4) {
          _session.temporaryInstructions.push(instr);
          if (_session.temporaryInstructions.length > 3) {
            _session.temporaryInstructions.shift();
          }
        }
      }
    }

    return getSnapshot();
  }

  // --- Pronoun resolution ---

  function resolvePronouns(text) {
    if (!PRONOUN_TARGETS.test(text)) return null;
    // Return the most recent meaningful subject
    return _session.recentSubjects[0] || _session.area || _session.projectName || null;
  }

  // --- Correction logic ---

  // Negation words that mean "don't apply this as a correction"
  var _NEGATION_PREFIX = /^(don'?t|do not|not |never |stop |no )/i;

  function _applyCorrection(rawText) {
    if (!_session.lastAssertedFact) return;

    var field = _session.lastAssertedFact.field;

    // Try to extract the corrected value
    // "No, I meant Blue Wolf" / "Actually it's Blue Wolf"
    var correctionMatch = rawText.match(
      /(?:no[,.]?\s+i\s+meant|actually[,.]?\s*(?:it'?s)?|i\s+meant|wait[,.]?\s*i\s+meant|correction[:]?\s*)\s*([A-Za-z0-9][A-Za-z0-9 _\-'"]{0,40})/i
    );

    if (correctionMatch) {
      var correctedValue = correctionMatch[1].trim().replace(/['"]/g, '');

      // NEGATION GUARD: If the extracted "correction" starts with a negation word,
      // this is a negated command ("don't change the homepage"), NOT a value correction.
      // Do NOT overwrite the project name / field with a negated command fragment.
      if (_NEGATION_PREFIX.test(correctedValue)) return;

      // Also reject very short generic words that are not meaningful values
      if (correctedValue.length < 3) return;

      _session[field] = correctedValue;
      addSubject(correctedValue);
    }
  }

  // --- Snapshot ---

  function getSnapshot() {
    return {
      // Stable project facts
      projectName:    _session.projectName,
      projectType:    _session.projectType,
      designColor:    _session.designColor,
      design:         _session.design.slice(),

      // Active focus
      area:           _session.area,
      activeTopic:    _session.activeTopic,
      topicHistory:   _session.topicHistory.slice(),

      // Temporary / negated state
      temporaryInstructions: _session.temporaryInstructions.slice(),
      negatedInstructions:   _session.negatedInstructions.slice(),

      // General
      currentTopic:    _session.currentTopic,
      lastUserSubject: _session.lastUserSubject,
      recentSubjects:  _session.recentSubjects.slice(),
      turnCount:       _session.turnCount,

      // Stage 5 — natural conversation signals (per-turn)
      neverMind:       _session.neverMind,
      rhetoricalQ:     _session.rhetoricalQ,
      prevTopic:       _session.prevTopic,
    };
  }

  // --- Reset ---

  function reset() {
    _session = createEmptySession();
  }

  // --- Export ---

  global.SRContext = {
    update:          update,
    resolvePronouns: resolvePronouns,
    getSnapshot:     getSnapshot,
    reset:           reset,
  };
})(typeof window !== 'undefined' ? window : global);
