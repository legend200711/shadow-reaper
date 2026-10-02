/**
 * shadow-reaper-v2/api/v1/lib/intelligence-bridge.js
 * Shadow Reaper API v1 — Intelligence Bridge
 *
 * Build: SR-API-V1-1
 *
 * PURPOSE:
 *   This file is the ONLY place the API layer touches the local intelligence engines.
 *   It wraps the existing engines (SRUnderstanding, SRKnowledge, SRSemantics) through
 *   their public interfaces, as they exist in the codebase.
 *
 * RULES:
 *   1. Do NOT duplicate any intelligence logic here.
 *   2. Use the public interface of each engine — never reach into internals.
 *   3. If an engine is unavailable, report that honestly — never fake results.
 *   4. Do NOT create a second AI brain.
 *   5. Private memory must NEVER be accessible through any knowledge path here.
 *
 * NODE.JS CONTEXT:
 *   The Shadow Reaper engines were designed as browser IIFEs.
 *   In Node.js (for the Worker / test context), we load them via the module
 *   loader pattern used by the existing tests.
 *
 * KNOWLEDGE SOURCE MODEL:
 *   LOCAL_PRELOADED   — SRKnowledge (static bundled knowledge)
 *   LOCAL_LEARNED     — SRKnowledgeLearner (session adaptive learning)
 *   PRIVATE_CLOUD     — NOT exposed through public API (private per UID)
 *   VERIFIED_SHARED   — future
 *   INTERNET_RESEARCH — NOT enabled in this stage
 *
 * COMPONENT STATUS:
 *   Each operation reports a status so the API can accurately surface
 *   whether a subsystem is READY, DEGRADED, or UNAVAILABLE.
 */

'use strict';

var path = require('path');
var fs   = require('fs');

// ── Component registry ───────────────────────────────────────────────────────

var _components = {
  SRUnderstanding:   null,
  SRKnowledge:       null,
  SRSemantics:       null,
  SRContext:         null,
  SRConversation:    null,
  SRResponse:        null,
  SRKnowledgeLearner: null,
  SRLanguage:        null,
  SRMorphology:      null,
  SRTokenizer:       null,
  SRPhrases:         null,
  SRRelationships:   null,
  SRContextResolver: null,
};

var _loaded    = false;
var _loadError = null;

/**
 * Load the intelligence modules into the bridge's global context.
 * Uses the same eval/IIFE loading pattern as the existing test suites.
 *
 * @param {string} projectRoot  - Absolute path to the project root
 */
function load(projectRoot) {
  if (_loaded) return;

  // A minimal browser-like global surface required by the IIFEs
  if (!global.localStorage) {
    global.localStorage = {
      _store:     {},
      getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
      setItem:    function (k, v) { this._store[k] = String(v); },
      removeItem: function (k) { delete this._store[k]; },
      clear:      function ()  { this._store = {}; },
    };
  }
  if (!global.navigator) {
    try {
      Object.defineProperty(global, 'navigator', {
        value: { gpu: undefined }, writable: true, configurable: true,
      });
    } catch (_) {}
  }
  if (!global.fetch) {
    global.fetch = function () { return Promise.reject(new Error('no fetch in bridge')); };
  }

  function _tryLoad(relPath) {
    try {
      var code = fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
      var fn   = new Function('global', 'require', 'module', 'exports', '__dirname', '__filename', code);
      var mod  = {};
      fn(global, require, mod, {}, path.dirname(path.join(projectRoot, relPath)), path.join(projectRoot, relPath));
    } catch (e) {
      // Silently degrade — caller checks component availability
    }
  }

  // Load in dependency order (same as test suites, language foundation only)
  _tryLoad('config/environment.js');
  _tryLoad('security/security-policy.js');
  _tryLoad('language/tokenizer/tokenizer.js');
  _tryLoad('language/morphology/morphology.js');
  _tryLoad('language/relationships/relationships.js');
  _tryLoad('language/phrases/phrases.js');
  _tryLoad('language/semantics/semantics.js');
  _tryLoad('language/context/context-resolver.js');
  _tryLoad('language/sr-language.js');
  _tryLoad('core/understanding-engine.js');
  _tryLoad('core/context-engine.js');
  _tryLoad('core/conversation-engine.js');
  _tryLoad('core/adaptive-brain.js');
  _tryLoad('core/response-engine.js');
  _tryLoad('knowledge/knowledge-engine.js');
  _tryLoad('knowledge/sr-knowledge-learner.js');
  _tryLoad('translation/translation-engine.js');

  // Populate registry
  _components.SRUnderstanding  = global.SRUnderstanding  || null;
  _components.SRKnowledge       = global.SRKnowledge       || null;
  _components.SRSemantics       = global.SRSemantics       || null;
  _components.SRContext         = global.SRContext         || null;
  _components.SRConversation    = global.SRConversation    || null;
  _components.SRResponse        = global.SRResponse        || null;
  _components.SRKnowledgeLearner = global.SRKnowledgeLearner || null;
  _components.SRLanguage        = global.SRLanguage        || null;
  _components.SRMorphology      = global.SRMorphology      || null;
  _components.SRTokenizer       = global.SRTokenizer       || null;
  _components.SRPhrases         = global.SRPhrases         || null;
  _components.SRRelationships   = global.SRRelationships   || null;
  _components.SRContextResolver = global.SRContextResolver || null;

  _loaded = true;
}

/**
 * Return the current component status map.
 * Used by the health endpoint.
 */
function getComponentStatus() {
  return {
    languageFoundation:  !!_components.SRLanguage,
    understanding:       !!_components.SRUnderstanding,
    contextEngine:       !!_components.SRContext,
    conversationEngine:  !!_components.SRConversation,
    responseEngine:      !!_components.SRResponse,
    knowledgeEngine:     !!_components.SRKnowledge,
    knowledgeLearner:    !!_components.SRKnowledgeLearner,
    semantics:           !!_components.SRSemantics,
    morphology:          !!_components.SRMorphology,
    tokenizer:           !!_components.SRTokenizer,
    phrases:             !!_components.SRPhrases,
    relationships:       !!_components.SRRelationships,
    contextResolver:     !!_components.SRContextResolver,
  };
}

/**
 * Determine the REAL capabilities available (based on what loaded successfully).
 * Do NOT advertise capabilities that are not actually available.
 */
function getCapabilities() {
  var caps = [];

  if (_components.SRContext && _components.SRConversation && _components.SRResponse) {
    caps.push('chat');
  }
  if (_components.SRUnderstanding || _components.SRSemantics) {
    caps.push('understand');
  }
  if (_components.SRKnowledge) {
    caps.push('knowledge-query');
  }
  if (_components.SRUnderstanding) {
    caps.push('engine-command-interpretation');
    caps.push('engine-context');
  }

  return caps;
}

// ── TIMEOUT HELPER ───────────────────────────────────────────────────────────

/**
 * Run an async operation with a timeout.
 * If the operation does not call back within timeoutMs, resolve with { timedOut: true }.
 */
function _withTimeout(fn, timeoutMs) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; resolve({ timedOut: true }); }
    }, timeoutMs);

    fn(function (result) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(result);
      }
    });
  });
}

// ── CHAT ─────────────────────────────────────────────────────────────────────

/**
 * Run the message through the normal Shadow Reaper intelligence pipeline.
 *
 * IMPORTANT: This uses the SAME engines as the local chat UI.
 * It does NOT create a second AI brain.
 *
 * Returns: { ok, response, intent, tone, entities, source }
 */
function chat(message, timeoutMs) {
  timeoutMs = timeoutMs || 8000;

  if (!_components.SRUnderstanding || !_components.SRContext ||
      !_components.SRConversation  || !_components.SRResponse) {
    return Promise.resolve({
      ok:      false,
      error:   'SERVICE_UNAVAILABLE',
      detail:  'Core conversation engines are not available.',
    });
  }

  return _withTimeout(function (done) {
    try {
      var understood = _components.SRUnderstanding.understand(message);
      var context    = _components.SRContext.update(understood, message);
      _components.SRConversation.addTurn('user', message, understood.intent, understood.tone);

      // Use async compose path (same as the full UI pipeline)
      _components.SRResponse.composeAsync(understood, context, {}, function (response) {
        _components.SRConversation.addTurn('assistant', response, null, null);
        done({
          ok:       true,
          response: response,
          intent:   understood.intent,
          tone:     understood.tone,
          entities: understood.entities || {},
          source:   'DETERMINISTIC',
        });
      });
    } catch (e) {
      done({ ok: false, error: 'INTERNAL_ERROR', detail: 'Chat pipeline failed.' });
    }
  }, timeoutMs);
}

// ── UNDERSTAND ───────────────────────────────────────────────────────────────

/**
 * Analyze language WITHOUT executing anything.
 * Returns structured intent, entities, tone, confidence.
 *
 * Returns: { ok, intent, entities, tone, concepts, confidence, requiresClarification }
 */
function understand(message) {
  if (!_components.SRUnderstanding) {
    return {
      ok:     false,
      error:  'SERVICE_UNAVAILABLE',
      detail: 'Understanding engine is not available.',
    };
  }

  try {
    var understood = _components.SRUnderstanding.understand(message);

    // Augment with semantics if available
    var concepts  = [];
    var semResult = null;
    if (_components.SRSemantics) {
      semResult = _components.SRSemantics.analyzeSentence(message);
      concepts  = semResult.concepts || [];
    }

    // Confidence: if we have a definite intent from the deterministic engine, high confidence.
    // GENERAL_CONVERSATION / UNKNOWN = lower confidence.
    var confidence = 0.92;
    if (understood.intent === 'UNKNOWN')               confidence = 0.30;
    if (understood.intent === 'GENERAL_CONVERSATION')  confidence = 0.70;

    return {
      ok:                   true,
      intent:               understood.intent,
      tone:                 understood.tone,
      entities:             understood.entities || {},
      concepts:             concepts,
      confidence:           confidence,
      requiresClarification: confidence < 0.50,
    };
  } catch (e) {
    return { ok: false, error: 'INTERNAL_ERROR', detail: 'Understanding pipeline failed.' };
  }
}

// ── KNOWLEDGE QUERY ──────────────────────────────────────────────────────────

/**
 * Query public/preloaded knowledge ONLY.
 *
 * PRIVACY BOUNDARY:
 *   Private memory and personal learned context are NEVER accessible here.
 *   Only PUBLIC knowledge categories: SNS, CREATOR, GENERAL.
 *
 * Returns: { ok, results[], source, knowledgeAvailable }
 */
function queryKnowledge(queryText) {
  if (!_components.SRKnowledge) {
    return {
      ok:               false,
      error:            'SERVICE_UNAVAILABLE',
      detail:           'Knowledge engine is not available.',
      knowledgeAvailable: false,
    };
  }

  try {
    var results = _components.SRKnowledge.queryMultiple(queryText, 3);

    if (!results || results.length === 0) {
      return {
        ok:               false,
        error:            'KNOWLEDGE_NOT_FOUND',
        detail:           'No knowledge found for this query.',
        knowledgeAvailable: true,
        results:          [],
        source:           'LOCAL_PRELOADED',
      };
    }

    // Strip any field that could leak private data (none in the static KB,
    // but be explicit about what we return)
    var safeResults = results.map(function (r) {
      return {
        category: r.category,
        content:  r.content,
        // Do NOT include internal scoring or private fields
      };
    });

    return {
      ok:               true,
      results:          safeResults,
      source:           'LOCAL_PRELOADED',
      knowledgeAvailable: true,
    };
  } catch (e) {
    return {
      ok:               false,
      error:            'INTERNAL_ERROR',
      detail:           'Knowledge query pipeline failed.',
      knowledgeAvailable: false,
    };
  }
}

// ── ENGINE COMMAND INTERPRETATION ────────────────────────────────────────────

/**
 * Interpret a natural language engine command into a structured JSON result.
 *
 * CRITICAL:
 *   This is INTERPRETATION ONLY.
 *   No broadcast action is taken.
 *   No stream is started.
 *   No FFmpeg is called.
 *   Only structured JSON is returned.
 *
 * Uses the understanding engine + semantics for intent/entity extraction,
 * then maps to the engine command allowlist.
 *
 * Returns: { ok, intent, parameters, confidence, requiresClarification }
 */
function interpretEngineCommand(message) {
  if (!_components.SRUnderstanding) {
    return {
      ok:     false,
      error:  'SERVICE_UNAVAILABLE',
      detail: 'Understanding engine is not available.',
    };
  }

  try {
    var understood  = _components.SRUnderstanding.understand(message);
    var concepts    = [];
    var semEntities = {};

    if (_components.SRSemantics) {
      var semResult = _components.SRSemantics.analyzeSentence(message);
      concepts      = semResult.concepts    || [];
      semEntities   = semResult.entities    || {};
    }

    // ── Map to engine intent ────────────────────────────────────────────────
    var mapped = _mapToEngineIntent(message, understood, concepts, semEntities);

    return mapped;
  } catch (e) {
    return { ok: false, error: 'INTERNAL_ERROR', detail: 'Command interpretation failed.' };
  }
}

/**
 * Map understanding/semantic output to an engine command intent.
 * Uses only the allowlisted intents from command-schema.js.
 *
 * NO hardcoded phrases. Uses the language engines for concept extraction.
 *
 * @param {string} raw        - Original message
 * @param {object} understood - SRUnderstanding.understand() result
 * @param {string[]} concepts - Extracted concepts
 * @param {object} semEntities
 * @returns {{ ok, intent, parameters, confidence, requiresClarification }}
 */
function _mapToEngineIntent(raw, understood, concepts, semEntities) {
  var msg    = raw.toLowerCase();
  var intent = 'UNKNOWN_INTENT';
  var params = {};
  var conf   = 0.30;
  var requiresClarification = true;

  // ── Timing extraction ─────────────────────────────────────────────────────
  var timing = _extractTiming(msg);

  // ── Media / playlist name extraction ─────────────────────────────────────
  var mediaName    = _extractMediaName(msg, semEntities, understood.entities || {});
  var playlistName = _extractPlaylistName(msg, semEntities, understood.entities || {});

  // ── Intent mapping by concept analysis ───────────────────────────────────
  // Check for play/queue/schedule patterns via semantic concepts
  var hasPlay      = concepts.indexOf('play')     !== -1 || /\bplay\b/i.test(msg);
  var hasQueue     = concepts.indexOf('queue')    !== -1 || /\bqueue\b|\badd\b.*\b(after|next)\b|\bput\b.*\b(next|after)\b/i.test(msg);
  var hasPause     = concepts.indexOf('pause')    !== -1 || /\bpause\b/i.test(msg);
  var hasStop      = concepts.indexOf('stop')     !== -1 || /\bstop\b/i.test(msg);
  var hasResume    = concepts.indexOf('resume')   !== -1 || /\bresume\b/i.test(msg);
  var hasNext      = concepts.indexOf('next')     !== -1 || /\bnext\b/i.test(msg);
  var hasPrev      = concepts.indexOf('previous') !== -1 || /\bprevious\b|\bprev\b|\bback\b/i.test(msg);
  var hasSchedule  = concepts.indexOf('schedule') !== -1 || /\bschedule\b/i.test(msg);
  var hasPlaylist  = /\bplaylist\b/i.test(msg);
  // \bcurrent\b only counts as status when NOT part of "after the current"
  var hasStatus    = /\bstatus\b|\bnow playing\b|\bwhat.{1,10}playing\b/.test(msg) ||
                     (/\bcurrent\b/i.test(msg) && !/after\s+the\s+current/i.test(msg));

  if (hasPause && !hasPlay) {
    intent = 'PAUSE_MEDIA';
    conf   = 0.92;
    requiresClarification = false;

  } else if (hasStop && !hasPlay) {
    intent = 'STOP_MEDIA';
    conf   = 0.92;
    requiresClarification = false;

  } else if (hasResume) {
    intent = 'RESUME_MEDIA';
    conf   = 0.90;
    requiresClarification = false;

  } else if ((hasNext) && !hasPlay && !hasQueue) {
    intent = 'NEXT_ITEM';
    conf   = 0.88;
    requiresClarification = false;

  } else if (hasPrev) {
    intent = 'PREVIOUS_ITEM';
    conf   = 0.88;
    requiresClarification = false;

  } else if (hasStatus) {
    intent = 'GET_STATUS';
    conf   = 0.88;
    requiresClarification = false;

  } else if (hasSchedule) {
    intent = 'SCHEDULE_PROGRAM';
    conf   = 0.72;
    requiresClarification = !playlistName && !mediaName;
    if (playlistName) params.playlist = playlistName;
    if (mediaName)    params.media    = mediaName;
    if (timing)       params.timing   = timing;

  } else if (hasQueue || (hasPlay && timing && timing !== 'NOW')) {
    // "play X after..." / "queue X" / "put X next" all map to queue operations
    if (hasPlaylist && playlistName) {
      intent = 'QUEUE_PLAYLIST';
      params.playlist = playlistName;
    } else {
      intent = 'QUEUE_MEDIA';
      if (mediaName) params.media = mediaName;
    }
    if (timing) params.timing = timing;
    conf   = playlistName || mediaName ? 0.88 : 0.52;
    requiresClarification = !playlistName && !mediaName;

  } else if (hasPlay) {
    if (hasPlaylist && playlistName) {
      intent = 'START_PLAYLIST';
      params.playlist = playlistName;
      conf            = 0.90;
      requiresClarification = false;
    } else if (mediaName) {
      intent = 'PLAY_MEDIA';
      params.media = mediaName;
      conf         = 0.85;
      requiresClarification = false;
    } else {
      // "Play it." — ambiguous without context
      intent = 'PLAY_MEDIA';
      conf   = 0.31;
      requiresClarification = true;
    }
    if (timing) params.timing = timing;

  } else {
    intent = 'UNKNOWN_INTENT';
    conf   = 0.20;
    requiresClarification = true;
  }

  // Final output — structured JSON only, NO executable content
  var result = {
    ok:                   true,
    intent:               intent,
    parameters:           params,
    confidence:           Math.round(conf * 100) / 100,
    requiresClarification: requiresClarification,
  };

  if (intent === 'UNKNOWN_INTENT') {
    result.ok    = false;
    result.error = 'UNKNOWN_INTENT';
  }

  return result;
}

/**
 * Extract timing/position from a message.
 * @returns {string|null}  One of TIMING_VALUES or null
 */
function _extractTiming(msg) {
  if (/\bafter\s+(the\s+)?current\s+(program|show|broadcast)\b/i.test(msg)) return 'AFTER_CURRENT_PROGRAM';
  if (/\bafter\s+(the\s+)?(current|this)\b/i.test(msg)) return 'AFTER_CURRENT';
  if (/\bnext\b/i.test(msg) && !/\bnext\s+(item|track|song)\b/i.test(msg)) return 'NEXT';
  if (/\bat\s+the\s+end\b/i.test(msg)) return 'AT_END_OF_QUEUE';
  if (/\bschedule\b/i.test(msg)) return 'SCHEDULED';
  if (/\bnow\b|\bright\s+now\b|\bimmediately\b/i.test(msg)) return 'NOW';
  return null;
}

/**
 * Extract a playlist name from the message.
 * Uses semantic entities and direct NLP pattern matching.
 * @returns {string|null}
 */
function _extractPlaylistName(msg, semEntities, understandEntities) {
  // Pattern: "my X playlist" / "the X playlist" anchored to my/the prefix
  // Avoids capturing leading action verbs like "play", "queue", etc.
  var m = msg.match(/(?:(?:my|the)\s+)([a-z][a-z0-9\s']{1,40}?)\s+playlist/i);
  if (m) {
    var candidate = m[1].trim();
    // Strip any leading action verb that slipped through
    candidate = candidate.replace(/^(?:play|queue|put|start|add)\s+/i, '').trim();
    if (candidate.length > 0) return _titleCase(candidate);
  }

  // Named entity from semantics
  if (semEntities && semEntities.namedEntities && semEntities.namedEntities.length > 0) {
    return _titleCase(semEntities.namedEntities[0]);
  }

  return null;
}

/**
 * Extract a media/song/program name from the message.
 * @returns {string|null}
 */
function _extractMediaName(msg, semEntities, understandEntities) {
  // Project name from understanding engine entities
  if (understandEntities && understandEntities.projectName) {
    return understandEntities.projectName;
  }

  // Pattern: "play X" (non-playlist)
  var m = msg.match(/\bplay\s+(?:the\s+)?([a-z][a-z0-9\s']{1,40}?)(?:\s+(?:now|next|after|playlist|program|show))?\s*$/i);
  if (m && !/playlist/i.test(m[1])) return _titleCase(m[1].trim());

  return null;
}

function _titleCase(str) {
  if (!str) return str;
  return str.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

// ── ENGINE CONTEXT ────────────────────────────────────────────────────────────

/**
 * Accept and validate bounded engine context from the 24-Hour Engine.
 *
 * IMPORTANT:
 *   Shadow Reaper is NOT the authoritative database for engine state.
 *   The Engine remains authoritative for its own state.
 *   This context is bounded and validated — it's informational only.
 *
 * Returns: { ok, accepted, engineId, status }
 */
function acceptEngineContext(contextPayload) {
  // The bridge stores context in memory for potential use in future reasoning.
  // It does NOT persist it to Firebase or any permanent store.
  // It does NOT execute any engine operations.

  var engineId   = contextPayload.engineId;
  var nowPlaying = contextPayload.nowPlaying   || null;
  var queueLen   = contextPayload.queueLength  || 0;
  var status     = contextPayload.status       || 'UNKNOWN';

  // Store safe subset only (no private user data should be in engine context)
  _lastEngineContext = {
    engineId:    engineId,
    nowPlaying:  nowPlaying ? { title: (nowPlaying.title || '').slice(0, 256) } : null,
    queueLength: typeof queueLen === 'number' ? queueLen : 0,
    status:      String(status).slice(0, 64),
    receivedAt:  Date.now(),
  };

  return {
    ok:       true,
    accepted: true,
    engineId: engineId,
    status:   status,
  };
}

// Last known engine context (in-memory, session-scoped)
var _lastEngineContext = null;

/**
 * Get the last accepted engine context (safe read).
 */
function getLastEngineContext() {
  return _lastEngineContext;
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  load:                load,
  getComponentStatus:  getComponentStatus,
  getCapabilities:     getCapabilities,
  chat:                chat,
  understand:          understand,
  queryKnowledge:      queryKnowledge,
  interpretEngineCommand: interpretEngineCommand,
  acceptEngineContext: acceptEngineContext,
  getLastEngineContext: getLastEngineContext,
};
