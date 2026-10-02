/**
 * cloudflare/worker/lib/cloud-auth.js
 * Shadow Reaper Cloud API — Firebase ID Token Verification
 *
 * Build: SR-CLOUD-API-1
 *
 * PURPOSE:
 *   Verifies Firebase ID tokens sent by the client (browser/PWA/APK).
 *
 *   The client obtains a Firebase ID token via firebase.auth().currentUser.getIdToken()
 *   and sends it as: Authorization: Bearer <id-token>
 *
 *   The Worker verifies the token using Google's public keys (fetched from
 *   the well-known endpoint and cached in the module's in-memory store for
 *   the lifetime of the Worker instance).
 *
 *   This is the ONLY way to establish which installation/user owns a request.
 *   The uid from the verified token is the authoritative identity — never
 *   trusted from the request body.
 *
 * SECURITY:
 *   - Tokens are verified cryptographically (RS256)
 *   - Expiry is checked
 *   - Issuer is checked against the configured project
 *   - The uid is extracted only from the verified token payload
 *   - No uid from request body, query, or path is trusted for authorization
 */

'use strict';

// Google public key endpoint for Firebase Auth ID tokens
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// In-memory cert cache. Workers are short-lived so this is reset frequently anyway.
let _certCache    = null;
let _certCacheExp = 0;

// ─── Public key fetch + cache ─────────────────────────────────────────────────

async function _getGoogleCerts() {
  const now = Date.now();
  if (_certCache && now < _certCacheExp) return _certCache;

  const resp = await fetch(GOOGLE_CERTS_URL);
  if (!resp.ok) throw new Error('Failed to fetch Google certs: ' + resp.status);

  // Respect Cache-Control max-age from Google's response
  const cc  = resp.headers.get('cache-control') || '';
  const ma  = cc.match(/max-age=(\d+)/);
  const ttl = ma ? parseInt(ma[1], 10) * 1000 : 3600 * 1000;

  _certCache    = await resp.json();
  _certCacheExp = now + ttl;
  return _certCache;
}

// ─── JWT parse ────────────────────────────────────────────────────────────────

function _parseJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT structure');
  function _decode(b64) {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded + '=='.slice((2 - padded.length * 3 & 3) % 3)));
  }
  return {
    header:    _decode(parts[0]),
    payload:   _decode(parts[1]),
    sigPart:   parts[0] + '.' + parts[1],
    signature: parts[2],
  };
}

// ─── Signature verification ───────────────────────────────────────────────────

async function _verifySignature(signingInput, signature, certPem) {
  // Convert PEM to ArrayBuffer
  const b64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);

  const key = await crypto.subtle.importKey(
    'spki', buf.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify'],
  );

  // Decode signature
  const sigB64  = signature.replace(/-/g, '+').replace(/_/g, '/');
  const sigBin  = atob(sigB64 + '=='.slice((2 - sigB64.length * 3 & 3) % 3));
  const sigBuf  = new Uint8Array(sigBin.length);
  for (let i = 0; i < sigBin.length; i++) sigBuf[i] = sigBin.charCodeAt(i);

  const encoder = new TextEncoder();
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBuf.buffer, encoder.encode(signingInput));
}

// ─── Main verify function ────────────────────────────────────────────────────

/**
 * Verify a Firebase ID token.
 *
 * @param {string} token      - The raw ID token from Authorization header
 * @param {string} projectId  - Firebase project ID (from env)
 * @returns {Promise<{ ok: boolean, uid?: string, reason?: string }>}
 */
async function verifyFirebaseIdToken(token, projectId) {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'No token provided.' };
  }

  let parsed;
  try {
    parsed = _parseJwt(token);
  } catch (e) {
    return { ok: false, reason: 'Malformed token.' };
  }

  const { header, payload, sigPart, signature } = parsed;

  // Check algorithm
  if (header.alg !== 'RS256') {
    return { ok: false, reason: 'Unexpected algorithm: ' + header.alg };
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return { ok: false, reason: 'Token expired.' };
  }

  // Check issued-at (allow 5 min clock skew)
  if (!payload.iat || payload.iat > now + 300) {
    return { ok: false, reason: 'Token iat is in the future.' };
  }

  // Check audience (must match project)
  if (payload.aud !== projectId) {
    return { ok: false, reason: 'Token aud does not match project.' };
  }

  // Check issuer
  const expectedIss = 'https://securetoken.google.com/' + projectId;
  if (payload.iss !== expectedIss) {
    return { ok: false, reason: 'Token iss invalid.' };
  }

  // Check subject (uid)
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length === 0) {
    return { ok: false, reason: 'Token has no subject.' };
  }

  // Fetch Google public keys
  let certs;
  try {
    certs = await _getGoogleCerts();
  } catch (e) {
    return { ok: false, reason: 'Could not fetch public keys.' };
  }

  const certPem = certs[header.kid];
  if (!certPem) {
    return { ok: false, reason: 'Unknown key ID: ' + header.kid };
  }

  // Verify signature
  let valid;
  try {
    valid = await _verifySignature(sigPart, signature, certPem);
  } catch (e) {
    return { ok: false, reason: 'Signature verification error.' };
  }

  if (!valid) {
    return { ok: false, reason: 'Invalid signature.' };
  }

  return { ok: true, uid: payload.sub };
}

/**
 * Extract bearer token from Authorization header.
 * @param {string|null} headerValue
 * @returns {string|null}
 */
function extractBearer(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const parts = headerValue.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  const token = parts[1];
  // Firebase ID tokens are typically 800–1200 chars; allow up to 4096
  if (!token || token.length < 20 || token.length > 4096) return null;
  return token;
}

export { verifyFirebaseIdToken, extractBearer };
