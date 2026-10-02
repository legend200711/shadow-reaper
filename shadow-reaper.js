/**
 * shadow-reaper-v2/shadow-reaper.js
 * Shadow Reaper V2 — Main Entry Point
 *
 * Build: SR-V2-STAGE6
 *
 * Exposes: window.ShadowReaper
 *
 * Public API:
 *   ShadowReaper.init()                  — Initialize (async-safe)
 *   ShadowReaper.ask(message, cb)        — Process user message; cb(responseString)
 *   ShadowReaper.processRequest(opts,cb) — Structured request wrapper
 *   ShadowReaper.debugAsk(message, cb)   — ask() with full trace diagnostics returned
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

  // ── Per-request diagnostics (reset each turn) ────────────────────────────────
  var _lastDiag = {
    LANGUAGE_FOUNDATION:     'UNKNOWN',
    TOKEN_COUNT:             0,
    LEMMA_MATCHES:           0,
    CONCEPTS:                0,
    KNOWLEDGE_QUERY:         'NO',
    KNOWLEDGE_CATEGORY:      null,
    KNOWLEDGE_MATCHES:       0,
    TOP_KNOWLEDGE_SCORE:     0,
    KNOWLEDGE_USED:          'NO',
    ADAPTIVE_CONTEXT_USED:   'NO',
    PERSONAL_MEMORY_USED:    'NO',
    RESPONSE_SOURCE:         'UNKNOWN',
    NEGATION_DETECTED:       false,
    INTENT:                  'UNKNOWN',
  };

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
    if (!global.SRLanguage) {
      console.warn('[ShadowReaper V2] SRLanguage not loaded — running without language foundation (degraded mode).');
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
  function _langFdn()    { return global.SRLanguage       || null; }

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
    // ── Reset per-request diagnostics ────────────────────────────────────────
    _lastDiag = {
      LANGUAGE_FOUNDATION:   'UNKNOWN',
      TOKEN_COUNT:           0,
      LEMMA_MATCHES:         0,
      CONCEPTS:              0,
      KNOWLEDGE_QUERY:       'NO',
      KNOWLEDGE_CATEGORY:    null,
      KNOWLEDGE_MATCHES:     0,
      TOP_KNOWLEDGE_SCORE:   0,
      KNOWLEDGE_USED:        'NO',
      ADAPTIVE_CONTEXT_USED: 'NO',
      PERSONAL_MEMORY_USED:  'NO',
      RESPONSE_SOURCE:       'UNKNOWN',
      NEGATION_DETECTED:     false,
      INTENT:                'UNKNOWN',
    };

    // ── LANGUAGE FOUNDATION ANALYSIS ──────────────────────────────────────────
    // Run SRLanguage.analyze() if available to enrich understanding.
    // Falls back to SRUnderstanding if language foundation not loaded.
    var langAnalysis  = null;
    var langFdn       = _langFdn();
    var contextSnapshot = global.SRContext ? global.SRContext.getSnapshot() : {};

    if (langFdn) {
      try {
        langAnalysis = langFdn.analyze(message, contextSnapshot);
        _lastDiag.LANGUAGE_FOUNDATION = langAnalysis ? 'READY' : 'FAILED';
        if (langAnalysis) {
          _lastDiag.TOKEN_COUNT   = langAnalysis.wordCount || 0;
          _lastDiag.LEMMA_MATCHES = langAnalysis.concepts  ? langAnalysis.concepts.length : 0;
          _lastDiag.CONCEPTS      = langAnalysis.concepts  ? langAnalysis.concepts.length : 0;
          _lastDiag.NEGATION_DETECTED = !!(langAnalysis.negation && langAnalysis.negation.negated);
        }
      } catch (_) {
        _lastDiag.LANGUAGE_FOUNDATION = 'FAILED';
      }
    } else {
      _lastDiag.LANGUAGE_FOUNDATION = 'NOT_LOADED';
    }

    // SRUnderstanding is always called (it drives the response engine).
    // SRLanguage enriches it — does NOT replace it.
    var understood = global.SRUnderstanding.understand(
      // If language foundation expanded abbreviations, use the expanded text
      (langAnalysis && langAnalysis.expanded !== message) ? langAnalysis.expanded : message
    );

    // Enrich understood with language analysis where available
    if (langAnalysis) {
      // Prefer semantic intent if confidence is higher
      if (langAnalysis.intent && langAnalysis.intent !== 'UNKNOWN' &&
          langAnalysis.intentConf > 0.8 && understood.intent === 'UNKNOWN') {
        understood.intent = langAnalysis.intent;
      }
      // Merge entities
      if (langAnalysis.entities) {
        understood.entities = Object.assign({}, langAnalysis.entities, understood.entities);
      }
      // Attach language analysis for downstream use
      understood._langAnalysis = langAnalysis;
    }

    var context = global.SRContext.update(understood, message);

    // Feed this user turn into the language foundation context resolver.
    // This is REQUIRED for multi-turn pronoun/reference resolution — the
    // SRContextResolver builds its entity memory from these turn records.
    if (langFdn) {
      try { langFdn.initializeContextTurn('user', message, langAnalysis); } catch (_) {}
    }

    global.SRConversation.addTurn('user', message, understood.intent, understood.tone);

    // Gather context for model injection
    var adaptiveSnippets = p ? p.getAdaptiveSnippets(message, context) : [];
    var recentTurns      = global.SRConversation.getRecentTurns(8);

    // Knowledge retrieval (Checkpoint E) — only inject if relevant
    // Uses queryMultiple to capture up to 2 relevant entries (e.g. Radio AND Radio Studio).
    // For single-topic queries, only the top result is used to avoid over-stuffing.
    var knowledgeSnippet = null;
    var k = _knowledge();
    if (k && _capEnabled('knowledgeEnabled')) {
      _lastDiag.KNOWLEDGE_QUERY = 'YES';
      var kEntries = k.queryMultiple(message, 2);
      _lastDiag.KNOWLEDGE_MATCHES = kEntries ? kEntries.length : 0;
      if (kEntries && kEntries.length >= 1) {
        _lastDiag.KNOWLEDGE_CATEGORY = kEntries[0].category || null;
        // Rough score estimate: length of longest matching keyword
        var _topScore = 0;
        (kEntries[0].keywords || []).forEach(function (kw) {
          if (message.toLowerCase().indexOf(kw.toLowerCase()) !== -1) {
            _topScore = Math.max(_topScore, kw.length);
          }
        });
        _lastDiag.TOP_KNOWLEDGE_SCORE = _topScore;
      }
      if (kEntries && kEntries.length === 1) {
        knowledgeSnippet = kEntries[0].content;
      } else if (kEntries && kEntries.length >= 2) {
        // Two distinct relevant entries — combine them (e.g. Radio vs Radio Studio)
        // Only combine when they are different entries (avoid duplicate content)
        if (kEntries[0].content !== kEntries[1].content) {
          knowledgeSnippet = kEntries[0].content + '\n\n' + kEntries[1].content;
        } else {
          knowledgeSnippet = kEntries[0].content;
        }
      }
    } else {
      _lastDiag.KNOWLEDGE_QUERY = 'NO';
    }

    // ── PERSONAL MEMORY RETRIEVAL ─────────────────────────────────────────────
    // Retrieve relevant personal memory snippets when the user is authenticated.
    // Only for general conversation and questions — never for meta/system commands.
    // Bounded to 3 items maximum; never blocks.
    var memorySnippets = [];
    var mem = global.SNXShadowMemory;
    if (mem && _capEnabled('memoryEnabled') !== false &&
        (understood.intent === 'QUESTION' || understood.intent === 'GENERAL_CONVERSATION' ||
         understood.intent === 'FOLLOW_UP' || understood.intent === 'PROJECT_STATEMENT')) {
      try {
        mem.recall(message, function (r) {
          if (r && r.success && r.memories && r.memories.length) {
            memorySnippets = r.memories.slice(0, 3).map(function (m) {
              return { content: m.content || m.text || m };
            });
          }
        });
      } catch (_) {}
    }

    // ── REFERENCE RESOLUTION ──────────────────────────────────────────────────
    // Pull the resolved reference (if any) from langAnalysis so it can be fed
    // into the model context. This lets the model know what "it" refers to.
    var resolvedRef = null;
    if (langAnalysis && langAnalysis.referenceResolution && langAnalysis.referenceResolution.resolved) {
      resolvedRef = langAnalysis.referenceResolution.subject || null;
    } else if (context.recentSubjects && context.recentSubjects.length > 0 &&
               /\b(it|that|this|they|them|those|these)\b/i.test(message)) {
      // Fallback: use SRContext's recentSubjects if langAnalysis resolver couldn't help
      resolvedRef = context.recentSubjects[0];
    }

    var composeOpts = {
      recentTurns:      recentTurns,
      adaptiveSnippets: adaptiveSnippets,
      memorySnippets:   memorySnippets,
      knowledgeSnippet: knowledgeSnippet,
      // Language foundation enrichment passed through to the model context builder
      langAnalysis:     langAnalysis,
      resolvedRef:      resolvedRef,
      negation:         langAnalysis ? langAnalysis.negation : null,
      concepts:         langAnalysis ? langAnalysis.concepts : [],
      unknownWords:     langAnalysis ? langAnalysis.unknownWords : [],
    };

    _lastDiag.INTENT = understood.intent || 'UNKNOWN';
    _lastDiag.ADAPTIVE_CONTEXT_USED = (adaptiveSnippets && adaptiveSnippets.length > 0) ? 'YES' : 'NO';

    global.SRResponse.composeAsync(understood, context, composeOpts, function (response, source) {
      _lastResponseSource = source || 'DETERMINISTIC';

      // ── KNOWLEDGE SUBSTITUTION ────────────────────────────────────────────────
      // If static knowledge is relevant and the response is a generic/unhelpful
      // fallback from ANY source path, replace with the knowledge snippet.
      //
      // This applies to:
      //   DETERMINISTIC — response engine gave a "tell me more" style generic reply
      //   LEARNED       — learned brain had nothing; knowledge snippet should answer
      //   ERROR         — local model failed; knowledge can still provide an answer
      //   LOCAL_MODEL   — model is not ready; knowledge fills the gap
      //
      // Does NOT apply when the response is already a substantive answer.
      if (knowledgeSnippet &&
          (understood.intent === 'QUESTION' || understood.intent === 'GENERAL_CONVERSATION' ||
           understood.intent === 'UNKNOWN')) {
        var _shouldSubstitute = false;

        // Check for generic/fallback phrases from response pools
        var _genericPhrases = [
          "Tell me more", "I'm not sure I caught that", "Say more", "I want to follow",
          "I don't have reliable information", "I don't have enough context",
          "That's not something I have", "I don't know enough about",
          "I haven't learned anything about", "LOCAL MODEL ERROR",
          // Learned path generic patterns that should yield to static knowledge
          "Based on what you've told me:", "Here's what I have from our conversations",
          "Based on what you've shared with me:",
        ];
        _shouldSubstitute = _genericPhrases.some(function (f) {
          return response.indexOf(f) !== -1;
        });

        if (_shouldSubstitute) {
          response = knowledgeSnippet;
          _lastResponseSource = 'KNOWLEDGE';
        }
      }

      // ── Finalize diagnostics ─────────────────────────────────────────────────
      _lastDiag.KNOWLEDGE_USED  = (_lastResponseSource === 'KNOWLEDGE') ? 'YES' : 'NO';
      _lastDiag.RESPONSE_SOURCE = _lastResponseSource;

      global.SRConversation.addTurn('assistant', response, null, null);

      // Feed the assistant response back into the language foundation context resolver
      // so future pronoun resolution has access to both sides of the conversation.
      if (langFdn) {
        try { langFdn.initializeContextTurn('assistant', response, null); } catch (_) {}
      }

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
    _version: 'SR-V2-STAGE6',

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
    /**
     * Structured request wrapper — the canonical internal pipeline entry point.
     *
     * opts = {
     *   message:        string  (required)
     *   conversationId: string  (optional — reserved for future multi-conv routing)
     *   userId:         string  (optional — reserved for future per-user routing)
     *   projectId:      string  (optional — reserved for future project scoping)
     *   source:         string  (optional — caller label, e.g. "ui", "api", "test")
     *   options:        object  (optional — capability overrides for this request only)
     * }
     *
     * callback(responseString) — always async.
     */
    processRequest: function (opts, callback) {
      if (!opts || typeof opts !== 'object') {
        if (typeof callback === 'function') callback('Invalid request: opts must be an object.');
        return;
      }
      var msg = opts.message;
      if (!msg || typeof msg !== 'string' || msg.trim() === '') {
        if (typeof callback === 'function') callback("Say something — I'm listening.");
        return;
      }
      // Delegate to ask() — same pipeline, structured entry
      this.ask(msg.trim(), callback);
    },

    /**
     * Development / debug version of ask().
     * Runs the full pipeline then calls back with:
     *   { response: string, diagnostics: object, context: object }
     *
     * NEVER exposes private credentials, UIDs, or passwords.
     *
     * @param {string}   message
     * @param {function} callback — fn({ response, diagnostics, context })
     */
    debugAsk: function (message, callback) {
      var self = this;
      self.ask(message, function (response) {
        var diag = self.getLastDiagnostics();
        var ctx  = global.SRContext ? global.SRContext.getSnapshot() : {};
        if (typeof callback === 'function') {
          callback({
            response:    response,
            diagnostics: diag,
            context:     ctx,
          });
        }
      });
    },

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
      // Reset language foundation context on new conversation
      var langFdn = _langFdn();
      if (langFdn) {
        try { langFdn.resetContext(); } catch (_) {}
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

      // Website knowledge entry count (actual, not hardcoded false)
      var kEntryCount = 0;
      var kCategories = {};
      if (global.SRKnowledge) {
        try {
          var snsCat  = global.SRKnowledge.getByCategory('SNS');
          var creatorCat = global.SRKnowledge.getByCategory('CREATOR');
          var generalCat = global.SRKnowledge.getByCategory('GENERAL');
          kEntryCount = (snsCat ? snsCat.length : 0) +
                        (creatorCat ? creatorCat.length : 0) +
                        (generalCat ? generalCat.length : 0);
          kCategories = {
            SNS:     snsCat     ? snsCat.length     : 0,
            CREATOR: creatorCat ? creatorCat.length : 0,
            GENERAL: generalCat ? generalCat.length : 0,
          };
        } catch (_) {}
      }

      return {
        // Core identity
        version:     this._version,
        build:       this._version,
        initialized: _initialized,
        destroyed:   _destroyed,

        // System readiness flags
        API_READY:                _initialized && !_destroyed,
        LANGUAGE_FOUNDATION_READY: !!global.SRLanguage,
        KNOWLEDGE_READY:          !!global.SRKnowledge,
        KNOWLEDGE_LEARNER_READY:  !!global.SRKnowledgeLearner,
        PERSISTENCE_READY:        !!global.SRPersistence,
        LOCAL_MODEL_READY:        !!(global.SRLocalModel && modelStatus.state === 'READY'),
        VOICE_READY:              !!(global.SRVoice && voiceStatus.state !== 'UNAVAILABLE'),
        TRANSLATION_READY:        !!global.SRTranslation,

        // Session
        turnCount:          _initialized ? global.SRConversation.getTurnCount() : 0,
        sessionContext:     context,
        lastResponseSource: _lastResponseSource,

        // Legacy / always-stable values
        workersAICalls:   0,       // Always 0 — no Workers AI
        legacyAIRestored: false,

        // Website knowledge status (real values)
        websiteKnowledge:      kEntryCount > 0,
        websiteKnowledgeCount: kEntryCount,
        websiteKnowledgeCategories: kCategories,

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

        // Connected modules
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

        // Stage 5/6: Language Foundation status
        languageFoundation: (function () {
          var lf = global.SRLanguage;
          if (!lf) return { loaded: false };
          try {
            var ls = lf.getLanguageStatus();
            return {
              loaded:          true,
              build:           ls.build,
              vocabularyCount: ls.vocabulary ? ls.vocabulary.totalEntries : 0,
              uniqueLemmas:    ls.vocabulary ? (ls.vocabulary.uniqueLemmas || 0) : 0,
              vocabLoaded:     ls.vocabulary ? ls.vocabulary.indexLoaded : false,
              subsystems:      ls.subsystems,
            };
          } catch (_) {
            return { loaded: true, error: 'status_unavailable' };
          }
        })(),

        // Stage 6: Last request diagnostics (copy, not live reference)
        lastDiagnostics: Object.assign({}, _lastDiag),

        responseEngine: {
          lastSource:      _lastResponseSource,
          modelState:      modelStatus.state,
          modelId:         modelStatus.modelId,
          deterministic:   _lastResponseSource === 'DETERMINISTIC',
          generative:      _lastResponseSource === 'LOCAL_MODEL',
          conversationContextTurns: _initialized ? global.SRConversation.getTurnCount() : 0,
        },
      };
    },

    /**
     * Return the diagnostics object from the most recent ask() call.
     * Safe — never exposes private data (UID, passwords, credentials).
     * @returns {object}
     */
    getLastDiagnostics: function () {
      return Object.assign({}, _lastDiag);
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
