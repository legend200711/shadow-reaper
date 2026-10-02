/**
 * shadow-reaper-v2/cloudflare/worker/index.js
 * Shadow Reaper Standalone — Cloudflare Worker (API v1)
 *
 * Build: SR-API-V1-1 (replaces SR-STANDALONE-WORKER-SKELETON-1)
 *
 * STATUS: READY FOR CONFIGURATION — NOT YET DEPLOYED
 *
 * This Worker serves as the production API gateway for Shadow Reaper.
 * All requests are dispatched through api/v1/router.js, which is the same
 * router used for local development.
 *
 * WHAT THIS WORKER DOES:
 *   - Routes all /api/v1/* requests through the Shadow Reaper API router
 *   - Enforces CORS headers
 *   - Provides authentication via SR_SERVICE_TOKENS secret
 *   - Rate limiting (augmented by Cloudflare's edge rate limiting)
 *
 * WHAT THIS WORKER NEVER DOES:
 *   - Call Cloudflare Workers AI (env.AI.run is never called)
 *   - Access private user conversations or memory
 *   - Access Firebase credentials
 *   - Return stack traces
 *   - Execute shell commands, FFmpeg, or broadcast operations
 *   - Bypass Firebase Security Rules
 *
 * DEPLOYMENT REQUIREMENTS (manual steps — see cloudflare/SETUP.md):
 *   1. Set account_id in wrangler.toml
 *   2. Set Worker name in wrangler.toml
 *   3. Set SR_SERVICE_TOKENS secret: wrangler secret put SR_SERVICE_TOKENS
 *   4. Set SR_ALLOWED_ORIGIN: wrangler secret put SR_ALLOWED_ORIGIN
 *   5. Run: npx wrangler deploy
 *
 * SECRETS (set via `wrangler secret put`, never hardcoded):
 *   SR_SERVICE_TOKENS   — JSON token registry for service authentication
 *   SR_ALLOWED_ORIGIN   — Allowed CORS origin (e.g. https://your-domain.com)
 *
 * DO NOT DEPLOY until SETUP.md is completed.
 */

// ── Note on Cloudflare Worker module resolution ───────────────────────────────
// Cloudflare Workers do NOT use Node.js require(). For production deployment,
// bundle this Worker with the api/v1/ files using:
//   npx wrangler deploy  (uses esbuild bundler via wrangler.toml)
// In local dev/test, use node api/v1/server.js instead.

import { dispatch } from '../../api/v1/router.js';

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const origin = env.SR_ALLOWED_ORIGIN || '*';

    // ── CORS headers ─────────────────────────────────────────────────────────
    const corsHeaders = {
      'Access-Control-Allow-Origin':  origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-SR-Client',
      'Access-Control-Max-Age':       '86400',
    };

    // ── Preflight ─────────────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let parsedBody = null;
    if (request.method === 'POST') {
      const rawText = await request.text();
      if (rawText && rawText.trim().length > 0) {
        try {
          parsedBody = JSON.parse(rawText);
        } catch (_) {
          return new Response(JSON.stringify({
            ok:    false,
            error: { code: 'INVALID_REQUEST', message: 'Malformed JSON in request body.' },
          }), {
            status:  400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // ── Normalize headers ─────────────────────────────────────────────────────
    const headers = {};
    for (const [k, v] of request.headers.entries()) {
      headers[k.toLowerCase()] = v;
    }

    // ── Dispatch ──────────────────────────────────────────────────────────────
    let result;
    try {
      result = await dispatch({
        method:  request.method,
        path:    url.pathname,
        headers: headers,
        body:    parsedBody,
        env:     env,
      });
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
    return new Response(bodyText, {
      status:  result.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
