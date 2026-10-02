/**
 * cloudflare/worker/cloud-api.js
 * Shadow Reaper — Cloud Data API Worker
 *
 * Build: SR-CLOUD-API-1
 *
 * STATUS: READY FOR CONFIGURATION — NOT YET DEPLOYED
 *
 * This is the dedicated Shadow Reaper cloud data API Worker.
 * It handles all cloud synchronization: memory, conversations, projects,
 * settings, adaptive profile, and sync operations.
 *
 * WHAT THIS WORKER DOES:
 *   - Verifies Firebase Anonymous Auth ID tokens (no login UI)
 *   - Routes /api/v1/* requests for cloud data operations
 *   - Reads/writes Firestore via Firebase Admin REST API
 *   - Enforces per-installation data isolation
 *   - Rate limits writes and expensive operations
 *   - Logs safe diagnostics (no private content, no credentials)
 *
 * WHAT THIS WORKER NEVER DOES:
 *   - Provide Shadow Reaper's intelligence or conversation ability
 *   - Make AI decisions (learning decisions stay local)
 *   - Use Cloudflare Workers AI (env.AI is never called)
 *   - Expose Firebase credentials or service account data
 *   - Return stack traces
 *   - Trust user-supplied ownerId for authorization
 *   - Log conversation content or private memory
 *
 * DEPLOYMENT REQUIREMENTS (manual steps — see cloudflare/SETUP.md):
 *   1. Set Worker name + account_id in wrangler-cloud.toml
 *   2. wrangler secret put FIREBASE_SERVICE_ACCOUNT  (paste full service account JSON)
 *   3. wrangler secret put FIREBASE_PROJECT_ID       (e.g. ffr3r3223)
 *   4. wrangler secret put SR_ALLOWED_ORIGINS        (JSON array of allowed origins)
 *   5. npx wrangler deploy --config cloudflare/wrangler-cloud.toml
 *
 * LOCAL DEVELOPMENT:
 *   This Worker cannot run with `api/v1/server.js` (different runtime).
 *   Use `wrangler dev --config cloudflare/wrangler-cloud.toml` for local Worker dev.
 *   Tests use mocked Firebase responses — see tests/cloud-api.test.js
 *
 * ARCHITECTURE:
 *   Shadow (local intelligence) ← LOCAL-FIRST, always available
 *   ↓ (when online, for sync only)
 *   This Worker (/api/v1/*)
 *   ↓
 *   Firebase / Firestore
 *
 * Firestore paths used by this Worker:
 *   users/{uid}/shadowReaperMemory/{memId}
 *   users/{uid}/shadowReaperConversations/{convId}
 *   users/{uid}/shadowReaperProjects/{projectId}
 *   users/{uid}/shadowReaperPreferences/settings
 *   users/{uid}/shadowReaperPreferences/adaptiveProfile
 *   shadowReaperConfig/globalSettings  (read-only health check)
 *
 * SECRETS (set via `wrangler secret put`, NEVER hardcoded):
 *   FIREBASE_SERVICE_ACCOUNT  — Full service account key JSON
 *   FIREBASE_PROJECT_ID       — Firebase project ID
 *   SR_ALLOWED_ORIGINS        — JSON array, e.g. ["https://your-domain.com"]
 */

import { dispatch } from './cloud-router.js';

// ── CORS ───────────────────────────────────────────────────────────────────────

/**
 * Build CORS headers for a given request origin.
 * Only allows origins listed in SR_ALLOWED_ORIGINS env secret.
 * Falls back to restrictive headers if not configured.
 *
 * @param {Request}  request
 * @param {object}   env
 * @returns {object} headers
 */
function _corsHeaders(request, env) {
  const requestOrigin = request.headers.get('origin') || '';
  let allowed = [];

  // Parse allowed origins from env secret (JSON array)
  if (env.SR_ALLOWED_ORIGINS) {
    try {
      allowed = JSON.parse(env.SR_ALLOWED_ORIGINS);
    } catch (e) {
      // Misconfigured — deny all cross-origin until fixed
    }
  }

  // In development mode, also allow localhost
  if (env.SR_ENV === 'development' || env.SR_ENV === 'dev') {
    allowed = allowed.concat(['http://localhost:3000', 'http://localhost:5000', 'http://localhost:4200', 'http://127.0.0.1:5500']);
  }

  const origin = allowed.includes(requestOrigin) ? requestOrigin : (allowed[0] || 'null');

  return {
    'Access-Control-Allow-Origin':      origin,
    'Access-Control-Allow-Methods':     'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type, Authorization, X-SR-Client',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age':           '86400',
    'Vary':                             'Origin',
  };
}

// ── Worker export ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = _corsHeaders(request, env);

    // ── Preflight ─────────────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── Dispatch ──────────────────────────────────────────────────────────────
    let result;
    try {
      result = await dispatch(request, env, ctx);
    } catch (e) {
      return new Response(JSON.stringify({
        ok:    false,
        error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      }), {
        status:  500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Response ──────────────────────────────────────────────────────────────
    const bodyText = result.body === null ? '' : JSON.stringify(result.body);
    const status   = result.status || 500;

    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': 'application/json',
    };

    // Add rate limit retry header if rate limited
    if (status === 429 && result.body && result.body.retryAfterMs) {
      responseHeaders['Retry-After'] = String(Math.ceil(result.body.retryAfterMs / 1000));
    }

    return new Response(bodyText, { status, headers: responseHeaders });
  },
};
