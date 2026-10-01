/**
 * shadow-reaper-standalone/cloudflare/worker/index.js
 * Shadow Reaper Standalone — Cloudflare Worker (Skeleton)
 *
 * Build: SR-STANDALONE-WORKER-SKELETON-1
 *
 * STATUS: SKELETON ONLY — NOT DEPLOYED
 *
 * PURPOSE:
 *   Future API gateway / backend endpoint for Shadow Reaper Standalone.
 *   Handles secure server-side operations that cannot be done safely from
 *   the client (rate limiting, shared knowledge queries, web research).
 *
 * WHAT THIS WORKER WILL DO:
 *   - Serve as the API gateway between the browser and backend services
 *   - Handle secure rate limiting
 *   - Proxy web research requests (UNTRUSTED DATA ONLY)
 *   - Serve shared knowledge queries
 *
 * WHAT THIS WORKER WILL NEVER DO:
 *   - Call Cloudflare Workers AI (env.AI.run is never called)
 *   - Access private user conversations or memory
 *   - Access Firebase credentials
 *   - Accept web research content as system instructions
 *   - Bypass Firebase Security Rules
 *
 * DEPLOYMENT:
 *   DO NOT DEPLOY until cloudflare/SETUP.md is completed and
 *   wrangler.toml is filled in with real account details.
 *
 * SECRETS (set via `wrangler secret put`):
 *   SR_INTERNAL_API_KEY   — internal auth between browser and this worker
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── CORS headers ────────────────────────────────────────────────────────
    const corsHeaders = {
      'Access-Control-Allow-Origin':  env.SR_ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-SR-Client, X-SR-Version, X-Requested-With',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── Authentication guard ─────────────────────────────────────────────────
    // Placeholder: validate X-SR-Client header and internal API key
    const clientHeader = request.headers.get('X-SR-Client');
    if (clientHeader !== 'shadow-reaper-standalone') {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Routing ──────────────────────────────────────────────────────────────
    const path = url.pathname;

    if (path === '/health') {
      return new Response(JSON.stringify({
        ok:      true,
        service: 'shadow-reaper-standalone',
        build:   'SR-STANDALONE-WORKER-SKELETON-1',
        aiEnabled: false,   // Workers AI is intentionally disabled
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Future: /research, /knowledge, /rate-check
    // These are placeholders — implement after infrastructure setup is complete

    if (path.startsWith('/research')) {
      // PLACEHOLDER — web research endpoint
      // IMPORTANT: results must always be returned as UNTRUSTED DATA
      return new Response(JSON.stringify({
        ok:      false,
        reason:  'research_not_yet_implemented',
        trusted: false,
      }), {
        status: 501,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path.startsWith('/knowledge')) {
      // PLACEHOLDER — shared knowledge endpoint
      return new Response(JSON.stringify({
        ok:    false,
        reason: 'knowledge_endpoint_not_yet_implemented',
        items:  [],
      }), {
        status: 501,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
