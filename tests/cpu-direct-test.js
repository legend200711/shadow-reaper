/**
 * tests/cpu-direct-test.js
 * ──────────────────────────────────────────────────────────────────────────────
 * DIRECT CPU INFERENCE TEST — Layer A / Layer B
 *
 * PURPOSE
 * -------
 * Verify that Transformers.js generates non-empty text BEFORE involving the
 * Shadow Reaper response pipeline.  Run this in a browser console or via a
 * local dev server (NOT Node — Transformers.js requires browser ESM / fetch).
 *
 * USAGE
 * -----
 *   1.  Start the dev server:   npm run dev
 *   2.  Open http://localhost:3000 in the browser.
 *   3.  Open DevTools → Console.
 *   4.  Paste this file's content into the console, OR
 *       load it via <script type="module" src="/tests/cpu-direct-test.js">
 *       in a dev-only HTML page.
 *
 * LAYER A — Direct Transformers.js (bypasses SRInferenceRuntime entirely)
 * LAYER B — SRInferenceRuntime.generate() (bypasses ShadowReaper ask())
 * LAYER C — ShadowReaper.ask() (full pipeline — tested manually in the app)
 *
 * The test outputs a structured diagnostic record to the console.
 *
 * NOTE: This file is dev-only.  It is NOT loaded by the main app.
 * ──────────────────────────────────────────────────────────────────────────────
 */

(async function cpuDirectTest() {
  'use strict';

  var TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

  // Models to test (primary first, fallback second)
  var MODELS = [
    'HuggingFaceTB/SmolLM2-360M-Instruct',
    'Xenova/TinyLlama-1.1B-Chat-v1.0',
  ];

  // Prompts for Layer A
  var LAYER_A_PROMPTS = [
    'Hello',
    'Tell me something funny.',
    'What is a video game?',
    'My project is called Blue Wolf. What project did I just tell you about?',
  ];

  var results = {
    timestamp:    new Date().toISOString(),
    layerA:       [],
    layerB:       null,
    errors:       [],
  };

  function log(msg) {
    var line = '[CPU-DIRECT-TEST] ' + msg;
    console.log(line);
  }

  // ── LAYER A: Direct Transformers.js ─────────────────────────────────────────

  log('=== LAYER A: Direct Transformers.js ===');

  var pipe = null;
  var loadedModelId = null;

  for (var mi = 0; mi < MODELS.length; mi++) {
    var modelId = MODELS[mi];
    log('Importing Transformers.js from: ' + TRANSFORMERS_CDN);

    try {
      var transformers = await import(TRANSFORMERS_CDN + '/dist/transformers.min.js')
        .catch(function () { return import(TRANSFORMERS_CDN); });

      if (transformers.env) {
        transformers.env.allowRemoteModels  = true;
        if (typeof transformers.env.allowLocalModels !== 'undefined') {
          transformers.env.allowLocalModels = false;
        }
      }

      var PipelineClass = transformers.pipeline || (transformers.default && transformers.default.pipeline);
      if (!PipelineClass) throw new Error('pipeline() not found in Transformers.js module');

      log('Loading model: ' + modelId + ' (this may take a minute on first load)…');

      pipe = await PipelineClass('text-generation', modelId, {
        quantized: true,
        progress_callback: function (p) {
          if (p && p.status === 'downloading') {
            log('  Download: ' + Math.round(p.progress || 0) + '% ' + (p.file || ''));
          }
        },
      });

      loadedModelId = modelId;
      log('Model loaded: ' + modelId);
      break;
    } catch (err) {
      log('Model load FAILED for ' + modelId + ': ' + (err && err.message));
      results.errors.push({ stage: 'model_load', model: modelId, error: err && err.message });
    }
  }

  if (!pipe) {
    log('ERROR: No model loaded. Cannot run Layer A tests.');
    results.layerA_status = 'NO_MODEL';
    console.table(results);
    return results;
  }

  log('Running Layer A prompts against: ' + loadedModelId);

  for (var pi = 0; pi < LAYER_A_PROMPTS.length; pi++) {
    var prompt = LAYER_A_PROMPTS[pi];
    var entry = {
      prompt:           prompt,
      model:            loadedModelId,
      rawResultType:    null,
      rawResultJSON:    null,
      extractedText:    null,
      extractedLength:  null,
      verified:         false,
      error:            null,
    };

    log('--- Prompt: ' + JSON.stringify(prompt));

    try {
      var rawResult = await pipe(
        [{ role: 'user', content: prompt }],
        {
          max_new_tokens: 128,
          min_new_tokens: 1,
          do_sample:      false,
          temperature:    1,
        }
      );

      entry.rawResultType = Array.isArray(rawResult)
        ? 'array[' + rawResult.length + ']'
        : (rawResult === null ? 'null' : typeof rawResult);

      try { entry.rawResultJSON = JSON.stringify(rawResult); } catch (_) { entry.rawResultJSON = '[not serializable]'; }

      // Extract text — mirrors _extractCPUText logic in sr-inference-runtime.js
      var text = '';
      if (Array.isArray(rawResult) && rawResult.length > 0) {
        var first = rawResult[0];
        var gt = first && first.generated_text;
        if (Array.isArray(gt)) {
          for (var i = gt.length - 1; i >= 0; i--) {
            if (gt[i] && gt[i].role === 'assistant') { text = gt[i].content || ''; break; }
          }
          if (!text && gt.length > 0) {
            var lastMsg = gt[gt.length - 1];
            text = (lastMsg && typeof lastMsg.content === 'string') ? lastMsg.content : '';
          }
        } else if (typeof gt === 'string') {
          text = gt;
        }
      }

      entry.extractedText   = text;
      entry.extractedLength = text.length;
      entry.verified        = text.trim().length > 0;

      log('  RAW TYPE    : ' + entry.rawResultType);
      log('  RAW JSON    : ' + (entry.rawResultJSON || '').substring(0, 200));
      log('  EXTRACTED   : ' + JSON.stringify(text));
      log('  LENGTH      : ' + text.length);
      log('  VERIFIED    : ' + entry.verified);

    } catch (err) {
      entry.error = { name: err && err.name, message: err && err.message };
      log('  ERROR: ' + (err && err.message));
    }

    results.layerA.push(entry);
  }

  var layerAAllPassed = results.layerA.every(function (e) { return e.verified; });
  results.layerA_status = layerAAllPassed ? 'PASS' : 'FAIL';

  log('');
  log('=== LAYER A RESULT: ' + results.layerA_status + ' ===');

  // ── LAYER B: SRInferenceRuntime.generate() ───────────────────────────────────

  log('');
  log('=== LAYER B: SRInferenceRuntime.generate() ===');

  var RT = (typeof window !== 'undefined' && window.SRInferenceRuntime)
        || (typeof global !== 'undefined' && global.SRInferenceRuntime)
        || null;

  if (!RT) {
    log('SRInferenceRuntime not found on window/global — skipping Layer B.');
    log('Load sr-inference-runtime.js before running this test.');
    results.layerB = { status: 'SKIPPED', reason: 'SRInferenceRuntime not loaded' };
  } else {
    var layerBEntries = [];

    var layerBMessages = [
      [{ role: 'user', content: 'Hello' }],
      [{ role: 'user', content: 'Tell me something funny.' }],
      [{ role: 'user', content: 'What is a video game?' }],
      [{ role: 'user', content: 'My project is called Blue Wolf.' },
       { role: 'assistant', content: 'Noted, Blue Wolf sounds like an interesting project!' },
       { role: 'user', content: 'What project did I just tell you about?' }],
    ];

    // Initialize first
    log('Calling RT.initialize()…');
    try { await RT.initialize(); } catch (e) { log('initialize() error: ' + e.message); }

    var status = RT.getStatus();
    log('SRInferenceRuntime status: ' + JSON.stringify(status));

    for (var qi = 0; qi < layerBMessages.length; qi++) {
      var msgs = layerBMessages[qi];
      var lastUser = msgs[msgs.length - 1].content;

      var bEntry = {
        prompt:       lastUser,
        runtimeUsed:  null,
        response:     null,
        verified:     false,
        error:        null,
      };

      log('--- RT.generate(): ' + JSON.stringify(lastUser));

      await new Promise(function (resolve) {
        RT.generate(msgs, { maxTokens: 128 }, function (err, text, runtimeUsed) {
          bEntry.runtimeUsed = runtimeUsed || null;
          if (err) {
            bEntry.error = { name: err.name, message: err.message };
            log('  ERROR: ' + err.message);
          } else {
            bEntry.response  = text;
            bEntry.verified  = !!(text && text.trim().length > 0);
            log('  RUNTIME    : ' + runtimeUsed);
            log('  RESPONSE   : ' + JSON.stringify(text));
            log('  VERIFIED   : ' + bEntry.verified);
          }
          resolve();
        });
      });

      layerBEntries.push(bEntry);
    }

    var layerBAllPassed = layerBEntries.every(function (e) { return e.verified; });
    results.layerB = {
      status:  layerBAllPassed ? 'PASS' : 'FAIL',
      entries: layerBEntries,
    };
    log('');
    log('=== LAYER B RESULT: ' + results.layerB.status + ' ===');
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  log('');
  log('══════════════════════════════════════');
  log('CPU DIRECT TEST SUMMARY');
  log('══════════════════════════════════════');
  log('LAYER A (Direct Transformers.js): ' + results.layerA_status);
  log('LAYER B (SRInferenceRuntime):     ' + (results.layerB ? results.layerB.status : 'SKIPPED'));
  log('LOADED MODEL: ' + loadedModelId);
  log('REQUESTED PRIMARY: HuggingFaceTB/SmolLM2-360M-Instruct');
  log('FALLBACK MODEL: Xenova/TinyLlama-1.1B-Chat-v1.0');
  log('══════════════════════════════════════');
  log('Full results object stored at: window.__cpuTestResults');

  if (typeof window !== 'undefined') window.__cpuTestResults = results;
  console.table(results.layerA.map(function (e) {
    return {
      prompt:    e.prompt.substring(0, 40),
      verified:  e.verified,
      length:    e.extractedLength,
      error:     e.error ? e.error.message : null,
    };
  }));

  return results;
})();
