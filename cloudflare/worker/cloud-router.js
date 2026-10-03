/**
 * cloudflare/worker/cloud-router.js
 * Shadow Reaper Cloud API — Request Router
 *
 * Build: SR-CLOUD-API-2 (API-first migration: chat, identity, clear-data)
 *
 * Routes all /api/v1/* requests to the appropriate cloud handler.
 * Framework-agnostic: works inside the Cloudflare Worker runtime only
 * (uses ES modules / Worker globals).
 *
 * ARCHITECTURE:
 *   1. Parse path + method
 *   2. Match route (static or parameterized)
 *   3. Authenticate (Firebase ID token for protected routes)
 *   4. Rate limit
 *   5. Dispatch to handler
 *   6. Return { status, body }
 *
 * PUBLIC ROUTES (no auth):
 *   GET /api/v1/health
 *
 * ALL OTHER ROUTES:
 *   Require a valid Firebase ID token in Authorization: Bearer <token>
 *   The uid from the verified token is the authoritative identity.
 */

'use strict';

import { createAdminClient }        from './lib/firebase-admin.js';
import { verifyFirebaseIdToken, verifyDeviceToken, extractBearer } from './lib/cloud-auth.js';
import { buildError, statusFor }    from './lib/cloud-errors.js';
import { check as rateCheck }       from './lib/cloud-rate-limiter.js';
import { logRequest, logFirebaseFailure, logAuthFailure, logRateLimit } from './lib/cloud-logger.js';

import { handleHealth }             from './routes/cloud-health.js';
import { listMemory, createMemory, getMemory, patchMemory, deleteMemory } from './routes/cloud-memory.js';
import { listConversations, createConversation, getConversation, patchConversation, deleteConversation } from './routes/cloud-conversations.js';
import { listProjects, createProject, getProject, patchProject, deleteProject } from './routes/cloud-projects.js';
import { getSettings, putSettings } from './routes/cloud-settings.js';
import { getAdaptiveProfile, putAdaptiveProfile } from './routes/cloud-adaptive-profile.js';
import { handleSync }               from './routes/cloud-sync.js';

// ── Internet capability routes (Build: SR-CLOUD-INTERNET-1) ──────────────────
import { handleWeather }            from './routes/cloud-weather.js';
import { handleElectronicsResearch } from './routes/cloud-electronics.js';

// ── Inference route (Build: SR-CLOUD-INFERENCE-STUB-1) ───────────────────────
import { handleInference }          from './routes/cloud-inference.js';

// ── API-first routes (Build: SR-CLOUD-API-2) ─────────────────────────────────
// Primary conversation endpoint — the stable doorway into Shadow Reaper
import { handleChat }               from './routes/cloud-chat.js';
// Device identity management — no visible login
import { handleIdentity, handleRevokeIdentity } from './routes/cloud-identity.js';
// Clear My Shadow Data
import { handleClearData }          from './routes/cloud-clear-data.js';

// ─── Request ID ───────────────────────────────────────────────────────────────

function _genRequestId() {
  const ts  = Date.now().toString(36);
  const rnd = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return 'src_' + ts + '_' + rnd;
}

// ─── Route matching ────────────────────────────────────────────────────────────

/**
 * Match a path against a pattern, extracting named params.
 * Pattern: '/api/v1/memory/:id'
 * Returns: { matched: true, params: { id: '...' } } or { matched: false }
 */
function _matchPath(pattern, path) {
  const patParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patParts.length !== pathParts.length) return { matched: false };
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = pathParts[i];
    } else if (patParts[i] !== pathParts[i]) {
      return { matched: false };
    }
  }
  return { matched: true, params };
}

// ─── Route table ──────────────────────────────────────────────────────────────

const ROUTES = [
  // ── Health (public) ───────────────────────────────────────────────────────
  { method: 'GET',    pattern: '/api/v1/health',                  public: true,  handler: (b, ctx) => handleHealth(ctx) },

  // ── PRIMARY CONVERSATION ENDPOINT (API-first) ─────────────────────────────
  // POST /api/v1/chat — The stable doorway into Shadow Reaper.
  // Supports both Firebase ID tokens and Shadow device tokens.
  // Auth optional: falls back to session-only mode without memory persistence.
  { method: 'POST',   pattern: '/api/v1/chat',                    authOptional: true, handler: (b, ctx) => handleChat(b, ctx) },

  // ── Device Identity (API-first — no visible login) ────────────────────────
  // Establishes or restores a device session automatically.
  { method: 'POST',   pattern: '/api/v1/identity',                public: true,  handler: (b, ctx) => handleIdentity(b, ctx) },
  // Revoke device session (requires auth)
  { method: 'POST',   pattern: '/api/v1/identity/revoke',         handler: (b, ctx) => handleRevokeIdentity(b, ctx) },

  // ── Clear My Shadow Data (requires auth) ──────────────────────────────────
  { method: 'POST',   pattern: '/api/v1/clear-data',              handler: (b, ctx) => handleClearData(b, ctx) },

  // ── Inference (Build: SR-CLOUD-INFERENCE-STUB-1) ─────────────────────────
  // Public: anonymous access allowed (stub returns 503 until backend deployed)
  // Rate limited at router level to prevent abuse.
  { method: 'POST',   pattern: '/api/v1/inference',               public: true,  handler: (b, ctx) => handleInference(b, ctx) },

  // ── Internet capabilities (Build: SR-CLOUD-INTERNET-1) ───────────────────
  // Weather: public (no private data) — rate limited at edge
  { method: 'GET',    pattern: '/api/v1/weather',                 public: true,  handler: (b, ctx, _p, req) => handleWeather(new URL(req.url), ctx) },

  // Electronics research: requires auth (prevents abuse)
  { method: 'POST',   pattern: '/api/v1/research/electronics',    handler: (b, ctx) => handleElectronicsResearch(b, ctx) },

  // Memory
  { method: 'GET',    pattern: '/api/v1/memory',                  handler: (b, ctx) => listMemory(ctx) },
  { method: 'POST',   pattern: '/api/v1/memory',                  handler: (b, ctx) => createMemory(ctx, b) },
  { method: 'GET',    pattern: '/api/v1/memory/:id',              handler: (b, ctx, p) => getMemory(ctx, p.id) },
  { method: 'PATCH',  pattern: '/api/v1/memory/:id',              handler: (b, ctx, p) => patchMemory(ctx, p.id, b) },
  { method: 'DELETE', pattern: '/api/v1/memory/:id',              handler: (b, ctx, p) => deleteMemory(ctx, p.id) },

  // Conversations
  { method: 'GET',    pattern: '/api/v1/conversations',           handler: (b, ctx) => listConversations(ctx) },
  { method: 'POST',   pattern: '/api/v1/conversations',           handler: (b, ctx) => createConversation(ctx, b) },
  { method: 'GET',    pattern: '/api/v1/conversations/:id',       handler: (b, ctx, p) => getConversation(ctx, p.id) },
  { method: 'PATCH',  pattern: '/api/v1/conversations/:id',       handler: (b, ctx, p) => patchConversation(ctx, p.id, b) },
  { method: 'DELETE', pattern: '/api/v1/conversations/:id',       handler: (b, ctx, p) => deleteConversation(ctx, p.id) },

  // Projects
  { method: 'GET',    pattern: '/api/v1/projects',                handler: (b, ctx) => listProjects(ctx) },
  { method: 'POST',   pattern: '/api/v1/projects',                handler: (b, ctx) => createProject(ctx, b) },
  { method: 'GET',    pattern: '/api/v1/projects/:id',            handler: (b, ctx, p) => getProject(ctx, p.id) },
  { method: 'PATCH',  pattern: '/api/v1/projects/:id',            handler: (b, ctx, p) => patchProject(ctx, p.id, b) },
  { method: 'DELETE', pattern: '/api/v1/projects/:id',            handler: (b, ctx, p) => deleteProject(ctx, p.id) },

  // Settings
  { method: 'GET',    pattern: '/api/v1/settings',                handler: (b, ctx) => getSettings(ctx) },
  { method: 'PUT',    pattern: '/api/v1/settings',                handler: (b, ctx) => putSettings(ctx, b) },

  // Adaptive Profile
  { method: 'GET',    pattern: '/api/v1/adaptive-profile',        handler: (b, ctx) => getAdaptiveProfile(ctx) },
  { method: 'PUT',    pattern: '/api/v1/adaptive-profile',        handler: (b, ctx) => putAdaptiveProfile(ctx, b) },

  // Sync
  { method: 'POST',   pattern: '/api/v1/sync',                    handler: (b, ctx) => handleSync(ctx, b) },
];

// ─── Main dispatch ─────────────────────────────────────────────────────────────

/**
 * Dispatch a cloud API request.
 *
 * @param {Request}  request  - Cloudflare Worker Request
 * @param {object}   env      - Worker env bindings
 * @param {object}   ctx      - Worker execution context
 * @returns {Promise<{ status: number, body: object, requestId: string }>}
 */
async function dispatch(request, env, workerCtx) {
  const requestId = _genRequestId();
  const startMs   = Date.now();
  const url       = new URL(request.url);
  const method    = request.method.toUpperCase();
  const path      = url.pathname;

  // ── CORS preflight (handled upstream, but guard here too) ──────────────────
  if (method === 'OPTIONS') {
    return { status: 204, body: null, requestId };
  }

  // ── Route matching ─────────────────────────────────────────────────────────
  let matchedRoute  = null;
  let matchedParams = {};

  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const m = _matchPath(route.pattern, path);
    if (m.matched) {
      matchedRoute  = route;
      matchedParams = m.params;
      break;
    }
  }

  if (!matchedRoute) {
    const body = buildError('ENDPOINT_NOT_FOUND', requestId);
    logRequest({ requestId, method, path, status: 404, latencyMs: Date.now() - startMs });
    return { status: 404, body, requestId };
  }

  // ── Authentication ─────────────────────────────────────────────────────────
  // Supports two auth mechanisms:
  //   1. Firebase Anonymous ID token (existing clients — backward compatible)
  //   2. Shadow device token (API-first — 64-char hex, issued by /api/v1/identity)
  //
  // authOptional routes (e.g. /api/v1/chat): auth attempted but failure doesn't
  // block the request — the handler runs without uid/adminClient (session-only).
  let uid         = null;
  let adminClient = null;

  const isPublic   = !!matchedRoute.public;
  const isOptional = !!matchedRoute.authOptional;

  if (!isPublic) {
    const authHeader = request.headers.get('authorization');
    const token      = extractBearer(authHeader);

    if (!token) {
      if (isOptional) {
        // No token — run without identity (session-only mode for chat)
      } else {
        logAuthFailure(requestId, 'missing_token');
        logRequest({ requestId, method, path, status: 401, latencyMs: Date.now() - startMs, event: 'auth_failure' });
        return { status: 401, body: buildError('UNAUTHORIZED', requestId), requestId };
      }
    } else {
      // Try to build admin client first (needed for device token verification)
      let tempAdmin = null;
      const projectId = env.FIREBASE_PROJECT_ID;

      if (projectId) {
        try {
          tempAdmin = await createAdminClient(env);
        } catch (_) {
          // Admin client creation failed — only a problem for protected routes
        }
      }

      let authResult = null;

      // ── Try Shadow device token (64 hex chars) ──────────────────────────────
      if (token.length === 64 && /^[0-9a-f]+$/.test(token) && tempAdmin) {
        authResult = await verifyDeviceToken(token, tempAdmin);
      }

      // ── Try Firebase ID token (JWT format — 3 dot-separated parts) ──────────
      if (!authResult || !authResult.ok) {
        if (!projectId) {
          if (!isOptional) {
            logRequest({ requestId, method, path, status: 503, latencyMs: Date.now() - startMs, event: 'config_error' });
            return { status: 503, body: buildError('SERVICE_UNAVAILABLE', requestId, 'API not configured.'), requestId };
          }
        } else {
          try {
            authResult = await verifyFirebaseIdToken(token, projectId);
          } catch (e) {
            if (!isOptional) {
              logAuthFailure(requestId, 'verify_error');
              logRequest({ requestId, method, path, status: 503, latencyMs: Date.now() - startMs, event: 'auth_error' });
              return { status: 503, body: buildError('SERVICE_UNAVAILABLE', requestId), requestId };
            }
            authResult = { ok: false, reason: 'verify_error' };
          }
        }
      }

      if (authResult && authResult.ok) {
        uid = authResult.uid;
        // Reuse tempAdmin if we already created it (avoid double SA OAuth call)
        adminClient = tempAdmin;
      } else if (!isOptional) {
        logAuthFailure(requestId, (authResult && authResult.reason) || 'invalid_token');
        logRequest({ requestId, method, path, status: 401, latencyMs: Date.now() - startMs, event: 'auth_failure' });
        return { status: 401, body: buildError('UNAUTHORIZED', requestId), requestId };
      }
    }
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const identity = uid || 'anonymous';
  const rateResult = rateCheck(identity, method, path);
  if (!rateResult.allowed) {
    logRateLimit(requestId, identity.slice(0, 6), path);
    logRequest({ requestId, method, path, status: 429, latencyMs: Date.now() - startMs, event: 'rate_limited' });
    const errBody = buildError('RATE_LIMITED', requestId);
    errBody.retryAfterMs = rateResult.retryAfterMs;
    return { status: 429, body: errBody, requestId };
  }

  // ── Firebase admin client (for protected routes not yet initialized) ───────
  // For authOptional routes: adminClient may already be set from auth step above.
  // For protected routes: we need an admin client if auth succeeded.
  if (!matchedRoute.public && !isOptional && !adminClient) {
    try {
      adminClient = await createAdminClient(env);
    } catch (e) {
      logFirebaseFailure(requestId, 'init', e.constructor.name);
      logRequest({ requestId, method, path, status: 503, latencyMs: Date.now() - startMs, event: 'firebase_failure' });
      return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId), requestId };
    }
  }

  // For authOptional routes: if we have a uid but no adminClient yet, create one
  if (isOptional && uid && !adminClient) {
    try {
      adminClient = await createAdminClient(env);
    } catch (_) {
      // Non-fatal for optional-auth routes — handler will run without persistence
    }
  }

  // For public routes that still benefit from adminClient (e.g. /api/v1/identity):
  // Try to attach an admin client — handlers that don't need it simply ignore it.
  if (isPublic && !adminClient && (path === '/api/v1/identity')) {
    try {
      adminClient = await createAdminClient(env);
    } catch (_) {
      // Non-fatal — identity handler degrades gracefully to session-only
    }
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body = null;
  if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      logRequest({ requestId, method, path, status: 400, latencyMs: Date.now() - startMs });
      return { status: 400, body: buildError('INVALID_REQUEST', requestId, 'Content-Type must be application/json.'), requestId };
    }
    const rawText = await request.text();
    if (rawText && rawText.trim().length > 0) {
      // Oversized payload guard: 64KB max
      if (rawText.length > 65536) {
        logRequest({ requestId, method, path, status: 413, latencyMs: Date.now() - startMs });
        return { status: 413, body: buildError('PAYLOAD_TOO_LARGE', requestId), requestId };
      }
      // Dangerous key guard (catches __proto__ before JSON.parse may drop it)
      if (rawText.includes('"__proto__"') || rawText.includes('"constructor"') || rawText.includes('"prototype"')) {
        logRequest({ requestId, method, path, status: 400, latencyMs: Date.now() - startMs });
        return { status: 400, body: buildError('INVALID_REQUEST', requestId, 'Dangerous keys detected.'), requestId };
      }
      try {
        body = JSON.parse(rawText);
      } catch (e) {
        logRequest({ requestId, method, path, status: 400, latencyMs: Date.now() - startMs });
        return { status: 400, body: buildError('INVALID_REQUEST', requestId, 'Malformed JSON.'), requestId };
      }
    }
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────
  const handlerCtx = { requestId, uid, adminClient, env };
  let result;
  try {
    result = await matchedRoute.handler(body, handlerCtx, matchedParams, request);
  } catch (e) {
    logRequest({ requestId, method, path, status: 500, latencyMs: Date.now() - startMs, event: 'handler_error' });
    return { status: 500, body: buildError('INTERNAL_ERROR', requestId), requestId };
  }

  logRequest({ requestId, method, path, status: result.status, latencyMs: Date.now() - startMs });
  return { ...result, requestId };
}

export { dispatch };
