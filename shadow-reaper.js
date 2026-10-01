/**
 * shadow-reaper-v2/shadow-reaper.js
 * Shadow Reaper V2 — Main Entry Point
 *
 * Build: SR-V2-STAGE4
 *
 * Exposes: window.ShadowReaper
 *
 * Public API:
 *   ShadowReaper.init()                  — Initialize (async-safe)
 *   ShadowReaper.ask(message, cb)        — Process user message; cb(responseString)
 *   ShadowReaper.newConversation()       — New thread, clear session state
 *   ShadowReaper.getStatus()             — Return current system status object
 *   ShadowReaper.loadLocalModel([id])    — Trigger local model load; returns Promise
 *   ShadowReaper.setHistoryEnabled(bool)
 *   ShadowReaper.setMemoryEnabled(bool)
 *   ShadowReaper.setAdaptiveEnabled(bool)
 *   ShadowReaper.setVoiceEnabled(bool)
 *   ShadowReaper.setTTSEnabled(bool)
 *   ShadowReaper.destroy()              — Tear down instance
 *
 * Architecture (Stage 4):
 *   USER MESSAGE
 *     ↓
 *   ShadowReaper.ask()
 *     ↓
 *   TRANSLATION INTENT CHECK (SRTranslation.parseTranslationRequest)
 *     ↓  (if translation request → handle, no further routing)
 *   Understanding Engine    (intent + tone + entity extraction)
 *     ↓
 *   Context Engine          (session context update + pronoun resolution)
 *     ↓
 *   Knowledge Check         (SRKnowledge.isRelevant — only inject if relevant)
 *     ↓
 *   SRPersistence: memory / continuity / adaptive intercepts
 *     ↓  (async branch for memory/continuity commands)
 *   Conversation History    (loaded on continuity intent)
 *   Personal Memory         (save/recall/forget on explicit commands)
 *   Adaptive Learning       (snippets injected into model context)
 *     ↓
 *   SRResponse.composeAsync()
 *     ├── DETERMINISTIC commands       → deterministic response (no model)
 *     ├── META QUESTIONS (project etc) → deterministic response (no model)
 *     └── GENERAL CONVERSATION        → SRLocalModel.generate() → response
 *                                         (falls back to deterministic if FAILED)
 *     ↓
 *   ANSWER → callback (with _lastResponseSource tag)
 *     ↓  (fire-and-forget after response delivered)
 *   Save conversation turn (history)
 *   Process turn for adaptive learning
 *
 * Stage 4 additions over Stage 3:
 *   - Translation engine integration (Checkpoint K)
 *   - Knowledge engine integration (Checkpoint E)
 *   - setMemoryEnabled() added to public API
 *   - setVoiceEnabled() / setTTSEnabled() wired
 *   - Founder Controls capability checks
 *   - 0 Workers AI calls (env.AI.run = 0)
 *   - No deployment (dev-test.html / ui.html only)
 *
 * Dependency load order (before this file):
 *   1. snx-shadow-conv-history.js      → window.SNXShadowConvHistory
 *   2. snx-shadow-memory.js            → window.SNXShadowMemory
 *   3. snx-shadow-adaptive.js          → window.SNXShadowAdaptive
 *   4. core/adaptive-brain.js          → window.SRAdaptiveBrain
 *   5. core/understanding-engine.js    → window.SRUnderstanding
 *   6. core/context-engine.js          → window.SRContext
 *   7. core/conversation-engine.js     → window.SRConversation
 *   8. core/response-engine.js         → window.SRResponse
 *   9. core/persistence-bridge.js      → window.SRPersistence
 *  10. core/local-model.js             → window.SRLocalModel
 *  11. knowledge/knowledge-engine.js   → window.SRKnowledge
 *  12. translation/translation-engine.js → window.SRTranslation
 *  13. voice/voice-engine.js           → window.SRVoice
 *  14. adapters/founder-controls.js    → window.SRFounderControls
 *  15. shadow-reaper-v2/shadow-reaper.js → window.ShadowReaper
 */

(function (global) {
  'use strict';

  // ─── Guard: prevent double-init ──────────────────────────────────────────────

  if (global.ShadowReaper && global.ShadowReaper._initialized) {
    console.warn('[ShadowReaper V2] Already initialized. Skipping duplicate load.');
    return;
  }

  // ─── State ───────────────────────────────────────────────────────────────────

  var _initialized = false;
  var _destroyed   = false;

  // Last response source for diagnostics
  var _lastResponseSource = 'NONE';

  // ─── Dependency check ────────────────────────────────────────────────────────

  function _checkDeps() {
    var missing = [];
    if (!global.SRUnderstanding) missing.push('SRUnderstanding (understanding-engine.js)');
    if (!global.SRContext)       missing.push('SRContext (context-engine.js)');
    if (!global.SRConversation)  missing.push('SRConversation (conversation-engine.js)');
    if (!global.SRResponse)      missing.push('SRResponse (response-engine.js)');
    // Optional modules — warn but don't block
    if (!global.SRPersistence) {
      console.warn('[ShadowReaper V2] SRPersistence not loaded — running session-only mode.');
    }
    if (!global.SRLocalModel) {
      console.warn('[ShadowReaper V2] SRLocalModel not loaded — running deterministic-only mode.');
    }
    if (!global.SRKnowledge) {
      console.warn('[ShadowReaper V2] SRKnowledge not loaded — static knowledge retrieval unavailable.');
    }
    if (!global.SRKnowledgeLearner) {
      console.warn('[ShadowReaper V2] SRKnowledgeLearner not loaded — continuous knowledge learning unavailable.');
    }
    if (!global.SRTranslation) {
      console.warn('[ShadowReaper V2] SRTranslation not loaded — translation unavailable.');
    }
    if (!global.SRVoice) {
      console.warn('[ShadowReaper V2] SRVoice not loaded — voice unavailable.');
    }
    if (!global.SRFounderControls) {
      console.warn('[ShadowReaper V2] SRFounderControls not loaded — founder controls unavailable.');
    }
    return missing;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function _persist()    { return global.SRPersistence    || null; }
  function _localModel() { return global.SRLocalModel     || null; }
  function _knowledge()  { return global.SRKnowledge      || null; }
  function _learner()    { return global.SRKnowledgeLearner || null; }
  function _translation(){ return global.SRTranslation    || null; }
  function _founder()    { return global.SRFounderControls|| null; }

  // ─── Founder capability gate ─────────────────────────────────────────────────
  // Returns true if the capability is globally enabled (or founder controls not loaded).

  function _capEnabled(key) {
    var fc = _founder();
    if (!fc) return true;
    return fc.isEnabled(key);
  }

  // ─── Core synchronous pipeline ───────────────────────────────────────────────
  // Used only by the legacy sync path (Stage 1 tests, no callback provided).

  function _corePipeline(message) {
    var understood = global.SRUnderstanding.understand(message);
    var context    = global.SRContext.update(understood, message);
    global.SRConversation.addTurn('user', message, understood.intent, understood.tone);
    var response = global.SRResponse.compose(understood, context);
    global.SRConversation.addTurn('assistant', response, null, null);
    _lastResponseSource = 'DETERMINISTIC';
    return { response: response, understood: understood, context: context };
  }

  // ─── Full async pipeline (Stage 4) ───────────────────────────────────────────

  function _pipeline(message, callback) {
    // ── GLOBAL CAPABILITY GATE ────────────────────────────────────────────────
    if (!_capEnabled('shadowReaperEnabled')) {
      callback('Shadow Reaper is currently unavailable.');
      return;
    }

    var p = _persist();

    // ── TRANSLATION INTENT (Checkpoint K) ────────────────────────────────────
    var tr = _translation();
    if (tr && _capEnabled('translationEnabled')) {
      var translationReq = tr.parseTranslationRequest(message);
      if (translationReq) {
        _handleTranslationRequest(translationReq, message, p, callback);
        return;
      }
    }

    // ── MEMORY INTENT ────────────────────────────────────────────────────────
    var memIntent = (p && _capEnabled('memoryEnabled')) ? p.detectMemoryIntent(message) : null;
    if (memIntent) {
      p.handleMemoryCommand(memIntent, message, function (memResponse) {
        global.SRConversation.addTurn('user',      message,     'MEMORY_' + memIntent, 'neutral');
        global.SRConversation.addTurn('assistant', memResponse, null, null);
        if (p) { p.saveTurn('user', message); p.saveTurn('assistant', memResponse); }
        _lastResponseSource = 'MEMORY';
        callback(memResponse);
      });
      return;
    }

    // ── ADAPTIVE PRIVACY INTENT ──────────────────────────────────────────────
    var adIntent = p ? p.detectAdaptiveIntent(message) : null;
    if (adIntent) {
      p.handleAdaptiveCommand(adIntent, message, function (adResponse) {
        if (adResponse) {
          global.SRConversation.addTurn('user',      message,    'ADAPTIVE_CMD', 'neutral');
          global.SRConversation.addTurn('assistant', adResponse, null, null);
          if (p) { p.saveTurn('user', message); p.saveTurn('assistant', adResponse); }
          _lastResponseSource = 'DETERMINISTIC';
          callback(adResponse);
          return;
        }
        _runNormalPipeline(message, p, callback);
      });
      return;
    }

    // ── CONTINUITY INTENT ─────────────────────────────────────────────────────
    var isContinuity = (p && _capEnabled('historyEnabled')) ? p.detectContinuityIntent(message) : false;
    if (isContinuity) {
      p.loadHistoryContext(function (histResult) {
        var turns = (histResult && histResult.turns) ? histResult.turns : [];
        var result = _corePipelineWithHistory(message, turns);
        if (p) {
          p.saveTurn('user', message);
          p.saveTurn('assistant', result.response);
          p.processAdaptiveTurn(message);
        }
        _lastResponseSource = 'HISTORY';
        callback(result.response);
      });
      return;
    }

    // ── NORMAL PIPELINE ───────────────────────────────────────────────────────
    _runNormalPipeline(message, p, callback);
  }

  // ─── Handle translation request ──────────────────────────────────────────────

  function _handleTranslationRequest(req, rawMessage, p, callback) {
    var tr = _translation();
    var response;

    if (req.intent === 'SET_LANGUAGE') {
      // User wants to set preferred response language
      tr.setPreferredLanguage(req.target);
      response = tr.composeTranslationResponse(req, rawMessage, req.targetName);
      _lastResponseSource = 'TRANSLATION';
    } else if (req.intent === 'TRANSLATE' && req.text) {
      var result = tr.translate(req.text, req.source, req.target);
      response = tr.composeTranslationResponse(result, req.text, req.targetName);
      _lastResponseSource = 'TRANSLATION';
    } else {
      // Partial translation intent — ask for clarification
      response = 'What would you like me to translate, and to which language?';
      _lastResponseSource = 'DETERMINISTIC';
    }

    global.SRConversation.addTurn('user',      rawMessage, 'TRANSLATION', 'neutral');
    global.SRConversation.addTurn('assistant', response,   null, null);
    if (p) { p.saveTurn('user', rawMessage); p.saveTurn('assistant', response); }
    callback(response);
  }

  // ─── Normal pipeline with composeAsync ───────────────────────────────────────

  function _runNormalPipeline(message, p, callback) {
    var understood = global.SRUnderstanding.understand(message);
    var context    = global.SRContext.update(understood, message);

    global.SRConversation.addTurn('user', message, understood.intent, understood.tone);

    // Gather context for model injection
    var adaptiveSnippets = p ? p.getAdaptiveSnippets(message, context) : [];
    var recentTurns      = global.SRConversation.getRecentTurns(6);

    // Knowledge retrieval (Checkpoint E) — only inject if relevant
    var knowledgeSnippet = null;
    var k = _knowledge();
    if (k && _capEnabled('knowledgeEnabled')) {
      var kEntry = k.query(message);
      if (kEntry) {
        knowledgeSnippet = kEntry.content;
      }
    }

    var composeOpts = {
      recentTurns:      recentTurns,
      adaptiveSnippets: adaptiveSnippets,
      memorySnippets:   [],
      knowledgeSnippet: knowledgeSnippet,
    };

    global.SRResponse.composeAsync(understood, context, composeOpts, function (response, source) {
      _lastResponseSource = source || 'DETERMINISTIC';

      // If static knowledge is relevant and response is a generic fallback, substitute
      if (knowledgeSnippet && source === 'DETERMINISTIC' &&
          (understood.intent === 'QUESTION' || understood.intent === 'GENERAL_CONVERSATION')) {
        var genericFallbacks = [
          "Tell me more", "I'm not sure I caught that", "Say more", "I want to follow"
        ];
        var isGeneric = genericFallbacks.some(function (f) {
          return response.indexOf(f) === 0;
        });
        if (isGeneric) {
          response = knowledgeSnippet;
          _lastResponseSource = 'KNOWLEDGE';
        }
      }

      global.SRConversation.addTurn('assistant', response, null, null);
      if (p) {
        p.saveTurn('user', message);
        p.saveTurn('assistant', response);
        p.processAdaptiveTurn(message, context);
      }

      // ── KNOWLEDGE LEARNING — fire-and-forget after response ───────────────
      // Process EVERY user turn through the knowledge learner. This extracts
      // concepts, definitions, relationships, corrections and connects them
      // to the adaptive brain — completely independent of the response path.
      var learner = _learner();
      if (learner && _capEnabled('adaptiveEnabled') !== false) {
        var convId      = p ? (p.getStatus && p.getStatus().currentConvId) : null;
        var projectName = context.projectName || null;
        // Fire-and-forget — never blocks the pipeline
        try {
          learner.learn({
            text:           message,
            role:           'user',
            convId:         convId,
            projectName:    projectName,
            sessionContext: context,
          });
        } catch (_) {}
      }

      callback(response);
    });
  }

  // ─── Continuity pipeline ─────────────────────────────────────────────────────

  function _corePipelineWithHistory(message, historyTurns) {
    var understood = global.SRUnderstanding.understand(message);
    var context    = global.SRContext.update(understood, message);
    global.SRConversation.addTurn('user', message, understood.intent, understood.tone);
    var enrichedContext = Object.assign({}, context, {
      _historyTurns:          historyTurns,
      _hasPersistentHistory:  historyTurns.length > 0,
    });
    var response = global.SRResponse.compose(understood, enrichedContext);
    global.SRConversation.addTurn('assistant', response, null, null);
    return { response: response, understood: understood, context: enrichedContext };
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  var ShadowReaper = {

    _initialized: false,
    _version: 'SR-V2-STAGE4',

    /**
     * Initialize Shadow Reaper V2.
     * Must be called before ask().
     * Safe to call multiple times.
     */
    init: function () {
      if (_destroyed) {
        console.error('[ShadowReaper V2] Cannot init — instance has been destroyed.');
        return false;
      }
      if (_initialized) {
        return true;
      }

      var missing = _checkDeps();
      if (missing.length > 0) {
        console.error('[ShadowReaper V2] Missing dependencies:\n  ' + missing.join('\n  '));
        return false;
      }

      if (global.SRPersistence) {
        global.SRPersistence.init();
      }

      // Load Founder controls (non-blocking)
      if (global.SRFounderControls) {
        global.SRFounderControls.load(function () {
          console.log('[ShadowReaper V2] Founder controls loaded.');
        });
      }

      _initialized = true;
      this._initialized = true;
      console.log('[ShadowReaper V2] Initialized. Build:', this._version);
      return true;
    },

    /**
     * Load the local language model.
     * @param {string} [modelId]  — optional model ID override
     * @returns {Promise}
     */
    loadLocalModel: function (modelId) {
      var lm = _localModel();
      if (!lm) {
        console.warn('[ShadowReaper V2] SRLocalModel not loaded — cannot start local model.');
        return Promise.reject(new Error('SRLocalModel not available.'));
      }
      return lm.loadModel(modelId);
    },

    /**
     * Process a user message through the full pipeline.
     * Always async — calls callback(responseString).
     *
     * @param {string}   message  — User input text
     * @param {function} callback — fn(responseString)
     */
    ask: function (message, callback) {
      if (!_initialized) {
        console.warn('[ShadowReaper V2] Not initialized. Call ShadowReaper.init() first.');
        var err = 'I need a moment to wake up. Try again shortly.';
        if (typeof callback === 'function') { callback(err); return; }
        return err;
      }
      if (_destroyed) {
        var d = 'Shadow Reaper is no longer active.';
        if (typeof callback === 'function') { callback(d); return; }
        return d;
      }
      if (!message || typeof message !== 'string' || message.trim() === '') {
        var e = "Say something — I'm listening.";
        if (typeof callback === 'function') { callback(e); return; }
        return e;
      }

      var trimmed = message.trim();

      if (typeof callback !== 'function') {
        // Legacy sync path (Stage 1 tests only) — runs synchronous core, no async
        var result = _corePipeline(trimmed);
        return result.response;
      }

      // Stage 4 async path
      _pipeline(trimmed, callback);
    },

    /**
     * Clear session state and start a new conversation thread.
     * Does NOT delete Firestore history, Personal Memory, or Adaptive data.
     */
    newConversation: function () {
      if (!_initialized) return;
      global.SRContext.reset();
      global.SRConversation.reset();
      if (global.SRPersistence) {
        global.SRPersistence.newConversation();
      }
      _lastResponseSource = 'NONE';
      console.log('[ShadowReaper V2] New conversation started.');
    },

    /**
     * Enable or disable persistent conversation history.
     * OFF does NOT delete existing history data.
     * @param {boolean} val
     */
    setHistoryEnabled: function (val) {
      if (global.SRPersistence) global.SRPersistence.setHistoryEnabled(!!val);
    },

    /**
     * Enable or disable Personal Memory.
     * OFF does NOT delete existing memory data.
     * @param {boolean} val
     */
    setMemoryEnabled: function (val) {
      /* Route through SRPersistence which delegates to SNXShadowMemory (standalone) */
      if (global.SRPersistence && global.SRPersistence.setMemoryEnabled) {
        global.SRPersistence.setMemoryEnabled(!!val);
      } else if (global.SNXShadowMemory) {
        global.SNXShadowMemory.setEnabled(!!val);
      }
    },

    /**
     * Enable or disable adaptive learning.
     * OFF does NOT delete existing learned context.
     * @param {boolean} val
     */
    setAdaptiveEnabled: function (val) {
      if (global.SRPersistence) global.SRPersistence.setAdaptiveEnabled(!!val);
    },

    /**
     * Enable or disable voice.
     * @param {boolean} val
     */
    setVoiceEnabled: function (val) {
      if (global.SRVoice) global.SRVoice.setVoiceEnabled(!!val);
    },

    /**
     * Enable or disable text-to-speech.
     * @param {boolean} val
     */
    setTTSEnabled: function (val) {
      if (global.SRVoice) global.SRVoice.setTTSEnabled(!!val);
    },

    /**
     * Return the current system status.
     * @returns {object}
     */
    getStatus: function () {
      var context = _initialized ? global.SRContext.getSnapshot() : null;
      var persistStatus = (global.SRPersistence && _initialized)
        ? global.SRPersistence.getStatus()
        : null;
      var modelStatus = global.SRLocalModel
        ? global.SRLocalModel.getStatus()
        : { state: 'UNAVAILABLE', modelId: null, loadPct: 0, lastError: null, isReady: false };
      var voiceStatus = global.SRVoice
        ? global.SRVoice.getStatus()
        : { supported: false, state: 'UNAVAILABLE', voiceEnabled: false, ttsEnabled: false };
      var founderStatus = global.SRFounderControls
        ? global.SRFounderControls.getAll()
        : null;

      return {
        version:    this._version,
        initialized: _initialized,
        destroyed:   _destroyed,
        turnCount:   _initialized ? global.SRConversation.getTurnCount() : 0,
        sessionContext: context,
        workersAICalls: 0,       // Always 0 — no Workers AI
        legacyAIRestored: false,
        websiteKnowledge: false,
        lastResponseSource: _lastResponseSource,

        // Persistence status
        historyConnected:  persistStatus ? persistStatus.historyConnected  : false,
        memoryConnected:   persistStatus ? persistStatus.memoryConnected   : false,
        adaptiveConnected: persistStatus ? persistStatus.adaptiveConnected : false,
        brainConnected:    persistStatus ? persistStatus.brainConnected    : false,
        historyEnabled:    persistStatus ? persistStatus.historyEnabled    : false,
        memoryEnabled:     (global.SNXShadowMemory ? global.SNXShadowMemory.isEnabled() : (persistStatus ? !!persistStatus.memoryEnabled : false)),
        adaptiveEnabled:   persistStatus ? persistStatus.adaptiveEnabled   : false,
        currentConvId:     persistStatus ? persistStatus.currentConvId     : null,
        adaptiveItemCount: persistStatus ? persistStatus.adaptiveItemCount : 0,
        brainConceptCount: persistStatus ? persistStatus.brainConceptCount : 0,

        // New in Stage 4-LEARN
        knowledgeConnected:         !!global.SRKnowledge,
        knowledgeLearnerConnected:  !!global.SRKnowledgeLearner,
        translationConnected:  !!global.SRTranslation,
        voiceConnected:        !!global.SRVoice,
        founderControlsLoaded: !!global.SRFounderControls,
        founderCapabilities:   founderStatus,

        // Local model status
        localModel: modelStatus,

        // Voice status
        voice: voiceStatus,
      };
    },

    /**
     * Destroy the instance and clear all session state.
     * Does NOT delete any persistent Firebase data.
     */
    destroy: function () {
      if (_initialized) {
        global.SRContext.reset();
        global.SRConversation.reset();
        if (global.SRPersistence) {
          global.SRPersistence.destroy();
        }
        if (global.SRLocalModel) {
          global.SRLocalModel.destroy();
        }
        if (global.SRVoice) {
          global.SRVoice.destroy();
        }
        if (global.SRFounderControls) {
          global.SRFounderControls.destroy();
        }
      }
      _initialized = false;
      this._initialized = false;
      _destroyed = true;
      console.log('[ShadowReaper V2] Destroyed.');
    },
  };

  // ─── Register global ──────────────────────────────────────────────────────────

  global.ShadowReaper = ShadowReaper;

})(typeof window !== 'undefined' ? window : global);
