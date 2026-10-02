/**
 * cloudflare/worker/routes/cloud-health.js
 * Shadow Reaper Cloud API — GET /api/v1/health
 *
 * Build: SR-CLOUD-API-3
 *
 * Returns safe API status and performs real OAuth + Firestore connectivity checks.
 *
 * Firebase status values:
 *   unconfigured       — FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID binding absent
 *   configuration_error — binding exists but SA cannot be parsed or OAuth fails
 *   connected          — real Firestore REST request returned 200 or 404
 *   unavailable        — credentials ok, but Firestore returned an unexpected error
 *
 * NEVER exposes: private key, SA JSON, OAuth token, credentials of any kind.
 * DOES expose (on error): HTTP status codes, Google API error codes, sanitized messages.
 */

'use strict';

import { buildSuccess } from '../lib/cloud-errors.js';

// ── OAuth helper (inline — tracks each step independently from createAdminClient) ─

async function _getOAuthToken(sa) {
  const now   = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   sa.client_email,
    sub:   sa.client_email,
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  };

  const _b64url = (str) =>
    btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const _abToB64url = (buf) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const header  = _b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = _b64url(JSON.stringify(claim));
  const signing = header + '.' + payload;

  const b64 = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', buf.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );

  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signing));
  const jwt    = signing + '.' + _abToB64url(sigBuf);

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
  });

  const tokenBody = await tokenResp.json();
  if (!tokenResp.ok) {
    return {
      ok:          false,
      httpStatus:  tokenResp.status,
      errorCode:   tokenBody.error || 'unknown',
      errorDesc:   (tokenBody.error_description || '').slice(0, 200),
    };
  }
  return { ok: true, token: tokenBody.access_token };
}

// ── Handler ────────────────────────────────────────────────────────────────────

async function handleHealth(ctx) {
  const { requestId, env } = ctx;

  const serviceAccountPresent = !!(env && env.FIREBASE_SERVICE_ACCOUNT);
  const projectIdPresent       = !!(env && env.FIREBASE_PROJECT_ID);
  const projectId              = projectIdPresent ? env.FIREBASE_PROJECT_ID : null;

  let firebaseStatus = 'unconfigured';

  // Diagnostics shown to callers — safe only, no credentials
  const diagnostics = {
    serviceAccountBindingPresent: serviceAccountPresent,
    projectIdBindingPresent:      projectIdPresent,
  };

  if (!serviceAccountPresent || !projectIdPresent) {
    firebaseStatus = 'unconfigured';
  } else {
    // Step 1: Parse SA
    let sa = null;
    try {
      sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
      diagnostics.serviceAccountParseable = true;
    } catch (e) {
      firebaseStatus = 'configuration_error';
      diagnostics.initError = 'service_account_parse_failed';
    }

    if (sa) {
      // Step 2: OAuth
      let accessToken = null;
      try {
        const r = await _getOAuthToken(sa);
        if (r.ok) {
          diagnostics.oauth = 'connected';
          accessToken = r.token;
        } else {
          firebaseStatus          = 'configuration_error';
          diagnostics.oauth       = 'failed';
          diagnostics.oauthError  = r.errorCode;
          // Only include oauth error desc when there's a failure — safe Google error string
          if (r.errorDesc) diagnostics.oauthErrorDesc = r.errorDesc;
        }
      } catch (e) {
        firebaseStatus         = 'configuration_error';
        diagnostics.oauth      = 'failed';
        diagnostics.oauthError = (e.message || 'unknown').slice(0, 100);
      }

      // Step 3: Firestore
      if (accessToken) {
        const fsUrl =
          'https://firestore.googleapis.com/v1/projects/' + projectId +
          '/databases/(default)/documents/shadowReaperConfig/globalSettings';
        try {
          const fsResp = await fetch(fsUrl, {
            headers: { 'Authorization': 'Bearer ' + accessToken },
          });

          if (fsResp.status === 200 || fsResp.status === 404) {
            // 404 = document not yet created — connection is valid
            firebaseStatus      = 'connected';
            diagnostics.firestore = 'connected';
          } else {
            let errBody = null;
            try { errBody = await fsResp.json(); } catch (_) {}

            firebaseStatus        = 'unavailable';
            diagnostics.firestore = 'failed';
            diagnostics.firestoreHttpStatus  = fsResp.status;
            if (errBody && errBody.error) {
              diagnostics.firestoreErrorCode    = errBody.error.code;
              diagnostics.firestoreErrorStatus  = errBody.error.status;
              diagnostics.firestoreErrorMessage = (errBody.error.message || '')
                .slice(0, 300)
                .replace(/ya29\.[^\s"]+/g, '[REDACTED]')
                .replace(/Bearer [^\s"]+/g, '[REDACTED]');
            }
          }
        } catch (e) {
          firebaseStatus        = 'unavailable';
          diagnostics.firestore = 'failed';
          diagnostics.firestoreError = (e.message || 'fetch_error').slice(0, 100);
        }
      }
    }
  }

  // Inference availability — true when Workers AI binding is present.
  // SRInferenceRuntime reads this flag during health check to determine
  // whether to attempt /api/v1/inference or skip to emergency fallback.
  const inferenceAvailable = !!(env && env.AI && typeof env.AI.run === 'function');

  const body = buildSuccess({
    service:     'shadow-reaper-cloud-api',
    apiVersion:  'v1',
    status:      firebaseStatus === 'connected' ? 'ok' : 'degraded',
    firebase:    firebaseStatus,
    timestamp:   new Date().toISOString(),
    // inference: true  → Workers AI binding is present; SRInferenceRuntime will
    //                     attempt /api/v1/inference as the hosted runtime.
    // inference: false → AI binding absent; client skips to emergency fallback.
    inference:   inferenceAvailable,
    diagnostics,
  }, requestId);

  return {
    status: firebaseStatus === 'unavailable' ? 503 : 200,
    body,
  };
}

export { handleHealth };
