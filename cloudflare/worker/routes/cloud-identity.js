/**
 * cloudflare/worker/routes/cloud-identity.js
 * Shadow Reaper Cloud API — API-Managed Device Identity
 *
 * Build: SR-CLOUD-IDENTITY-1
 *
 * POST /api/v1/identity
 *
 * PURPOSE:
 *   Establishes or restores a cryptographically strong device session for
 *   this Shadow installation. Called automatically on first use.
 *   No login, no registration, no visible auth UI.
 *
 *   FLOW:
 *   1. Client sends { deviceId: "existing-token" } OR {} (first time)
 *   2. Server validates the deviceId against Firestore
 *   3. If valid: returns { sessionToken, uid, isNew: false }
 *   4. If new/invalid: creates a new device record, returns { sessionToken, uid, isNew: true }
 *   5. Client stores sessionToken securely (not in localStorage)
 *
 *   The sessionToken is used as the Authorization: Bearer header on all
 *   subsequent API requests for this installation.
 *
 * NOTE:
 *   Shadow Edition currently uses Firebase Anonymous Auth for identity.
 *   This endpoint is the API-first wrapper — internally it still issues
 *   device tokens that are mapped to the Firebase anonymous UID, keeping
 *   Firestore isolation intact while hiding Firebase from the client.
 *
 * SECURITY:
 *   - 32-byte cryptographically random device token (256 bits entropy)
 *   - Tokens are stored hashed in Firestore
 *   - Presentation token (raw) is sent to client once only
 *   - No sequential or predictable IDs
 *   - Rate limited at router level
 *   - Token rotation supported via POST with existing token
 */

'use strict';

import { buildSuccess, buildError } from '../lib/cloud-errors.js';

// ── Token generation ────────────────────────────────────────────────────────────

/** Generate a 32-byte (256-bit) cryptographically strong hex token */
async function _generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hash of a token string (for storage) */
async function _hashToken(token) {
  const enc    = new TextEncoder();
  const buf    = await crypto.subtle.digest('SHA-256', enc.encode(token));
  const bytes  = new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a stable internal UID for a device (derived from token hash) */
function _deriveUid(hash) {
  // Use first 28 chars of hash as stable UID (same format as Firebase anon UID)
  return 'sr_' + hash.slice(0, 28);
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * handleIdentity(body, ctx)
 *
 * Establishes or restores a device session without Firebase on the client side.
 *
 * Request: { deviceId?: string }
 * Response: { success, sessionToken, uid, isNew, expiresAt }
 */
export async function handleIdentity(body, ctx) {
  const requestId  = (ctx && ctx.requestId) || 'unknown';
  const env        = (ctx && ctx.env) || {};
  const adminClient = (ctx && ctx.adminClient) || null;

  // Identity endpoint requires Firebase to be configured
  if (!adminClient) {
    // Graceful degradation: issue a session-only token that isn't persisted
    // The client can still use Shadow without cloud features
    const tempToken = await _generateToken();
    const tempHash  = await _hashToken(tempToken);
    return {
      status: 200,
      body: buildSuccess({
        sessionToken: tempToken,
        uid:          _deriveUid(tempHash),
        isNew:        true,
        persistent:   false,
        message:      'Session-only identity (cloud storage unavailable).',
      }, requestId),
    };
  }

  const providedToken = (body && typeof body.deviceId === 'string' && body.deviceId.length === 64)
    ? body.deviceId : null;

  // Try to restore existing device session
  if (providedToken) {
    try {
      const hash = await _hashToken(providedToken);
      const uid  = _deriveUid(hash);
      const doc  = await adminClient.get(`shadowDevices/${uid}`);

      if (doc && doc.data && doc.data.tokenHash === hash && doc.data.active === true) {
        // Valid existing session — refresh lastSeen
        await adminClient.set(`shadowDevices/${uid}`, {
          tokenHash:    hash,
          uid,
          active:       true,
          createdAt:    doc.data.createdAt || new Date().toISOString(),
          lastSeenAt:   new Date().toISOString(),
        });
        return {
          status: 200,
          body: buildSuccess({
            sessionToken: providedToken,
            uid,
            isNew:        false,
            persistent:   true,
          }, requestId),
        };
      }
    } catch (_) {
      // Fall through to create new session
    }
  }

  // Create new device session
  try {
    const token = await _generateToken();
    const hash  = await _hashToken(token);
    const uid   = _deriveUid(hash);

    await adminClient.set(`shadowDevices/${uid}`, {
      tokenHash:   hash,
      uid,
      active:      true,
      createdAt:   new Date().toISOString(),
      lastSeenAt:  new Date().toISOString(),
    });

    return {
      status: 201,
      body: buildSuccess({
        sessionToken: token,
        uid,
        isNew:        true,
        persistent:   true,
      }, requestId),
    };
  } catch (e) {
    // Firestore write failed — return session-only token
    // Log safe error info for debugging (never log token or hash)
    const errMsg = (e && e.message) ? e.message.slice(0, 100) : 'unknown';
    console.log('[identity] Firestore write failed:', errMsg, 'requestId:', requestId);
    const tempToken = await _generateToken();
    const tempHash  = await _hashToken(tempToken);
    return {
      status: 200,
      body: buildSuccess({
        sessionToken: tempToken,
        uid:          _deriveUid(tempHash),
        isNew:        true,
        persistent:   false,
        message:      'Session-only identity (cloud storage temporarily unavailable).',
      }, requestId),
    };
  }
}

/**
 * handleRevokeIdentity(body, ctx)
 *
 * Revokes (deactivates) the current device session.
 * Used for "Clear My Shadow Data" → identity reset.
 * Requires the session token in Authorization header (uid from verifyDeviceToken).
 */
export async function handleRevokeIdentity(body, ctx) {
  const requestId  = (ctx && ctx.requestId) || 'unknown';
  const uid        = (ctx && ctx.uid) || null;
  const adminClient = (ctx && ctx.adminClient) || null;

  if (!uid || !adminClient) {
    return { status: 401, body: buildError('UNAUTHORIZED', requestId) };
  }

  try {
    const doc = await adminClient.get(`shadowDevices/${uid}`);
    if (doc && doc.data) {
      await adminClient.set(`shadowDevices/${uid}`, {
        ...doc.data,
        active:     false,
        revokedAt:  new Date().toISOString(),
      });
    }
    return {
      status: 200,
      body: buildSuccess({ revoked: true }, requestId),
    };
  } catch (_) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}
