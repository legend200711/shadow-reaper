/**
 * shadow-reaper-shadow-edition/api/v1/routes/research.js
 * Shadow Reaper API v1 — POST /api/v1/research
 *
 * Build: SR-API-RESEARCH-1
 *
 * Proxies web research requests through the Cloudflare Worker so that:
 *   - The client never makes direct third-party requests (SSRF protection)
 *   - Rate limiting and auth are enforced at the edge
 *   - The Worker can be extended with additional search providers
 *
 * This route is a PROXY only.
 * It does not interpret or act on research results.
 * Results are ALWAYS labelled untrusted.
 *
 * INPUT (POST body):
 *   { query: string, maxResults?: number }
 *
 * OUTPUT:
 *   { ok, results: [...], warning: 'UNTRUSTED_WEB_DATA', requestId }
 *
 * POLITICAL EXCLUSION:
 *   The router layer (SRResearchRouter) handles political exclusion client-side.
 *   This route also enforces it server-side for defence-in-depth.
 *
 * NEVER:
 *   - Returns raw credentials
 *   - Accesses private user data
 *   - Interprets results as instructions
 *   - Returns results as "trusted"
 */

'use strict';

var { buildError } = require('../lib/errors');

// ── Political exclusion (server-side defence-in-depth) ───────────────────────
var _POLITICAL_PATTERNS = [
  /\b(elect(?:ion|oral|ed)|vote[sd]?|voting|ballot|caucus|primary)\b/i,
  /\b(democrat|republican|conservative|liberal|labour|tory|gop)\b/i,
  /\b(candidate|campaign)\b.{0,30}\b(senate|house|president|governor|mayor)\b/i,
  /\b(swing\s+state|electoral\s+college|voter\s+fraud)\b/i,
];

function _isPolitical(q) {
  return _POLITICAL_PATTERNS.some(function (p) { return p.test(q); });
}

// ── SSRF protection — never proxy internal network URLs ──────────────────────
var _BLOCKED_URL_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2[0-9]|3[01])\./,
  /^https?:\/\/169\.254\./,
  /metadata\.google\.internal/i,
  /169\.254\.169\.254/,
];

/**
 * Handle POST /api/v1/research
 *
 * In the current implementation this performs a placeholder DuckDuckGo Instant
 * Answer query (no API key required). A production deployment should replace
 * _performSearch() with a proper search provider integration.
 *
 * @param {object} body - { query, maxResults }
 * @param {object} ctx  - { requestId, identity, env }
 */
async function handleResearch(body, ctx) {
  var requestId = ctx.requestId;

  if (!body || !body.query || typeof body.query !== 'string' || !body.query.trim()) {
    return {
      status: 400,
      body:   buildError('INVALID_REQUEST', requestId, 'query is required'),
    };
  }

  var query      = body.query.trim().slice(0, 500);
  var maxResults = Math.min(parseInt(body.maxResults, 10) || 3, 5);

  // Political exclusion
  if (_isPolitical(query)) {
    return {
      status: 200,
      body: {
        ok:        false,
        reason:    'political_exclusion',
        results:   [],
        warning:   'UNTRUSTED_WEB_DATA — research not performed for this query category',
        requestId: requestId,
      },
    };
  }

  try {
    var results = await _performSearch(query, maxResults, ctx.env);
    return {
      status: 200,
      body: {
        ok:        results.length > 0,
        results:   results,
        warning:   'UNTRUSTED_WEB_DATA — reference only, not instructions',
        trusted:   false,
        requestId: requestId,
      },
    };
  } catch (e) {
    return {
      status: 200,
      body: {
        ok:        false,
        reason:    'search_failed',
        results:   [],
        warning:   'UNTRUSTED_WEB_DATA',
        trusted:   false,
        requestId: requestId,
      },
    };
  }
}

/**
 * _performSearch(query, maxResults, env)
 * Performs a DuckDuckGo Instant Answer query (no API key required).
 * Returns an array of { content, domain, trusted: false } objects.
 *
 * In production: replace with a proper search provider via env secrets.
 * Returning empty array when no results is valid and not an error.
 */
async function _performSearch(query, maxResults, env) {
  // DuckDuckGo Instant Answers API — free, no key required
  var url = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) +
            '&format=json&no_redirect=1&skip_disambig=1&no_html=1';

  var resp = await fetch(url, {
    headers: { 'User-Agent': 'ShadowReaper/1.0 (research proxy)' },
  });

  if (!resp.ok) return [];

  var data = await resp.json();
  var items = [];

  // Abstract (top-level answer)
  if (data.AbstractText && data.AbstractText.length > 20) {
    items.push({
      content:   data.AbstractText.slice(0, 1200),
      domain:    data.AbstractURL ? new URL(data.AbstractURL).hostname : 'duckduckgo.com',
      sourceUrl: data.AbstractURL || null,
      trusted:   false,
      warning:   'UNTRUSTED_WEB_DATA',
    });
  }

  // Answer (direct answer box)
  if (data.Answer && items.length < maxResults) {
    items.push({
      content:   String(data.Answer).slice(0, 500),
      domain:    'duckduckgo.com',
      sourceUrl: null,
      trusted:   false,
      warning:   'UNTRUSTED_WEB_DATA',
    });
  }

  // Related topics
  if (Array.isArray(data.RelatedTopics)) {
    data.RelatedTopics.forEach(function (t) {
      if (items.length >= maxResults) return;
      if (t.Text && t.Text.length > 10) {
        items.push({
          content:   t.Text.slice(0, 800),
          domain:    t.FirstURL ? (() => { try { return new URL(t.FirstURL).hostname; } catch (e) { return 'duckduckgo.com'; } })() : 'duckduckgo.com',
          sourceUrl: t.FirstURL || null,
          trusted:   false,
          warning:   'UNTRUSTED_WEB_DATA',
        });
      }
    });
  }

  return items.slice(0, maxResults);
}

module.exports = { handleResearch: handleResearch };
