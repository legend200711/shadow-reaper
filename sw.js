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
const CACHE_VERSION = 'sr-shell-v3';

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
  BASE + '/core/adaptive-brain.js',
  BASE + '/core/understanding-engine.js',
  BASE + '/core/context-engine.js',
  BASE + '/core/conversation-engine.js',
  BASE + '/core/response-engine.js',
  BASE + '/core/persistence-bridge.js',
  BASE + '/core/local-model.js',
  BASE + '/knowledge/knowledge-engine.js',
  BASE + '/knowledge/sr-knowledge-learner.js',
  BASE + '/translation/translation-engine.js',
  BASE + '/voice/voice-engine.js',
  BASE + '/sr-feature-registry.js',
  BASE + '/firebase/firebase-config.js',
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
            // Last resort: return offline message in the shell's absence
            return new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8">' +
              '<meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<title>Shadow Reaper — Offline</title>' +
              '<style>body{background:#080c14;color:#e8edf5;font-family:system-ui,sans-serif;' +
              'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}' +
              'h1{font-size:2rem;margin-bottom:.5rem;}p{color:#5a6880;}</style></head>' +
              '<body><div><h1>&#9760;</h1><h1>Shadow Reaper</h1>' +
              '<p>You\'re offline. Please reconnect to use Shadow Reaper AI.</p></div></body></html>',
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
