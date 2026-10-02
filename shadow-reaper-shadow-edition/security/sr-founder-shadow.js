/**
 * shadow-reaper-standalone/security/sr-founder-shadow.js
 * Shadow Reaper Standalone — FOUNDER_SHADOW Capability Service
 *
 * Build: SR-STANDALONE-FOUNDER-SHADOW-1
 *
 * Exposes: window.SRFounderShadow
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE:
 *   Central capability resolver for the Founder's private "Shadow" personal
 *   assistant layer.  ONE authoritative place that decides whether the current
 *   session holds FOUNDER_SHADOW = true.
 *
 *   All Founder-Shadow UI controls and action boundaries consult this module.
 *   Nothing else should duplicate the Founder check.
 *
 * CAPABILITY MODEL:
 *   AuthenticatedUser
 *       ↓
 *   Firebase ID Token (server-side custom claim: role === "founder")
 *       ↓
 *   SRFounderShadow.resolveCapability(callback)
 *       ↓
 *   FOUNDER_SHADOW = true | false
 *       ↓
 *   Shadow UI visible  +  Shadow actions permitted
 *
 * SECURITY CONTRACT:
 *   - The capability is FALSE by default (fail-closed).
 *   - Email address is NEVER used as an authorization check.
 *   - localStorage "isFounder=true" does NOT grant the capability.
 *   - DOM manipulation does NOT grant the capability.
 *   - The capability resolves to true ONLY when:
 *       (a) A Firebase user is authenticated (real UID available), AND
 *       (b) The live Firebase ID token carries role === "founder"
 *           (set exclusively by Admin SDK — never by client code).
 *   - If authentication expires or is unavailable → false.
 *   - If the role lookup fails → false.
 *   - Client-side checks here are defense-in-depth + UX only.
 *     Firestore Security Rules are the authoritative server-side gate.
 *
 * TRUSTED DEVICE FOUNDATION:
 *   The capability model is designed to later require:
 *     FOUNDER_SHADOW + TRUSTED_DEVICE + required Android permissions
 *   for high-privilege native/background functionality.
 *   The _trustedDeviceReady() method is the extension point.
 *   Until fully implemented it returns false (safe default).
 *
 * SAME BRAIN:
 *   FOUNDER_SHADOW does NOT create a second AI.
 *   Shadow is the Founder's personal wake-name/assistant layer.
 *   It routes through the identical ShadowReaper.ask() pipeline.
 *   There is ONE authoritative Shadow Reaper intelligence system.
 *
 * PRIVACY:
 *   FOUNDER_SHADOW is a capability flag — it controls Founder functionality.
 *   It is NOT a backdoor into any user's private data.
 *   UID isolation for conversations / memory / adaptive data is UNCHANGED.
 *
 * ⚠️  DO NOT use email as an authorization gate.
 * ⚠️  DO NOT add:  if (email === "...") { allowFounderAccess(); }
 * ⚠️  DO NOT use localStorage isFounder=true as authoritative.
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-FOUNDER-SHADOW-1';

  // ─── Capability states ────────────────────────────────────────────────────
  var CAPABILITY = {
    GRANTED:          'FOUNDER_SHADOW_GRANTED',
    DENIED:           'FOUNDER_SHADOW_DENIED',
    PENDING:          'FOUNDER_SHADOW_PENDING',           // Firebase not configured yet
    ENROLLMENT_NEEDED:'FOUNDER_SHADOW_ENROLLMENT_NEEDED', // Auth exists, no claim
    AUTH_REQUIRED:    'FOUNDER_SHADOW_AUTH_REQUIRED',     // Not signed in
  };

  // ─── In-memory resolved capability state ─────────────────────────────────
  // Default: DENIED (fail-closed).
  // Updated only by resolveCapability().
  var _resolved     = false;          // FOUNDER_SHADOW boolean result
  var _resolveState = CAPABILITY.DENIED;
  var _resolveTs    = 0;              // epoch ms of last successful resolution
  var _onChangeCbs  = [];

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _fb()  { return global.SRFirebaseAdapter || null; }
  function _uid() { var fb = _fb(); return (fb && typeof fb.getUID === 'function') ? fb.getUID() : null; }

  // ─── Fail-closed: any failure → DENIED ───────────────────────────────────
  function _deny(state) {
    _resolved     = false;
    _resolveState = state || CAPABILITY.DENIED;
    _resolveTs    = 0;
    _notifyChange(false);
  }

  function _grant() {
    _resolved     = true;
    _resolveState = CAPABILITY.GRANTED;
    _resolveTs    = Date.now();
    _notifyChange(true);
  }

  // ─── Resolve FOUNDER_SHADOW capability (async) ────────────────────────────
  /**
   * resolveCapability(callback)
   *
   * Asynchronously determines whether the current session holds FOUNDER_SHADOW.
   *
   * callback(result):
   *   result.capability:  one of CAPABILITY values
   *   result.granted:     boolean — FOUNDER_SHADOW true/false
   *   result.uid:         authenticated UID if available
   *   result.message:     human-readable status (safe to log)
   *
   * Fail-closed: any error or uncertainty → granted = false.
   */
  function resolveCapability(callback) {
    callback = callback || function () {};

    // ── Step 1: Firebase adapter available? ──────────────────────────────────
    var fb = _fb();
    if (!fb) {
      _deny(CAPABILITY.PENDING);
      callback({ capability: CAPABILITY.PENDING, granted: false, uid: null,
                 message: 'Firebase adapter not loaded — FOUNDER_SHADOW pending Firebase setup.' });
      return;
    }

    // ── Step 2: Is user authenticated? ───────────────────────────────────────
    if (!fb.isAuthenticated()) {
      _deny(CAPABILITY.AUTH_REQUIRED);
      callback({ capability: CAPABILITY.AUTH_REQUIRED, granted: false, uid: null,
                 message: 'No authenticated session — FOUNDER_SHADOW denied.' });
      return;
    }

    // ── Step 3: Get user object ───────────────────────────────────────────────
    var user = (typeof fb.getCurrentUser === 'function') ? fb.getCurrentUser() : null;
    if (!user) {
      _deny(CAPABILITY.AUTH_REQUIRED);
      callback({ capability: CAPABILITY.AUTH_REQUIRED, granted: false, uid: null,
                 message: 'Auth session exists but user object unavailable — fail-closed.' });
      return;
    }

    // ── Step 4: Read live Firebase ID token for role claim ────────────────────
    // This is the ONLY check that matters.  The claim is set by the Admin SDK
    // (server-side) and cannot be forged by client JavaScript.
    if (typeof user.getIdTokenResult === 'function') {
      // forceRefresh: false — use cached token unless expired (< 1 hr old)
      user.getIdTokenResult(false).then(function (tokenResult) {
        var hasFounderClaim = !!(
          tokenResult.claims && tokenResult.claims.role === 'founder'
        );

        if (hasFounderClaim) {
          _grant();
          callback({
            capability: CAPABILITY.GRANTED,
            granted:    true,
            uid:        user.uid,
            message:    'FOUNDER_SHADOW granted via authenticated Founder claim.',
          });
        } else {
          _deny(CAPABILITY.ENROLLMENT_NEEDED);
          callback({
            capability: CAPABILITY.ENROLLMENT_NEEDED,
            granted:    false,
            uid:        user.uid,
            message:    'Authenticated but Founder claim not present — FOUNDER_SHADOW denied. ' +
                        'Run the Admin SDK enrollment script. See FOUNDER-ENROLLMENT-GUIDE.md.',
          });
        }
      }).catch(function () {
        // Token fetch failed → fail-closed
        _deny(CAPABILITY.DENIED);
        callback({
          capability: CAPABILITY.DENIED,
          granted:    false,
          uid:        user.uid,
          message:    'ID token check failed — FOUNDER_SHADOW denied (fail-closed).',
        });
      });

    } else {
      // No getIdTokenResult — Firebase SDK not fully loaded; fail-closed
      _deny(CAPABILITY.DENIED);
      callback({
        capability: CAPABILITY.DENIED,
        granted:    false,
        uid:        user.uid,
        message:    'Cannot verify Founder claim without getIdTokenResult — fail-closed.',
      });
    }
  }

  // ─── Synchronous cached read (UI-speed check only) ────────────────────────
  /**
   * isGranted()
   *
   * Returns the LAST resolved FOUNDER_SHADOW value.
   * This is the result of the most recent resolveCapability() call.
   *
   * IMPORTANT:
   *   - This is for UI visibility speed ONLY (avoiding async flash).
   *   - Privileged ACTIONS must always call resolveCapability() (async).
   *   - Never use isGranted() as the sole gate for a privileged operation.
   *   - If resolveCapability() has never been called: returns false (safe default).
   */
  function isGranted() {
    return _resolved === true;
  }

  // ─── Revoke in-memory capability (on auth-state change / sign-out) ─────────
  /**
   * revoke()
   * Clears the in-memory resolved capability immediately.
   * Called when auth state changes (sign-out, token expiry).
   */
  function revoke() {
    _deny(CAPABILITY.AUTH_REQUIRED);
  }

  // ─── Trusted Device Foundation ─────────────────────────────────────────────
  /**
   * isTrustedDeviceReady()
   *
   * Extension point for the future requirement:
   *   FOUNDER_SHADOW + TRUSTED_DEVICE + required Android permissions
   *
   * Currently returns false (not yet fully implemented).
   * Do NOT use this to gate functionality until the trusted-device enrollment
   * system is fully operational.
   *
   * When trusted-device enrollment is complete:
   *   SRFounderSecurity.enrollDevice() registers the device client-side.
   *   Server-side validation with a signed token is the real gate.
   */
  function isTrustedDeviceReady() {
    // Delegate to SRFounderSecurity if available (it has device enrollment logic)
    var sec = global.SRFounderSecurity;
    if (sec && typeof sec._isTrustedDevice === 'function') {
      return sec._isTrustedDevice();
    }
    return false;  // Safe default: not trusted until verified
  }

  // ─── Verify a Founder Shadow action (async — use before any privileged op) ─
  /**
   * verifyAction(actionName, callback)
   *
   * Full async verification gate for any Founder Shadow action.
   * Must be called at the ACTION boundary — not just checked in the UI.
   *
   * callback(result):
   *   result.ok:       boolean
   *   result.reason:   string  — why denied (if !ok)
   *   result.granted:  boolean — same as result.ok
   *
   * Usage:
   *   SRFounderShadow.verifyAction('VOICE_ASSISTANT_ENABLE', function(r) {
   *     if (!r.ok) { /* deny * / return; }
   *     // proceed
   *   });
   */
  function verifyAction(actionName, callback) {
    callback = callback || function () {};

    resolveCapability(function (result) {
      if (!result.granted) {
        callback({
          ok:      false,
          granted: false,
          reason:  'FOUNDER_SHADOW not granted: ' + result.capability +
                   ' — action denied: ' + (actionName || 'UNKNOWN'),
        });
        return;
      }
      callback({
        ok:      true,
        granted: true,
        reason:  'FOUNDER_SHADOW granted',
        action:  actionName || 'UNKNOWN',
      });
    });
  }

  // ─── Change notification ──────────────────────────────────────────────────
  function onChange(cb) {
    if (typeof cb === 'function') _onChangeCbs.push(cb);
    return function () {
      _onChangeCbs = _onChangeCbs.filter(function (x) { return x !== cb; });
    };
  }

  function _notifyChange(granted) {
    _onChangeCbs.forEach(function (cb) {
      try { cb(granted); } catch (_) {}
    });
  }

  // ─── Status (safe to read — no secrets) ───────────────────────────────────
  function getStatus() {
    return {
      build:              BUILD_ID,
      capability:         'FOUNDER_SHADOW',
      resolved:           _resolved,
      resolveState:       _resolveState,
      resolvedAt:         _resolveTs ? new Date(_resolveTs).toISOString() : null,
      isGranted:          _resolved,
      trustedDeviceReady: isTrustedDeviceReady(),
      // uid intentionally omitted — not needed in status
    };
  }

  // ─── Expose — window.SRFounderShadow ─────────────────────────────────────
  global.SRFounderShadow = {
    build:               BUILD_ID,
    CAPABILITY:          CAPABILITY,

    resolveCapability:   resolveCapability,
    isGranted:           isGranted,
    revoke:              revoke,
    verifyAction:        verifyAction,
    isTrustedDeviceReady:isTrustedDeviceReady,
    onChange:            onChange,
    getStatus:           getStatus,
  };

})(typeof window !== 'undefined' ? window : global);
