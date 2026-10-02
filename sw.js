/**
 * Shadow Reaper PWA — Service Worker
 * Build: SR-SW-1
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
 */

'use strict';

const CACHE_VERSION = 'sr-shell-v2';

// App-shell resources to pre-cache at install time.
// These are the minimal files needed to render the application skeleton.
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  // Core JS modules (application logic)
  '/shadow-reaper.js',
  '/sr-auth-ui.js',
  '/snx-shadow-conv-history.js',
  '/snx-shadow-memory.js',
  '/snx-shadow-adaptive.js',
  '/config/environment.js',
  '/security/security-policy.js',
  '/security/web-research-guard.js',
  '/security/sr-founder-security.js',
  '/adapters/firebase-adapter.js',
  '/adapters/cloudflare-adapter.js',
  '/adapters/founder-controls.js',
  '/platform/sr-platform-detector.js',
  '/platform/sr-capability-manager.js',
  '/platform/sr-permission-manager.js',
  '/platform/sr-device-action-router.js',
  '/platform/adapters/sr-web-adapter.js',
  '/platform/adapters/sr-android-adapter.js',
  '/platform/adapters/sr-ios-adapter.js',
  '/history/sr-conversation-history.js',
  '/memory/sr-personal-memory.js',
  '/global-learning/sr-global-learning.js',
  '/research/sr-web-research.js',
  '/core/adaptive-brain.js',
  '/core/understanding-engine.js',
  '/core/context-engine.js',
  '/core/conversation-engine.js',
  '/core/response-engine.js',
  '/core/persistence-bridge.js',
  '/core/local-model.js',
  '/knowledge/knowledge-engine.js',
  '/knowledge/sr-knowledge-learner.js',
  '/translation/translation-engine.js',
  '/voice/sr-wake-name.js',
  '/voice/voice-engine.js',
  '/sr-feature-registry.js',
  '/firebase/firebase-config.js',
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
  if (url.pathname === '/' || url.pathname === '/index.html') {
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
          return caches.match('/index.html').then(function (cached) {
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
    });
  }
});
