/**
 * Shadow Reaper PWA — Service Worker
 * Build: SR-SW-3
 *
 * DESIGN PRINCIPLES:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. App-shell + core intelligence caching — all JS, Language Foundation,
 *    local model runtime configuration, and static assets are cached so that
 *    Shadow's core conversational intelligence works fully offline.
 * 2. Shadow's local model (WebLLM) uses the browser's Cache Storage API
 *    independently.  This SW does NOT cache the model weights directly (they
 *    are ~300 MB+) but DOES cache the WebLLM runtime JS so the model can be
 *    re-used from the browser's own model cache without a fresh download.
 * 3. Safe update strategy — NO skipWaiting + forced-reload.
 *    Updates are applied only when all tabs are closed (standard behavior),
 *    preventing reload loops and interrupted conversations.
 * 4. No stale-HTML trap — index.html uses network-first strategy.
 *    Falls back to cached shell only when offline.
 * 5. External API calls (Cloudflare, Firebase) always go to the network.
 *    Cache bypasses those origins entirely.
 * 6. Intelligence is LOCAL FIRST.  Weather and approved research need network;
 *    normal conversation, Language Foundation, and local model do NOT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GITHUB PAGES HOSTING:
 *   This service worker is scoped to /shadow-reaper/ (the GitHub Pages repo
 *   subdirectory). All cache keys use /shadow-reaper/ prefixed paths.
 *   Cache namespace: sre-shell-v3 (Shadow Reaper-specific — does NOT conflict
 *   with any other PWA on the same domain).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// Shadow Reaper-specific cache namespace.
// Bump version here to force a full re-cache on next visit.
const CACHE_VERSION = 'sre-shell-v3';

// GitHub Pages subdirectory prefix.
// All app URLs are under this path.
const BASE = '/shadow-reaper-edition';

// App-shell resources to pre-cache at install time.
// Paths are relative to the GitHub Pages subdirectory.
//
// CRITICAL: ALL Language Foundation JS files are included here so that
// Shadow's core intelligence (vocabulary, semantics, context, morphology,
// pronoun resolution, etc.) is fully available offline.
const APP_SHELL = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/icon-512.png',
  BASE + '/icons/apple-touch-icon.png',

  // ── Offline intelligence state manager (must load early) ──────────────────
  BASE + '/sr-offline-state.js',

  // ── Core JS modules (application logic) ───────────────────────────────────
  BASE + '/shadow-reaper.js',
  BASE + '/sr-auth-ui.js',
  BASE + '/sr-pwa-state.js',
  BASE + '/sr-connection-monitor.js',
  BASE + '/snx-shadow-conv-history.js',
  BASE + '/snx-shadow-memory.js',
  BASE + '/snx-shadow-adaptive.js',
  BASE + '/config/environment.js',
  BASE + '/security/security-policy.js',
  BASE + '/security/web-research-guard.js',
  BASE + '/security/sr-founder-security.js',
  BASE + '/adapters/firebase-adapter.js',
  BASE + '/adapters/cloudflare-adapter.js',
  BASE + '/adapters/founder-controls.js',
  BASE + '/platform/sr-platform-detector.js',
  BASE + '/platform/sr-capability-manager.js',
  BASE + '/platform/sr-permission-manager.js',
  BASE + '/platform/sr-device-action-router.js',
  BASE + '/platform/adapters/sr-web-adapter.js',
  BASE + '/platform/adapters/sr-android-adapter.js',
  BASE + '/platform/adapters/sr-ios-adapter.js',
  BASE + '/history/sr-conversation-history.js',
  BASE + '/memory/sr-personal-memory.js',
  BASE + '/global-learning/sr-global-learning.js',
  BASE + '/research/sr-web-research.js',
  BASE + '/core/adaptive-brain.js',
  BASE + '/core/understanding-engine.js',
  BASE + '/core/context-engine.js',
  BASE + '/core/conversation-engine.js',
  BASE + '/core/response-engine.js',
  BASE + '/core/personality-engine.js',
  BASE + '/core/persistence-bridge.js',
  BASE + '/core/local-model.js',
  BASE + '/knowledge/knowledge-engine.js',
  BASE + '/knowledge/sr-knowledge-learner.js',
  BASE + '/translation/translation-engine.js',
  BASE + '/voice/sr-wake-name.js',
  BASE + '/voice/voice-engine.js',
  BASE + '/voice/sr-voice-assistant.js',
  BASE + '/voice/sr-conversation-session.js',
  BASE + '/sr-feature-registry.js',
  BASE + '/sr-native-bridge.js',
  BASE + '/sr-setup-wizard.js',
  BASE + '/firebase/firebase-config.js',
  BASE + '/platform/adapters/sr-phone-adapter.js',
  BASE + '/platform/sr-caller-context.js',
  BASE + '/platform/sr-external-auth-guard.js',
  BASE + '/platform/sr-native-diagnostics.js',

  // ── Language Foundation — ALL subsystems required for offline intelligence ─
  // These files together form the ~112k-entry language understanding system.
  // Without them, Shadow can only do very basic deterministic responses.
  BASE + '/language/sr-language.js',
  BASE + '/language/sr-number-intelligence.js',
  BASE + '/language/tokenizer/tokenizer.js',
  BASE + '/language/morphology/morphology.js',
  BASE + '/language/phrases/phrases.js',
  BASE + '/language/relationships/relationships.js',
  BASE + '/language/semantics/semantics.js',
  BASE + '/language/context/context-resolver.js',
  BASE + '/language/learning/language-learning.js',
  BASE + '/language/lexicon/sr-lexicon.js',
  BASE + '/language/lexicon/sr-word-definitions.js',

  // Language Foundation data (vocab index, lemma index, freq index)
  // These are JSON data files loaded by the language subsystems.
  BASE + '/language/data/vocab-index.json',
  BASE + '/language/data/lemma-index.json',
  BASE + '/language/data/freq-index.json',
  BASE + '/language/data/wordnet-index.json',
];

// Origins that must NEVER be served from cache.
// These are live network services where stale data would be wrong or break auth.
// NOTE: esm.run / cdn.jsdelivr.net are the WebLLM CDN — we attempt to cache
// the runtime JS so it can be reused offline, but model weights themselves are
// managed by the browser's IndexedDB/Cache via WebLLM natively.
const BYPASS_ORIGINS = [
  'firebaseapp.com',
  'googleapis.com',
  'gstatic.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'cloudfunctions.net',
  // Weather / research APIs — always live
  'openweathermap.org',
  'api.openweathermap.org',
];

// Origins where we attempt cache-first for runtime JS (WebLLM CDN)
// but never cache model weight files (too large).
const WEBLLM_CDN_ORIGINS = [
  'esm.run',
  'cdn.jsdelivr.net',
  'unpkg.com',
];

// Extensions that indicate model weight shards — never cache these.
const MODEL_WEIGHT_EXTENSIONS = ['.bin', '.wasm', '.gguf', '.safetensors'];

function _isModelWeightFile(url) {
  try {
    var u = new URL(url);
    return MODEL_WEIGHT_EXTENSIONS.some(function (ext) {
      return u.pathname.endsWith(ext);
    });
  } catch (_) { return false; }
}

function _isWebLLMCDN(url) {
  try {
    var u = new URL(url);
    return WEBLLM_CDN_ORIGINS.some(function (origin) {
      return u.hostname === origin || u.hostname.endsWith('.' + origin);
    });
  } catch (_) { return false; }
}

function _shouldBypass(url) {
  try {
    var u = new URL(url);
    // Always bypass external API / Firebase origins
    for (var i = 0; i < BYPASS_ORIGINS.length; i++) {
      if (u.hostname === BYPASS_ORIGINS[i] ||
          u.hostname.endsWith('.' + BYPASS_ORIGINS[i])) return true;
    }
    // Always bypass model weight files (too large to cache in SW)
    if (_isModelWeightFile(url)) return true;
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
self.addEventListener('activate', function (event) {
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_VERSION) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
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
            // Last resort: return a shell that tells the truth — core intelligence works offline.
            // Weather and live research are unavailable; conversation is not.
            return new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8">' +
              '<meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<title>Shadow Reaper — Loading</title>' +
              '<style>body{background:#080c14;color:#e8edf5;font-family:system-ui,sans-serif;' +
              'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}' +
              'h1{font-size:2rem;margin-bottom:.5rem;}p{color:#5a6880;margin:.4rem 0;}' +
              '.note{font-size:12px;color:#3d4f68;margin-top:1.2rem;}</style></head>' +
              '<body><div><h1>&#9760;</h1><h1>Shadow Reaper</h1>' +
              '<p>Loading from local cache&hellip;</p>' +
              '<p class="note">Conversation, memory, and local intelligence are available offline.<br>' +
              'Weather and live research require a connection.</p>' +
              '</div></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
        })
    );
    return;
  }

  // ── WebLLM CDN runtime JS: Cache-first (model weights are bypassed above) ───
  // Cache the WebLLM runtime JS so it can run offline after first load.
  // Model weights are handled by WebLLM via IndexedDB — not this SW.
  if (_isWebLLMCDN(req.url) && !_isModelWeightFile(req.url)) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(req, clone);
            });
          }
          return response;
        }).catch(function () {
          return new Response('', { status: 503, statusText: 'Service Unavailable' });
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
          var clone = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(req, clone);
          });
        }
        return response;
      }).catch(function (err) {
        // Resource unavailable offline — let browser handle naturally
        console.warn('[SW] Fetch failed (offline?):', req.url, err && err.message);
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
