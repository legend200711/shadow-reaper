/**
 * cloudflare/worker/lib/firebase-admin.js
 * Shadow Reaper Cloud API — Firebase Admin Connection
 *
 * Build: SR-CLOUD-API-1
 *
 * PURPOSE:
 *   Lightweight Firebase Admin REST client for Cloudflare Workers.
 *   Workers cannot use the firebase-admin Node.js SDK (no Node APIs).
 *   Instead, we use the Firebase REST API authenticated with a
 *   service-account JWT (OAuth 2.0 / Google's auth token endpoint).
 *
 * SECRETS REQUIRED (set via `wrangler secret put`):
 *   FIREBASE_SERVICE_ACCOUNT — JSON string of the full service account key
 *   FIREBASE_PROJECT_ID      — Firebase project ID (e.g. ffr3r3223)
 *
 * SECURITY:
 *   - Service account credentials NEVER appear in client responses.
 *   - OAuth tokens are short-lived (1 hour) and generated per-request batch.
 *   - Project ID is kept in env, not hardcoded.
 *
 * NEVER:
 *   - Put service account JSON in wrangler.toml [vars]
 *   - Return the service account or its token in any API response
 *   - Log credential values
 */

'use strict';

// ─── JWT / OAuth helpers ──────────────────────────────────────────────────────

/**
 * Build a Google OAuth2 access token from a service account key JSON.
 * Uses the Web Crypto API available in the Workers runtime.
 *
 * @param {object} serviceAccount - Parsed service account JSON
 * @returns {Promise<string>} access_token
 */
async function getAccessToken(serviceAccount) {
  const now   = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   serviceAccount.client_email,
    sub:   serviceAccount.client_email,
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.auth',
  };

  // Encode header + payload as Base64URL
  const header  = _b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = _b64url(JSON.stringify(claim));
  const signing = header + '.' + payload;

  // Import private key
  const privateKeyPem = serviceAccount.private_key;
  const keyData = _pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Sign
  const encoder  = new TextEncoder();
  const sigBuf   = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signing));
  const signature = _arrayBufferToB64url(sigBuf);
  const jwt       = signing + '.' + signature;

  // Exchange JWT for access token
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
  });
  if (!tokenResp.ok) {
    throw new Error('Firebase Admin: failed to obtain access token (' + tokenResp.status + ')');
  }
  const tokenData = await tokenResp.json();
  return tokenData.access_token;
}

// ─── Firestore REST helpers ───────────────────────────────────────────────────

/**
 * Firestore REST base URL for a project.
 */
function _firestoreBase(projectId) {
  return 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents';
}

/**
 * Convert a plain JS object to Firestore REST document fields format.
 * Supports: string, number, boolean, null, array, object, timestamp (Date).
 */
function toFirestoreFields(obj) {
  if (obj === null || obj === undefined) return { nullValue: null };
  if (typeof obj === 'string')  return { stringValue: obj };
  if (typeof obj === 'boolean') return { booleanValue: obj };
  if (typeof obj === 'number') {
    return Number.isInteger(obj) ? { integerValue: String(obj) } : { doubleValue: obj };
  }
  if (obj instanceof Date) return { timestampValue: obj.toISOString() };
  if (Array.isArray(obj)) {
    return { arrayValue: { values: obj.map(toFirestoreFields) } };
  }
  if (typeof obj === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
      fields[k] = toFirestoreFields(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(obj) };
}

/**
 * Convert Firestore REST document fields back to a plain JS object.
 */
function fromFirestoreFields(fieldValue) {
  if (fieldValue === undefined || fieldValue === null) return null;
  if ('nullValue'      in fieldValue) return null;
  if ('stringValue'    in fieldValue) return fieldValue.stringValue;
  if ('booleanValue'   in fieldValue) return fieldValue.booleanValue;
  if ('integerValue'   in fieldValue) return Number(fieldValue.integerValue);
  if ('doubleValue'    in fieldValue) return fieldValue.doubleValue;
  if ('timestampValue' in fieldValue) return fieldValue.timestampValue;
  if ('arrayValue'     in fieldValue) {
    const vals = (fieldValue.arrayValue.values || []);
    return vals.map(fromFirestoreFields);
  }
  if ('mapValue' in fieldValue) {
    return fromFirestoreDoc(fieldValue.mapValue);
  }
  return null;
}

/**
 * Convert a Firestore REST document (with `fields` key) to a plain JS object.
 */
function fromFirestoreDoc(doc) {
  if (!doc || !doc.fields) return {};
  const result = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    result[k] = fromFirestoreFields(v);
  }
  return result;
}

// ─── CRUD wrappers ─────────────────────────────────────────────────────────────

/**
 * Build a Firebase Admin client scoped to a project.
 *
 * @param {string} accessToken  - OAuth2 access token
 * @param {string} projectId    - Firebase project ID
 * @returns {object}            - { get, list, set, patch, delete, add }
 */
function buildAdminClient(accessToken, projectId) {
  const base    = _firestoreBase(projectId);
  const headers = {
    'Authorization': 'Bearer ' + accessToken,
    'Content-Type':  'application/json',
  };

  return {
    /** GET a single document. Returns parsed data or null. */
    async get(path) {
      const resp = await fetch(base + '/' + path, { headers });
      if (resp.status === 404) return null;
      if (!resp.ok) throw new Error('Firestore GET failed: ' + resp.status);
      const doc = await resp.json();
      return { id: _docId(doc.name), data: fromFirestoreDoc(doc), _name: doc.name };
    },

    /** List documents in a collection. Returns array of { id, data }. */
    async list(collectionPath, opts) {
      opts = opts || {};
      let url = base + '/' + collectionPath + '?pageSize=' + (opts.pageSize || 50);
      if (opts.orderBy) url += '&orderBy=' + opts.orderBy;
      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error('Firestore LIST failed: ' + resp.status);
      const body = await resp.json();
      if (!body.documents) return [];
      return body.documents.map(d => ({ id: _docId(d.name), data: fromFirestoreDoc(d) }));
    },

    /** Set (create or overwrite) a document. */
    async set(path, data) {
      const fields = {};
      for (const [k, v] of Object.entries(data)) fields[k] = toFirestoreFields(v);
      const resp = await fetch(base + '/' + path, {
        method:  'PATCH',
        headers,
        body:    JSON.stringify({ fields }),
      });
      if (!resp.ok) throw new Error('Firestore SET failed: ' + resp.status);
      return await resp.json();
    },

    /** Merge-patch a document (only provided fields). */
    async patch(path, data) {
      const fields = {};
      const updateMask = [];
      for (const [k, v] of Object.entries(data)) {
        fields[k] = toFirestoreFields(v);
        updateMask.push('updateMask.fieldPaths=' + encodeURIComponent(k));
      }
      const url  = base + '/' + path + '?' + updateMask.join('&');
      const resp = await fetch(url, {
        method:  'PATCH',
        headers,
        body:    JSON.stringify({ fields }),
      });
      if (!resp.ok) throw new Error('Firestore PATCH failed: ' + resp.status);
      return await resp.json();
    },

    /** Add a new document to a collection (auto-ID). */
    async add(collectionPath, data) {
      const fields = {};
      for (const [k, v] of Object.entries(data)) fields[k] = toFirestoreFields(v);
      const resp = await fetch(base + '/' + collectionPath, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ fields }),
      });
      if (!resp.ok) throw new Error('Firestore ADD failed: ' + resp.status);
      const doc = await resp.json();
      return { id: _docId(doc.name), data: fromFirestoreDoc(doc) };
    },

    /** Delete a document. */
    async delete(path) {
      const resp = await fetch(base + '/' + path, { method: 'DELETE', headers });
      if (resp.status === 404) return;  // already gone — treat as success
      if (!resp.ok) throw new Error('Firestore DELETE failed: ' + resp.status);
    },
  };
}

// ─── Init helper ──────────────────────────────────────────────────────────────

/**
 * Create a ready-to-use Firestore admin client from Worker env.
 * Throws if credentials are not configured.
 *
 * @param {object} env - Worker env bindings
 * @returns {Promise<object>} - Firebase admin client
 */
async function createAdminClient(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT secret not set.');
  }
  if (!env.FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID not set.');
  }
  let sa;
  try {
    sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }
  const accessToken = await getAccessToken(sa);
  return buildAdminClient(accessToken, env.FIREBASE_PROJECT_ID);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function _docId(name) {
  if (!name) return null;
  const parts = name.split('/');
  return parts[parts.length - 1];
}

function _b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function _arrayBufferToB64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function _pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export { createAdminClient, fromFirestoreDoc, toFirestoreFields };
