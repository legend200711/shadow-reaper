/**
 * shadow-reaper-v2/core/sr-model-adapter.js
 * Shadow Reaper — Shadow Model Adapter
 *
 * Build: SR-MODEL-ADAPTER-1
 *
 * Exposes: window.SRModelAdapter
 *
 * PURPOSE:
 *   One standardized Shadow model interface.
 *
 *   Shadow's application code calls SRModelAdapter.generate() — never a
 *   specific vendor API. The adapter decides which runtime executes.
 *
 * INTERFACE:
 *   SRModelAdapter.generate({
 *     messages,        // { role: 'system'|'user'|'assistant', content: string }[]
 *     context,         // Shadow context object
 *     knowledge,       // knowledge snippet string | null
 *     personality,     // personality context object | null
 *     constraints,     // constraints array | null
 *     maxTokens,       // optional override
 *     temperature,     // optional override
 *   }, callback)
 *
 *   callback(error, text, runtimeUsed)
 *
 * RUNTIME PRIORITY ORDER:
 *   1. Shadow-controlled runtime (SRInferenceRuntime — WebGPU / CPU local / Shadow API)
 *   2. Deterministic emergency fallback (SRResponse.compose)
 *
 * IMPORTANT:
 *   The hosted AI path (Cloudflare Workers AI via Shadow API) is ONE OPTION
 *   within the adapter. It is NOT a permanent dependency. When a Shadow-
 *   controlled local/CPU runtime is available, the adapter prefers it.
 *
 *   When SHADOW_STANDALONE_TEST=true is set (window.SHADOW_STANDALONE_TEST
 *   or process.env.SHADOW_STANDALONE_TEST), the Shadow API runtime is
 *   disabled and Shadow operates with local intelligence only.
 *
 * MODEL OWNERSHIP NOTE:
 *   Shadow Reaper's ARCHITECTURE (orchestration, reasoning, context, memory,
 *   personality, knowledge, tools) is Shadow-owned.
 *   The language model WEIGHTS used for generation may be from:
 *     - SmolLM2-360M (HuggingFaceTB, Apache 2.0) — freely redistributable
 *     - TinyLlama-1.1B (TinyLlama project, Apache 2.0) — freely redistributable
 *     - Cloudflare Workers AI (hosted) — third-party, removable
 *
 * Zero external calls beyond what the selected runtime already makes.
 * Zero Workers AI calls in this adapter itself.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-MODEL-ADAPTER-1';

  // ─── Runtime identifiers (mirrors SRInferenceRuntime) ─────────────────────
  var RUNTIME = {
    WEBGPU:           'webgpu-local',
    CPU:              'cpu-local',
    SHADOW_API:       'shadow-api',
    DETERMINISTIC:    'deterministic',
    EMERGENCY:        'emergency-fallback',
  };

  // ─── Standalone test mode detection ───────────────────────────────────────
  // When enabled, the Shadow API runtime is suppressed.

  function _isStandaloneMode() {
    // Check window global flag
    if (typeof global.SHADOW_STANDALONE_TEST !== 'undefined') {
      return !!global.SHADOW_STANDALONE_TEST;
    }
    // Check process.env (Node.js / test environments)
    if (typeof process !== 'undefined' && process.env && process.env.SHADOW_STANDALONE_TEST) {
      return process.env.SHADOW_STANDALONE_TEST === 'true' || process.env.SHADOW_STANDALONE_TEST === '1';
    }
    return false;
  }

  // ─── Internal state ────────────────────────────────────────────────────────

  var _generateCount    = 0;
  var _lastRuntimeUsed  = null;
  var _lastLatencyMs    = 0;
  var _standaloneMode   = false;  // can be set programmatically

  // ─── enableStandaloneMode() / disableStandaloneMode() ────────────────────

  function enableStandaloneMode() {
    _standaloneMode = true;
    console.log('[SRModelAdapter] STANDALONE MODE ENABLED — Shadow API runtime suppressed.');
  }

  function disableStandaloneMode() {
    _standaloneMode = false;
    console.log('[SRModelAdapter] Standalone mode disabled — all runtimes available.');
  }

  function isStandalone() {
    return _standaloneMode || _isStandaloneMode();
  }

  // ─── _getInferenceRuntime() ───────────────────────────────────────────────
  function _getInferenceRuntime() {
    return global.SRInferenceRuntime || null;
  }

  // ─── _getResponseEngine() ────────────────────────────────────────────────
  function _getResponseEngine() {
    return global.SRResponse || null;
  }

  // ─── _getLocalModel() ────────────────────────────────────────────────────
  function _getLocalModel() {
    return global.SRLocalModel || null;
  }

  // ─── _getAvailableRuntimes() ─────────────────────────────────────────────
  /**
   * Returns the list of runtimes available in priority order.
   * In standalone mode, 'shadow-api' is not included.
   */
  function _getAvailableRuntimes() {
    var runtime = _getInferenceRuntime();
    if (!runtime) {
      return [RUNTIME.DETERMINISTIC];
    }

    var status = runtime.getStatus ? runtime.getStatus() : {};
    var runtimes = [];

    if (status.webgpuReady)    runtimes.push(RUNTIME.WEBGPU);
    if (status.cpuReady)       runtimes.push(RUNTIME.CPU);
    if (status.shadowApiReady && !isStandalone()) runtimes.push(RUNTIME.SHADOW_API);

    if (runtimes.length === 0) {
      runtimes.push(RUNTIME.DETERMINISTIC);
    }

    return runtimes;
  }

  // ─── generate() ──────────────────────────────────────────────────────────
  /**
   * Primary generation interface.
   *
   * @param {GenerateOptions} opts
   * @param {function}        callback(error, text, runtimeUsed)
   *
   * GenerateOptions:
   *   messages      {Array}   — chat messages [{role, content}]
   *   context       {object}  — Shadow context (optional, for emergency fallback)
   *   knowledge     {string}  — knowledge snippet to inject (optional)
   *   personality   {object}  — personality context (optional)
   *   constraints   {Array}   — constraint strings (optional)
   *   maxTokens     {number}  — defaults to 256
   *   temperature   {number}  — defaults to 0.7
   *   understood    {object}  — SRUnderstanding result (for deterministic fallback)
   */
  function generate(opts, callback) {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    callback = callback || function () {};
    opts = opts || {};

    var startMs  = Date.now();
    var messages = opts.messages || [];
    var standalone = isStandalone();

    _generateCount++;

    // ── Standalone mode: skip hosted API entirely ────────────────────────────
    if (standalone) {
      _generateLocal(opts, function (err, text, runtime) {
        _lastLatencyMs  = Date.now() - startMs;
        _lastRuntimeUsed = runtime || RUNTIME.DETERMINISTIC;
        callback(err, text, _lastRuntimeUsed);
      });
      return;
    }

    // ── Normal mode: route through SRInferenceRuntime ────────────────────────
    var inferRuntime = _getInferenceRuntime();
    if (inferRuntime && messages.length > 0) {
      var runtimeOpts = {
        maxTokens:   opts.maxTokens   || 256,
        temperature: opts.temperature || 0.7,
      };

      inferRuntime.generate(messages, runtimeOpts, function (inferErr, inferText, runtimeUsed) {
        _lastLatencyMs   = Date.now() - startMs;
        _lastRuntimeUsed = runtimeUsed || RUNTIME.EMERGENCY;

        if (inferErr || !inferText || inferText.trim().length === 0) {
          // Fall through to deterministic
          _generateDeterministic(opts, function (detText) {
            callback(null, detText, RUNTIME.DETERMINISTIC);
          });
          return;
        }
        callback(null, inferText.trim(), runtimeUsed);
      });
      return;
    }

    // ── No runtime available — deterministic path ─────────────────────────────
    _generateDeterministic(opts, function (detText) {
      _lastLatencyMs   = Date.now() - startMs;
      _lastRuntimeUsed = RUNTIME.DETERMINISTIC;
      callback(null, detText, RUNTIME.DETERMINISTIC);
    });
  }

  // ─── _generateLocal() ────────────────────────────────────────────────────
  // Generates using local runtimes only (WebGPU / CPU). Never calls Shadow API.
  // Used in standalone mode.

  function _generateLocal(opts, callback) {
    var messages = opts.messages || [];

    // Check if inference runtime has a local runtime ready
    var inferRuntime = _getInferenceRuntime();
    if (inferRuntime && messages.length > 0) {
      var status = inferRuntime.getStatus ? inferRuntime.getStatus() : {};

      // Only proceed with local runtimes
      if (status.webgpuReady || status.cpuReady) {
        var runtimeOpts = {
          maxTokens:   opts.maxTokens   || 256,
          temperature: opts.temperature || 0.7,
        };

        inferRuntime.generate(messages, runtimeOpts, function (inferErr, inferText, runtimeUsed) {
          // In standalone mode, reject any result that came from shadow-api
          if (runtimeUsed === RUNTIME.SHADOW_API) {
            // This shouldn't happen (runtime was supposed to skip it) but guard anyway
            _generateDeterministic(opts, function (detText) {
              callback(null, detText, RUNTIME.DETERMINISTIC);
            });
            return;
          }
          if (inferErr || !inferText || inferText.trim().length === 0) {
            _generateDeterministic(opts, function (detText) {
              callback(null, detText, RUNTIME.DETERMINISTIC);
            });
            return;
          }
          callback(null, inferText.trim(), runtimeUsed);
        });
        return;
      }
    }

    // No local runtime available — deterministic fallback
    _generateDeterministic(opts, function (detText) {
      callback(null, detText, RUNTIME.DETERMINISTIC);
    });
  }

  // ─── _generateDeterministic() ────────────────────────────────────────────
  // Emergency fallback: uses SRResponse.compose() with understanding + context.
  // Always produces a coherent response even when all model runtimes are unavailable.

  function _generateDeterministic(opts, callback) {
    var response = _getResponseEngine();

    if (response && opts.understood && opts.context) {
      try {
        var det = response.compose(opts.understood, opts.context);
        if (det && det.length > 0) {
          callback(det);
          return;
        }
      } catch (_) {}
    }

    // Absolute last resort
    callback("I'm here — go ahead.");
  }

  // ─── getStatus() ─────────────────────────────────────────────────────────
  function getStatus() {
    var inferRuntime = _getInferenceRuntime();
    var runtimeStatus = inferRuntime && inferRuntime.getStatus ? inferRuntime.getStatus() : null;

    return {
      standaloneMode:    isStandalone(),
      generateCount:     _generateCount,
      lastRuntimeUsed:   _lastRuntimeUsed,
      lastLatencyMs:     _lastLatencyMs,
      availableRuntimes: _getAvailableRuntimes(),
      inferenceRuntime:  runtimeStatus,
      localModelReady:   !!(_getLocalModel() && _getLocalModel().getStatus().state === 'READY'),
    };
  }

  // ─── getDiagnostics() ────────────────────────────────────────────────────
  function getDiagnostics() {
    var status = getStatus();
    return Object.assign({}, status, {
      buildId:         BUILD_ID,
      standaloneTest:  _isStandaloneMode(),
      runtimes:        {
        webgpu:     RUNTIME.WEBGPU,
        cpu:        RUNTIME.CPU,
        shadowApi:  RUNTIME.SHADOW_API,
        deterministic: RUNTIME.DETERMINISTIC,
      },
    });
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRModelAdapter = {
    BUILD_ID:              BUILD_ID,
    RUNTIME:               RUNTIME,

    // Core API
    generate:              generate,
    isStandalone:          isStandalone,
    enableStandaloneMode:  enableStandaloneMode,
    disableStandaloneMode: disableStandaloneMode,
    getStatus:             getStatus,
    getDiagnostics:        getDiagnostics,

    // Available runtimes info
    getAvailableRuntimes:  _getAvailableRuntimes,
  };

})(typeof window !== 'undefined' ? window : global);
