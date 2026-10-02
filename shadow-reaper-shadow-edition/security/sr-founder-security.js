/**
 * shadow-reaper-standalone/security/sr-founder-security.js
 * Shadow Reaper Standalone — Founder Security Fortress
 *
 * Build: SR-STANDALONE-FOUNDER-SECURITY-1
 *
 * Exposes: window.SRFounderSecurity
 *
 * PURPOSE:
 *   Multi-layer Founder authentication and access control system.
 *   Provides security event logging, device trust management, session
 *   management, suspicious-login detection, and rate limiting.
 *
 * ARCHITECTURE:
 *   Layer 1: Founder primary authentication (Firebase Auth)
 *   Layer 2: Strong MFA / trusted-device verification
 *   Layer 3: Step-up verification for unknown devices or sensitive actions
 *
 * SECURITY PRINCIPLES:
 *   - Founder identity based on server-side role custom claim (role == 'founder')
 *   - Discovering a Founder URL/endpoint does NOT grant access
 *   - Every privileged operation requires server-side authorization
 *   - Unknown devices require step-up verification
 *   - SMS is NOT the only MFA factor — authenticator/passkey/security-key preferred
 *   - All security events are logged with metadata
 *   - Rapid alerts sent for critical events
 *   - Emergency session revocation available
 *   - Brute-force protection via rate limiting
 *
 * NO PRIVATE-USER BACKDOOR:
 *   Founder controls NEVER grant access to private user conversations,
 *   memories, or adaptive learning data.
 *
 * NOTE: Client-side checks are defense-in-depth only.
 *   Firestore Security Rules enforce role='founder' server-side.
 *   This module adds UI/UX protection and event logging on top of that.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-FOUNDER-SECURITY-1';

  // ─── Security event types ─────────────────────────────────────────────────
  var EVENT = {
    UNKNOWN_DEVICE_ATTEMPT:       'UNKNOWN_DEVICE_ATTEMPT',
    REPEATED_FAILED_LOGIN:        'REPEATED_FAILED_LOGIN',
    MFA_FAILURE:                  'MFA_FAILURE',
    SUSPICIOUS_SESSION:           'SUSPICIOUS_SESSION',
    PERMISSION_ESCALATION_ATTEMPT:'PERMISSION_ESCALATION_ATTEMPT',
    BLOCKED_ADMIN_API:            'BLOCKED_ADMIN_API',
    SECURITY_SETTING_CHANGE:      'SECURITY_SETTING_CHANGE',
    EMERGENCY_EVENT:              'EMERGENCY_EVENT',
    FOUNDER_LOGIN_SUCCESS:        'FOUNDER_LOGIN_SUCCESS',
    FOUNDER_SESSION_REVOKED:      'FOUNDER_SESSION_REVOKED',
    HIGH_RISK_ACTION_ATTEMPT:     'HIGH_RISK_ACTION_ATTEMPT',
    HIGH_RISK_ACTION_APPROVED:    'HIGH_RISK_ACTION_APPROVED',
    DEVICE_ENROLLED:              'DEVICE_ENROLLED',
    DEVICE_REVOKED:               'DEVICE_REVOKED',
  };

  // ─── High-risk actions requiring step-up verification ─────────────────────
  var HIGH_RISK_ACTIONS = [
    'CHANGE_FOUNDER_IDENTITY',
    'DISABLE_SECURITY_CONTROLS',
    'CHANGE_FIREBASE_CONFIG',
    'GLOBAL_DATA_MANAGEMENT',
    'CHANGE_GLOBAL_LEARNING_SECURITY',
    'CHANGE_RESEARCH_SECURITY',
    'EMERGENCY_ACCOUNT_CONTROLS',
  ];

  // ─── State ────────────────────────────────────────────────────────────────
  var _sessionStartTime   = null;
  var _failedAttempts     = 0;
  var _MAX_FAILED_ATTEMPTS = 5;
  var _LOCKOUT_DURATION_MS = 15 * 60 * 1000;  // 15 minutes
  var _lockedUntil        = null;
  var _securityLog        = [];  // in-memory security event log (max 500 entries)
  var _MAX_LOG_ENTRIES    = 500;
  var _alertCallbacks     = [];
  var _trustedDeviceId    = null;

  // ─── Device fingerprint (browser-side approximation) ─────────────────────
  // This is a client-side heuristic only. Real trusted-device verification
  // requires server-side device enrollment with a signed token.
  function _getDeviceFingerprint() {
    var nav = global.navigator || {};
    var parts = [
      nav.userAgent || '',
      nav.language  || '',
      (global.screen ? global.screen.width + 'x' + global.screen.height : ''),
      nav.platform  || '',
    ];
    return parts.join('|');
  }

  function _getDeviceId() {
    try {
      var stored = global.localStorage && global.localStorage.getItem('_sreFounderDeviceId');
      if (stored) return stored;
      var id = 'device_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      if (global.localStorage) global.localStorage.setItem('_sreFounderDeviceId', id);
      return id;
    } catch (_) {
      return 'unknown_device';
    }
  }

  function _isTrustedDevice() {
    // Client-side: check if this device ID is in the trusted list
    // Real enforcement is server-side (device enrollment with signed token)
    try {
      var trusted = global.localStorage && global.localStorage.getItem('_sreTrustedDevices');
      if (!trusted) return false;
      var list = JSON.parse(trusted);
      var currentId = _getDeviceId();
      return Array.isArray(list) && list.indexOf(currentId) !== -1;
    } catch (_) {
      return false;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _fb()   { return global.SRFirebaseAdapter || null; }
  function _uid()  { var fb = _fb(); return fb ? fb.getUID() : null; }

  function _isFounder() {
    // Client-side pre-check: attempts to read Firebase token claims.
    // This is BEST-EFFORT only — server-side Firestore rules are authoritative.
    try {
      var fb = _fb();
      if (!fb) return false;
      var user = fb.getCurrentUser ? fb.getCurrentUser() : null;
      if (!user) return false;
      // Synchronous check of cached token result (async in production)
      if (user._founderClaim === true) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  // ─── Rate limiting ────────────────────────────────────────────────────────
  function _isLockedOut() {
    if (!_lockedUntil) return false;
    if (Date.now() < _lockedUntil) return true;
    // Lockout expired
    _lockedUntil    = null;
    _failedAttempts = 0;
    return false;
  }

  function _recordFailedAttempt() {
    _failedAttempts++;
    if (_failedAttempts >= _MAX_FAILED_ATTEMPTS) {
      _lockedUntil = Date.now() + _LOCKOUT_DURATION_MS;
      _logEvent(EVENT.REPEATED_FAILED_LOGIN, {
        attempts: _failedAttempts,
        lockedUntil: new Date(_lockedUntil).toISOString(),
      });
      _sendAlert(EVENT.REPEATED_FAILED_LOGIN, {
        attempts:   _failedAttempts,
        deviceId:   _getDeviceId(),
        lockoutMin: Math.round(_LOCKOUT_DURATION_MS / 60000),
      });
    }
  }

  // ─── Security event log ───────────────────────────────────────────────────
  function _logEvent(eventType, metadata) {
    var entry = {
      id:        'sec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      eventType: eventType,
      timestamp: new Date().toISOString(),
      deviceId:  _getDeviceId(),
      // Approximate network/security metadata (UA-based — no private data)
      deviceCategory: _getPlatformCategory(),
      metadata:  metadata || {},
      // NEVER include secrets, tokens, or credentials in logs
    };
    _securityLog.unshift(entry);
    if (_securityLog.length > _MAX_LOG_ENTRIES) {
      _securityLog = _securityLog.slice(0, _MAX_LOG_ENTRIES);
    }
    return entry;
  }

  function _getPlatformCategory() {
    var ua = (global.navigator ? global.navigator.userAgent : '') || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/mobile/i.test(ua)) return 'mobile_browser';
    return 'desktop_browser';
  }

  // ─── Alert system ─────────────────────────────────────────────────────────
  function _sendAlert(eventType, data) {
    var alert = {
      eventType:    eventType,
      timestamp:    new Date().toISOString(),
      deviceId:     _getDeviceId(),
      deviceCategory: _getPlatformCategory(),
      blockedResult: data && data.blocked !== undefined ? data.blocked : 'BLOCKED',
      securityEventId: 'sec_' + Date.now(),
      // Never includes: secrets, tokens, passwords, credentials
    };

    // Notify registered callbacks (in-app alerts)
    _alertCallbacks.forEach(function (cb) {
      try { cb(alert); } catch (_) {}
    });

    // TODO: Persist alert to Firestore for Founder review
    // (Requires authenticated Founder session — done server-side)
    // TODO: Email backup alert channel (requires server function)
  }

  // ─── Register alert callback ──────────────────────────────────────────────
  function onAlert(cb) {
    if (typeof cb === 'function') _alertCallbacks.push(cb);
    return function () {
      _alertCallbacks = _alertCallbacks.filter(function (x) { return x !== cb; });
    };
  }

  // ─── Verify Founder access attempt ────────────────────────────────────────
  /**
   * verifyFounderAccess(options, callback)
   *
   * Full Founder access verification pipeline:
   *   1. Check lockout (rate limiting)
   *   2. Check authentication (Firebase token)
   *   3. Check Founder role (custom claim)
   *   4. Check device trust status
   *   5. If unknown device: require step-up verification
   *
   * options:
   *   requireFreshAuth: boolean — require fresh sign-in (< 5 minutes ago)
   *   requireTrustedDevice: boolean — reject if device is not enrolled
   *   action: string — action being attempted (for logging)
   *
   * callback(result):
   *   result.ok: boolean
   *   result.reason: string
   *   result.requiresStepUp: boolean (if additional verification needed)
   *   result.eventId: string (security event ID for tracking)
   */
  function verifyFounderAccess(options, callback) {
    options  = options  || {};
    callback = callback || function () {};

    // Step 1: Lockout check
    if (_isLockedOut()) {
      var lockEvent = _logEvent(EVENT.BLOCKED_ADMIN_API, { reason: 'rate_limited', action: options.action });
      _sendAlert(EVENT.BLOCKED_ADMIN_API, { blocked: true, reason: 'lockout' });
      callback({ ok: false, reason: 'rate_limited_lockout', eventId: lockEvent.id });
      return;
    }

    // Step 2: Authentication check
    var fb = _fb();
    if (!fb || !fb.isAuthenticated()) {
      _recordFailedAttempt();
      var authEvent = _logEvent(EVENT.BLOCKED_ADMIN_API, { reason: 'not_authenticated', action: options.action });
      callback({ ok: false, reason: 'not_authenticated', eventId: authEvent.id });
      return;
    }

    // Step 3: Founder role check (async via ID token)
    var user = fb.getCurrentUser ? fb.getCurrentUser() : null;
    if (!user) {
      _recordFailedAttempt();
      var noUserEvent = _logEvent(EVENT.BLOCKED_ADMIN_API, { reason: 'no_user', action: options.action });
      callback({ ok: false, reason: 'no_user', eventId: noUserEvent.id });
      return;
    }

    // Async token claim check
    if (typeof user.getIdTokenResult === 'function') {
      user.getIdTokenResult().then(function (tokenResult) {
        if (!tokenResult.claims || tokenResult.claims.role !== 'founder') {
          _recordFailedAttempt();
          var roleEvent = _logEvent(EVENT.PERMISSION_ESCALATION_ATTEMPT, {
            uid: user.uid,
            attemptedAction: options.action || 'FOUNDER_ACCESS',
            claimPresent: false,
          });
          _sendAlert(EVENT.PERMISSION_ESCALATION_ATTEMPT, {
            uid: user.uid,
            blocked: true,
          });
          callback({ ok: false, reason: 'not_founder_role', eventId: roleEvent.id });
          return;
        }

        // Step 4: Device trust check
        var isKnownDevice = _isTrustedDevice();
        if (!isKnownDevice) {
          var deviceEvent = _logEvent(EVENT.UNKNOWN_DEVICE_ATTEMPT, {
            uid:    user.uid,
            action: options.action || 'FOUNDER_ACCESS',
          });
          _sendAlert(EVENT.UNKNOWN_DEVICE_ATTEMPT, {
            uid:       user.uid,
            deviceId:  _getDeviceId(),
            blocked:   options.requireTrustedDevice ? true : 'step_up_required',
          });

          if (options.requireTrustedDevice) {
            callback({ ok: false, reason: 'untrusted_device', requiresStepUp: true, eventId: deviceEvent.id });
            return;
          }

          // Unknown device: allow with step-up flag
          callback({
            ok:              true,
            requiresStepUp:  true,
            isKnownDevice:   false,
            reason:          'unknown_device_step_up_required',
            eventId:         deviceEvent.id,
          });
          return;
        }

        // Step 5: Fresh auth check (for high-risk actions)
        if (options.requireFreshAuth) {
          var tokenAge = tokenResult.issuedAtTime
            ? (Date.now() - new Date(tokenResult.issuedAtTime).getTime())
            : Infinity;
          if (tokenAge > 5 * 60 * 1000) {
            var freshEvent = _logEvent(EVENT.HIGH_RISK_ACTION_ATTEMPT, {
              uid:    user.uid,
              action: options.action,
              tokenAgeMin: Math.round(tokenAge / 60000),
            });
            callback({ ok: false, reason: 'fresh_auth_required', requiresReAuth: true, eventId: freshEvent.id });
            return;
          }
        }

        // All checks passed
        var successEvent = _logEvent(EVENT.FOUNDER_LOGIN_SUCCESS, {
          uid:           user.uid,
          action:        options.action || 'FOUNDER_ACCESS',
          isKnownDevice: isKnownDevice,
        });
        _failedAttempts = 0; // reset on success
        callback({ ok: true, isKnownDevice: true, eventId: successEvent.id });

      }).catch(function (err) {
        _recordFailedAttempt();
        var errEvent = _logEvent(EVENT.BLOCKED_ADMIN_API, { reason: 'token_error', error: err.message });
        callback({ ok: false, reason: 'token_verification_error', eventId: errEvent.id });
      });

    } else {
      // No getIdTokenResult — synchronous pre-check only (less secure)
      if (!_isFounder()) {
        _recordFailedAttempt();
        var syncEvent = _logEvent(EVENT.PERMISSION_ESCALATION_ATTEMPT, { reason: 'no_founder_claim_sync' });
        callback({ ok: false, reason: 'not_founder_role', eventId: syncEvent.id });
        return;
      }
      var knownDevice = _isTrustedDevice();
      var syncSuccess = _logEvent(EVENT.FOUNDER_LOGIN_SUCCESS, { action: options.action, syncCheck: true });
      callback({ ok: true, isKnownDevice: knownDevice, requiresStepUp: !knownDevice, eventId: syncSuccess.id });
    }
  }

  // ─── Verify high-risk action ──────────────────────────────────────────────
  /**
   * verifyHighRiskAction(actionType, callback)
   * High-risk actions require fresh authentication AND trusted device.
   * Returns ok: false, requiresFreshAuth: true if not recently authenticated.
   */
  function verifyHighRiskAction(actionType, callback) {
    callback = callback || function () {};

    if (HIGH_RISK_ACTIONS.indexOf(actionType) === -1) {
      callback({ ok: false, reason: 'action_not_in_high_risk_list', action: actionType });
      return;
    }

    _logEvent(EVENT.HIGH_RISK_ACTION_ATTEMPT, { action: actionType });

    verifyFounderAccess({
      requireFreshAuth:     true,
      requireTrustedDevice: true,
      action:               actionType,
    }, function (result) {
      if (result.ok) {
        _logEvent(EVENT.HIGH_RISK_ACTION_APPROVED, { action: actionType });
      }
      callback(result);
    });
  }

  // ─── Device enrollment ────────────────────────────────────────────────────
  function enrollDevice(callback) {
    callback = callback || function () {};
    var deviceId = _getDeviceId();

    try {
      var stored = global.localStorage && global.localStorage.getItem('_sreTrustedDevices');
      var list = stored ? JSON.parse(stored) : [];
      if (list.indexOf(deviceId) === -1) list.push(deviceId);
      if (global.localStorage) global.localStorage.setItem('_sreTrustedDevices', JSON.stringify(list));
      _logEvent(EVENT.DEVICE_ENROLLED, { deviceId: deviceId });
      callback({ ok: true, deviceId: deviceId });
    } catch (e) {
      callback({ ok: false, reason: e.message });
    }
  }

  function revokeDevice(deviceIdToRevoke, callback) {
    callback = callback || function () {};
    try {
      var stored = global.localStorage && global.localStorage.getItem('_sreTrustedDevices');
      var list = stored ? JSON.parse(stored) : [];
      list = list.filter(function (id) { return id !== deviceIdToRevoke; });
      if (global.localStorage) global.localStorage.setItem('_sreTrustedDevices', JSON.stringify(list));
      _logEvent(EVENT.DEVICE_REVOKED, { revokedDeviceId: deviceIdToRevoke });
      callback({ ok: true });
    } catch (e) {
      callback({ ok: false, reason: e.message });
    }
  }

  // ─── Emergency session revocation ─────────────────────────────────────────
  /**
   * emergencyRevokeSession(callback)
   * Logs out the current Founder session immediately.
   * Server-side: Firebase Auth revoke refresh token (must be done via Admin SDK / Cloud Function).
   * Client-side: signs out of Firebase Auth.
   */
  function emergencyRevokeSession(callback) {
    callback = callback || function () {};
    _logEvent(EVENT.FOUNDER_SESSION_REVOKED, { emergency: true });
    _sendAlert(EVENT.EMERGENCY_EVENT, { action: 'EMERGENCY_SESSION_REVOKE', blocked: false });

    var fb = _fb();
    if (fb && typeof fb._auth !== 'undefined' && fb._auth && fb._auth.signOut) {
      fb._auth.signOut()
        .then(function () { callback({ ok: true }); })
        .catch(function (e) { callback({ ok: false, reason: e.message }); });
      return;
    }
    // Fallback: clear local storage Founder data
    try {
      if (global.localStorage) {
        global.localStorage.removeItem('_sreFounderDeviceId');
        global.localStorage.removeItem('_sreTrustedDevices');
      }
    } catch (_) {}
    callback({ ok: true, warning: 'local_session_cleared_only' });
  }

  // ─── Get security log ─────────────────────────────────────────────────────
  function getSecurityLog(limit) {
    limit = limit || 50;
    return _securityLog.slice(0, limit);
  }

  function clearSecurityLog() {
    _securityLog = [];
  }

  // ─── Status ───────────────────────────────────────────────────────────────
  function getStatus() {
    return {
      build:            BUILD_ID,
      isLockedOut:      _isLockedOut(),
      failedAttempts:   _failedAttempts,
      lockedUntil:      _lockedUntil ? new Date(_lockedUntil).toISOString() : null,
      logEntries:       _securityLog.length,
      isKnownDevice:    _isTrustedDevice(),
      deviceId:         _getDeviceId(),
      highRiskActions:  HIGH_RISK_ACTIONS.slice(),
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRFounderSecurity = {
    build:              BUILD_ID,
    EVENT:              EVENT,
    HIGH_RISK_ACTIONS:  HIGH_RISK_ACTIONS,

    verifyFounderAccess:     verifyFounderAccess,
    verifyHighRiskAction:    verifyHighRiskAction,
    enrollDevice:            enrollDevice,
    revokeDevice:            revokeDevice,
    emergencyRevokeSession:  emergencyRevokeSession,
    onAlert:                 onAlert,
    getSecurityLog:          getSecurityLog,
    clearSecurityLog:        clearSecurityLog,
    getStatus:               getStatus,

    // Internal helpers exposed for testing
    _logEvent:        _logEvent,
    _isLockedOut:     _isLockedOut,
    _isTrustedDevice: _isTrustedDevice,
    _resetAttempts:   function () { _failedAttempts = 0; _lockedUntil = null; },
  };

})(typeof window !== 'undefined' ? window : global);
