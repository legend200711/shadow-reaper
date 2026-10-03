/**
 * Shadow Reaper PWA — Service Worker
 * Build: SR-SW-2
 *
 * DESIGN PRINCIPLES:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. App-shell only caching — HTML/CSS/JS/icons for offline shell launch.
 * 2. NO AI responses are ever served from cache.
 *    AI requires network; if offline, the app shell loads but the user sees
 *    an honest offline/connection error — never a fabricated AI response.
 * 3. Safe update strategy — NO skipWaiting + forced-reload.
 *    Updates are applied only when all tabs are closed (standard behavior),
 *    preventing reload loops and interrupted conversations.
 * 4. No stale-HTML trap — index.html uses network-first strategy.
 *    Falls back to cached shell only when offline.
 * 5. External API calls (Cloudflare, Firebase) always go to the network.
 *    Cache bypasses those origins entirely.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GITHUB PAGES HOSTING:
 *   This service worker is scoped to /shadow-reaper/ (the GitHub Pages repo
 *   subdirectory). All cache keys use /shadow-reaper/ prefixed paths.
 *   Cache namespace: sr-shell-v3 (Shadow Reaper-specific — does NOT conflict
 *   with any other PWA on the same domain).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// Shadow Reaper-specific cache namespace.
// Bump version here to force a full re-cache on next visit.
// IMPORTANT: Incrementing CACHE_VERSION purges the OLD shell cache but does NOT
// affect SR_MODEL_CACHE_VERSION. Model assets (downloaded by WebLLM and
// Transformers.js into IndexedDB/Cache Storage under their own namespaces)
// are managed independently so an app-shell update never forces a re-download
// of the ~200-600MB model weights.
const CACHE_VERSION = 'sr-shell-v16';

// Inference runtime model assets use a separate cache namespace.
// Bumping this version forces a re-download of model weights on next session.
// Only bump when the model ID changes or model corruption is suspected.
// WebLLM manages its own cache internally (IndexedDB + Cache Storage under
// 'webllm-model-*' keys). Transformers.js caches under 'transformers-cache'.
// This constant documents the separation policy but the SW does not
// pre-cache model files — they are cached by the runtime on first download.
const SR_MODEL_CACHE_VERSION = 'sr-model-v1';

// GitHub Pages subdirectory prefix.
// All app URLs are under this path.
const BASE = '/shadow-reaper';

// App-shell resources to pre-cache at install time.
// Paths are relative to the GitHub Pages subdirectory.
const APP_SHELL = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/icon-512.png',
  BASE + '/icons/apple-touch-icon.png',
  // Core JS modules (application logic)
  BASE + '/config/shadow-config.js',         // central endpoint config (API-first)
  BASE + '/sr-shadow-api-client.js',         // API-first primary conversation client
  BASE + '/sr-cloud-api.js',                 // offline queue + Cloudflare Worker sync
  BASE + '/shadow-reaper.js',
  BASE + '/sr-auth-ui.js',
  BASE + '/sr-pwa-state.js',
  BASE + '/snx-shadow-conv-history.js',
  BASE + '/snx-shadow-memory.js',
  BASE + '/snx-shadow-adaptive.js',
  BASE + '/config/environment.js',
  BASE + '/security/security-policy.js',
  BASE + '/security/web-research-guard.js',
  BASE + '/adapters/firebase-adapter.js',
  BASE + '/adapters/cloudflare-adapter.js',
  BASE + '/platform/sr-platform-detector.js',
  BASE + '/platform/sr-capability-manager.js',
  BASE + '/platform/sr-permission-manager.js',
  BASE + '/platform/sr-device-action-router.js',
  BASE + '/platform/adapters/sr-web-adapter.js',
  BASE + '/platform/adapters/sr-android-adapter.js',
  BASE + '/platform/adapters/sr-ios-adapter.js',
  BASE + '/history/sr-conversation-history.js',
  BASE + '/memory/sr-personal-memory.js',
  BASE + '/research/sr-web-research.js',
  BASE + '/research/sr-weather.js',
  BASE + '/research/sr-research-router.js',
  BASE + '/core/adaptive-brain.js',
  BASE + '/core/sr-conversational-cue.js',
  BASE + '/core/understanding-engine.js',
  BASE + '/core/context-engine.js',
  BASE + '/core/conversation-engine.js',
  BASE + '/core/response-engine.js',
  BASE + '/core/persistence-bridge.js',
  BASE + '/core/local-model.js',
  // Hybrid Inference Runtime (SR-INFERENCE-RUNTIME-1)
  BASE + '/core/sr-inference-runtime.js',
  BASE + '/knowledge/knowledge-engine.js',
  BASE + '/knowledge/sr-knowledge-learner.js',
  BASE + '/translation/translation-engine.js',
  BASE + '/voice/voice-engine.js',
  BASE + '/voice/sr-wake-name.js',
  BASE + '/voice/sr-conversation-session.js',
  BASE + '/voice/sr-voice-assistant.js',
  BASE + '/sr-feature-registry.js',
  BASE + '/firebase/sr-env-loader.js',
  BASE + '/firebase/firebase-config.js',
  BASE + '/platform/sr-native-diagnostics.js',
  BASE + '/global-learning/sr-global-learning.js',

  // ── Language Foundation JS — all local, zero internet required ────────────
  BASE + '/language/tokenizer/tokenizer.js',
  BASE + '/language/morphology/morphology.js',
  BASE + '/language/relationships/relationships.js',
  BASE + '/language/semantics/semantics.js',
  BASE + '/language/context/context-resolver.js',
  BASE + '/language/learning/language-learning.js',
  BASE + '/language/phrases/phrases.js',
  BASE + '/language/lexicon/sr-word-definitions.js',
  BASE + '/language/lexicon/sr-lexicon.js',
  BASE + '/language/sr-language.js',
  BASE + '/language/sr-number-intelligence.js',
  BASE + '/language/indexes/sense-index.js',
  BASE + '/language/sr-comprehension-index.js',

  // ── Language Foundation data — ~38MB total; cached once for offline use ───
  // NOTE: wordnet-index.json is ~27MB. It is cached here so that word
  // definitions, morphology, and semantic analysis work fully offline.
  // All other JSON indexes are small (< 8MB each).
  BASE + '/language/data/vocab-index.json',
  BASE + '/language/data/lemma-index.json',
  BASE + '/language/data/wordnet-index.json',

  // ── Connection + Offline State ────────────────────────────────────────────
  BASE + '/sr-connection-monitor.js',
  BASE + '/sr-offline-state.js',

  // ── Offline Capability State System ──────────────────────────────────────
  BASE + '/core/sr-capability-state.js',

  // ── Personality Engine ────────────────────────────────────────────────────
  BASE + '/core/personality-engine.js',
];

// Origins that must NEVER be served from cache.
// These are live network services where stale data would be wrong or break auth.
const BYPASS_ORIGINS = [
  'firebaseapp.com',
  'googleapis.com',
  'gstatic.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'cloudfunctions.net',
  'workers.dev',
  'pages.dev',
];

function _shouldBypass(url) {
  try {
    const u = new URL(url);
    // Always bypass non-GET requests are handled separately
    // Always bypass external API origins
    for (const origin of BYPASS_ORIGINS) {
      if (u.hostname.endsWith(origin)) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// ─── Install: pre-cache app shell ───────────────────────────────────────────
self.addEventListener('install', function (event) {
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // Add resources individually so a single 404 doesn't abort everything.
      return Promise.allSettled(
        APP_SHELL.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[SW] Could not cache:', url, err.message);
          });
        })
      );
    })
  );
  // Do NOT call self.skipWaiting() — prevents reload loops.
  // New SW waits until all existing tabs/windows are closed.
});

// ─── Activate: clean up old caches ───────────────────────────────────────────
// IMPORTANT: Only delete app-shell caches (sr-shell-*).
// Model caches (webllm-model-*, transformers-cache, sr-model-*) are managed
// by the inference runtimes and must NOT be deleted on shell update — that
// would force a full re-download of hundreds of MB of model weights.
self.addEventListener('activate', function (event) {
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          // Only delete old app-SHELL caches — preserve model caches
          var isOldShellCache = key.startsWith('sr-shell-') && key !== CACHE_VERSION;
          if (isOldShellCache) {
            console.log('[SW] Deleting old shell cache:', key);
            return caches.delete(key);
          }
          // Do NOT delete: webllm-model-*, transformers-cache, sr-model-*
          // These are managed by the inference runtimes and may be large.
        })
      );
    })
  );
  // Take control of already-open pages (safe — no forced reload).
  return self.clients.claim();
});

// ─── Fetch strategy ──────────────────────────────────────────────────────────
self.addEventListener('fetch', function (event) {
  const req = event.request;

  // Only handle GET requests; let everything else pass through
  if (req.method !== 'GET') return;

  // Bypass live API / Firebase / Cloudflare origins — always network
  if (_shouldBypass(req.url)) return;

  const url = new URL(req.url);

  // ── index.html: Network-first with cache fallback ──────────────────────────
  // Ensures users always get the latest HTML when online.
  // Falls back to cached shell when offline.
  // Match both /shadow-reaper/ and /shadow-reaper/index.html
  if (url.pathname === BASE + '/' || url.pathname === BASE + '/index.html') {
    event.respondWith(
      fetch(req)
        .then(function (response) {
          // Update cache with fresh response
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(req, clone);
            });
          }
          return response;
        })
        .catch(function () {
          // Offline — serve cached shell
          return caches.match(BASE + '/index.html').then(function (cached) {
            if (cached) return cached;
            // Last resort: return offline message in the shell's absence
            return new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8">' +
              '<meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<title>Shadow Reaper — Offline</title>' +
              '<style>body{background:#080c14;color:#e8edf5;font-family:system-ui,sans-serif;' +
              'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}' +
              'h1{font-size:2rem;margin-bottom:.5rem;}p{color:#5a6880;}' +
              '.note{margin-top:1rem;font-size:0.85rem;color:#3d4f68;}' +
              '</style></head>' +
              '<body><div><h1>&#9760;</h1><h1>Shadow Reaper</h1>' +
              '<p>You\'re offline.</p>' +
              '<p class="note">Local conversation, Language Foundation, memory, and personality<br>' +
              'are available. Live weather and research require internet.</p>' +
              '<p class="note">Reload to resume with cached app shell.</p>' +
              '</div></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
        })
    );
    return;
  }

  // ── App-shell resources: Cache-first with network fallback ─────────────────
  // Static JS/CSS/icons are served instantly from cache if available.
  // On a miss, fetch from network and cache for next time.
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;

      return fetch(req).then(function (response) {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(req, clone);
          });
        }
        return response;
      }).catch(function (err) {
        // Resource unavailable offline — let browser handle naturally
        console.warn('[SW] Fetch failed (offline?):', req.url, err.message);
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

// ─── Message handler ──────────────────────────────────────────────────────────
// Used to check SW version from the page without forced reloads.
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SR_SW_VERSION') {
    event.ports[0] && event.ports[0].postMessage({
      type: 'SR_SW_VERSION_REPLY',
      version: CACHE_VERSION,
      base: BASE,
    });
  }
});
